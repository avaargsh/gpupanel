"""VM same-UID worker contracts, with no real libvirt or system mutation."""
import importlib.util
import json
import os
from pathlib import Path
import socket
import tempfile
import threading
import unittest
from unittest.mock import patch

ENTRY = Path(__file__).resolve().parents[1] / "gpupanel-vm-worker.py"
spec = importlib.util.spec_from_file_location("gpupanel_vm_worker_test", ENTRY)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
UUID = "1f1e8ab1-0000-4000-8000-000000000003"


class FakeVM:
    class Refused(Exception):
        pass

    def __init__(self):
        self.reads = []
        self.mutations = []

    def valid_uuid(self, value):
        if value != UUID:
            raise self.Refused("Bad VM UUID")
        return value

    def Virsh(self, uri):
        self.reads.append(uri)
        return self

    def list(self):
        return [{"uuid": UUID, "state": "running", "name": "test-vm"}]

    def detail(self, identity):
        return {"uuid": identity, "state": "running", "name": "test-vm"}

    def private_dir(self, uri):
        return Path("/not-used-in-test")

    def manage(self, client, root, args):
        self.mutations.append((args.command, args.uuid, args.confirm_name))
        return {"uuid": args.uuid, "outcome": "PENDING", "operationId": "test"}


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.vm = FakeVM()
        self.uri = worker.SYSTEM

    def payload(self, op="list", identity=None, uri=None):
        return {"connection": uri or self.uri, "op": op, "uuid": identity}

    def test_actual_cli_is_available_without_running_it(self):
        cli = worker.load_vm()
        self.assertEqual(cli.URI, worker.SESSION)
        self.assertEqual(cli.SYSTEM_URI, worker.SYSTEM)
        self.assertTrue(callable(cli.manage))

    def test_list_and_show_are_readonly(self):
        result = worker.dispatch(self.vm, self.uri, self.payload(), False)
        self.assertEqual(result[0]["uuid"], UUID)
        detail = worker.dispatch(self.vm, self.uri, self.payload("show", UUID), False)
        self.assertEqual(detail["uuid"], UUID)
        self.assertEqual(self.vm.mutations, [])

    def test_scope_and_operation_allowlist_enforced_before_virsh(self):
        invalid = [self.payload(uri=worker.SESSION), self.payload("delete", UUID),
                   self.payload("enroll", UUID), self.payload("reconcile", UUID)]
        for request in invalid:
            with self.subTest(request=request), self.assertRaises(worker.Denied):
                worker.dispatch(self.vm, self.uri, request, True)
        self.assertEqual(self.vm.reads, [])

    def test_worker_mutations_are_disabled_by_default(self):
        for op in worker.MUTATION_OPS:
            with self.subTest(op=op), self.assertRaisesRegex(worker.Denied, "read-only"):
                worker.dispatch(self.vm, self.uri, self.payload(op, UUID), False)
        self.assertEqual(self.vm.mutations, [])

    def test_opt_in_mutations_use_existing_cli_guard_and_exact_uuid(self):
        for op in ("start", "shutdown", "reboot"):
            result = worker.dispatch(self.vm, self.uri, self.payload(op, UUID), True)
            self.assertEqual(result["outcome"], "PENDING")
        self.assertEqual(self.vm.mutations,
                         [("start", UUID, None), ("shutdown", UUID, None), ("reboot", UUID, None)])

    def test_invalid_uuid_never_reaches_virsh(self):
        for identity in ("../../wrong", "--connect=qemu:///system", None):
            with self.subTest(identity=identity), self.assertRaises((FakeVM.Refused, worker.Denied)):
                worker.dispatch(self.vm, self.uri, self.payload("start", identity), True)
        self.assertEqual(self.vm.reads, [])

    def test_strict_protocol_rejects_duplicates_extra_fields_and_oversize(self):
        valid = (json.dumps(self.payload()) + "\n").encode()
        self.assertEqual(worker.decode(valid), self.payload())
        for bad in (
            valid + valid,
            valid[:-1],
            b"x" * 1025,
            b'{"connection":"qemu:///system","connection":"qemu:///session","op":"list","uuid":null}\n',
            b'{"connection":"qemu:///system","op":"list","uuid":null,"shell":"id"}\n',
        ):
            with self.subTest(msg=bad[:80]), self.assertRaises(worker.Denied):
                worker.decode(bad)

    def test_kernel_peer_uid_is_read_directly_from_unix_socket(self):
        a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        with a, b:
            self.assertEqual(worker.peer_uid(a), os.geteuid())
            self.assertEqual(worker.peer_uid(b), os.geteuid())

    def test_other_uid_rejected_before_vm_provider_call(self):
        a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        with a, b:
            with patch.object(worker, "peer_uid", return_value=1002):
                worker.handle(a, 1001, self.vm, self.uri, True)
            result = json.loads(b.recv(1024))
            self.assertEqual(result["status"], "DENIED_OR_UNKNOWN")
            self.assertEqual(self.vm.reads, [])

    def test_same_uid_readonly_socket_roundtrip(self):
        a, b = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        with a, b:
            with patch.object(worker, "peer_uid", return_value=1001):
                thread = threading.Thread(target=lambda: worker.handle(a, 1001, self.vm, self.uri, False))
                thread.start()
                b.sendall((json.dumps(self.payload()) + "\n").encode())
                result = json.loads(b.recv(2048))
                thread.join(timeout=2)
            self.assertFalse(thread.is_alive())
            self.assertEqual(result["status"], "OK")
            self.assertEqual(result["data"][0]["uuid"], UUID)
            self.assertEqual(self.vm.mutations, [])

    def test_root_and_untrusted_runtime_directory_are_rejected(self):
        with self.assertRaises(worker.Denied):
            worker.runtime_dir(0, {"XDG_RUNTIME_DIR": "/run/user/0"})
        with self.assertRaises(worker.Denied):
            worker.runtime_dir(1001, {"XDG_RUNTIME_DIR": "/tmp/untrusted"})

    def test_failed_second_worker_never_unlinks_first_worker_socket(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "system.sock"
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as first:
                first.bind(str(path))
                first.listen(1)
                inode = path.stat().st_ino
                with patch.object(worker, "runtime_dir", return_value=Path(temp)), \
                     patch.object(worker, "socket_path", return_value=path):
                    with self.assertRaises(OSError):
                        worker.serve(self.vm, self.uri, False)
                self.assertTrue(path.exists(), "Worker deleted another process's live socket")
                self.assertEqual(path.stat().st_ino, inode)


if __name__ == "__main__":
    unittest.main()
