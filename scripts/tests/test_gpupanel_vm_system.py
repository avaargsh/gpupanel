"""Fail-closed qemu:///system adoption contracts; no real libvirt mutation."""
import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gpupanel_vm_system_test", ROOT / "gpupanel-vm.py")
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)
UUID = "1f1e8ab1-0000-4000-8000-000000000003"


class FakeVirsh:
    def __init__(self, uri):
        self.uri = uri
        self.name = "important-system-vm"
        self.state = "shut off"
        self.operations = []
        self.exists = True

    def list(self):
        return [self.detail(UUID)] if self.exists else []

    def detail(self, identity):
        self.operations.append(("inspect", identity))
        if not self.exists:
            raise vm.Refused("not found")
        return {"uuid": identity, "name": self.name, "state": self.state,
                "connection": self.uri}

    def run(self, *args):
        self.operations.append(args)
        if args[0] == "list":
            return UUID if self.exists else ""
        if args[0] == "start":
            self.state = "running"
        elif args[0] == "shutdown":
            self.state = "shut off"
        elif args[0] == "undefine":
            self.exists = False
        return ""


class SystemVMTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.v = FakeVirsh("qemu:///system")

    def req(self, command, *, name=None, confirmation=None, acknowledge=False):
        return types.SimpleNamespace(command=command, uuid=UUID,
                                     confirm_name=name, confirm_system=confirmation,
                                     acknowledge_unknown=acknowledge)

    def enroll(self):
        return vm.manage(self.v, self.root, self.req(
            "enroll", name="important-system-vm", confirmation=vm.SYSTEM_CONFIRM))

    def test_system_connection_is_opt_in_and_file_scope_is_isolated(self):
        self.assertEqual(vm.scope_connection(False), "qemu:///session")
        self.assertEqual(vm.scope_connection(True), "qemu:///system")
        self.assertEqual(vm.scope_path(self.root, "qemu:///session"), self.root)
        self.assertEqual(vm.scope_path(self.root, "qemu:///system"), self.root / "system")

    def test_cannot_enroll_system_without_explicit_phrase(self):
        for value in (None, "yes", "MANAGE ALL VMS"):
            with self.subTest(value=value), self.assertRaises(vm.Refused):
                vm.manage(self.v, self.root, self.req("enroll", name=self.v.name, confirmation=value))
        self.assertEqual(self.v.operations, [])

    def test_enrollment_binds_system_uri_and_exact_uuid(self):
        result = self.enroll()
        self.assertTrue(result["enrolled"])
        item = vm.record(self.root, UUID, "qemu:///system")
        self.assertEqual(item["connection"], "qemu:///system")
        with self.assertRaisesRegex(vm.Refused, "connection"):
            vm.record(self.root, UUID, "qemu:///session")

    def test_legacy_session_record_never_enrolls_system(self):
        vm.atomic_json(self.root / (UUID + ".json"), {
            "schema": "gpupanel.vm.enrollment.v1", "uuid": UUID, "name": self.v.name})
        with self.assertRaises(vm.Refused):
            vm.record(self.root, UUID, "qemu:///system")
        self.assertEqual(vm.record(self.root, UUID, "qemu:///session")["name"], self.v.name)

    def test_system_journal_and_lock_reject_shared_permissions(self):
        self.enroll()
        journal = self.root / "operations.jsonl"
        vm.event(self.root, {"uuid": UUID, "op": "observe", "outcome": "observed"})
        journal.chmod(0o644)
        with self.assertRaises(vm.Refused):
            vm.manage(self.v, self.root, self.req("start"))
        self.assertFalse(any(c[0] == "start" for c in self.v.operations))
        journal.chmod(0o600)
        lock = self.root / ".lock"
        lock.chmod(0o666)
        with self.assertRaises(vm.Refused):
            vm.manage(self.v, self.root, self.req("start"))
        self.assertFalse(any(c[0] == "start" for c in self.v.operations))

    def test_cli_system_flag_selects_explicit_connection(self):
        created = []
        def factory(uri):
            created.append(uri)
            return FakeVirsh(uri)
        with patch.object(vm, "private_dir", return_value=self.root), patch.object(
                vm, "Virsh", side_effect=factory), patch("builtins.print"):
            self.assertEqual(vm.main(["--system", "list"]), 0)
            self.assertEqual(vm.main(["list"]), 0)
        self.assertEqual(created, ["qemu:///system", "qemu:///session"])

    def test_system_start_uses_same_uuid_without_storage_actions(self):
        self.enroll()
        output = vm.manage(self.v, self.root, self.req("start"))
        self.assertEqual(output["outcome"], "OBSERVED")
        self.assertIn(("start", UUID), self.v.operations)
        self.assertFalse(any(c[0] in ("destroy", "vol-delete", "pool-destroy")
                             for c in self.v.operations))

    def test_system_delete_requires_extra_ack_and_keeps_disks(self):
        self.enroll()
        with self.assertRaisesRegex(vm.Refused, "system"):
            vm.manage(self.v, self.root, self.req("delete", name=self.v.name))
        self.assertFalse(any(c[0] == "undefine" for c in self.v.operations))
        removed = vm.manage(self.v, self.root, self.req(
            "delete", name=self.v.name, confirmation=vm.SYSTEM_CONFIRM))
        self.assertEqual(removed["outcome"], "OBSERVED")
        self.assertIn(("undefine", UUID, "--keep-nvram"), self.v.operations)
        self.assertFalse(any("storage" in str(c) or "wipe" in str(c) for c in self.v.operations))

    def test_wrong_uri_in_existing_record_blocks_system_mutation(self):
        vm.atomic_json(self.root / (UUID + ".json"), {
            "schema": "gpupanel.vm.enrollment.v2", "uuid": UUID,
            "name": self.v.name, "connection": "qemu:///session"})
        with self.assertRaisesRegex(vm.Refused, "connection"):
            vm.manage(self.v, self.root, self.req("start"))
        self.assertEqual(self.v.operations, [])

    def test_system_reconcile_unknown_requires_explicit_acknowledgement(self):
        self.enroll()
        vm.event(self.root, {"uuid": UUID, "op": "reboot", "outcome": "unknown"})
        with self.assertRaisesRegex(vm.Refused, "acknowledge"):
            vm.manage(self.v, self.root, self.req("reconcile"))
        self.assertTrue(vm.unresolved(self.root, UUID))
        output = vm.manage(self.v, self.root, self.req("reconcile", acknowledge=True))
        self.assertEqual(output["outcome"], "ACKNOWLEDGED_UNVERIFIED")
        self.assertFalse(output["reconciled"])

    def test_start_crashed_does_not_claim_observed_success(self):
        self.enroll()
        original_run = self.v.run

        def crash_on_start(*args):
            result = original_run(*args)
            if args[0] == "start":
                self.v.state = "crashed"
            return result

        self.v.run = crash_on_start
        result = vm.manage(self.v, self.root, self.req("start"))
        self.assertNotEqual(result["outcome"], "OBSERVED")
        self.assertTrue(vm.unresolved(self.root, UUID))

    def test_shutdown_paused_does_not_claim_observed_success(self):
        self.enroll()
        self.v.state = "running"
        original_run = self.v.run

        def pause_on_shutdown(*args):
            result = original_run(*args)
            if args[0] == "shutdown":
                self.v.state = "paused"
            return result

        self.v.run = pause_on_shutdown
        result = vm.manage(self.v, self.root, self.req("shutdown"))
        self.assertEqual(result["outcome"], "PENDING")
        self.assertTrue(vm.unresolved(self.root, UUID))

    def test_unknown_start_not_automatically_cleared_by_unchanged_state(self):
        self.enroll()
        vm.event(self.root, {"uuid": UUID, "op": "start", "outcome": "unknown"})
        with self.assertRaisesRegex(vm.Refused, "acknowledge"):
            vm.manage(self.v, self.root, self.req("reconcile"))
        self.assertTrue(vm.unresolved(self.root, UUID))
        resolution = vm.manage(self.v, self.root, self.req("reconcile", acknowledge=True))
        self.assertEqual(resolution["outcome"], "ACKNOWLEDGED_UNVERIFIED")
        self.assertFalse(resolution.get("reconciled", False))
        self.assertFalse(vm.unresolved(self.root, UUID))

    def test_reboot_running_is_never_mistaken_for_independent_reboot_proof(self):
        self.enroll()
        self.v.state = "running"
        vm.event(self.root, {"uuid": UUID, "op": "reboot", "outcome": "pending"})
        result = vm.manage(self.v, self.root, self.req("reconcile", acknowledge=True))
        self.assertEqual(result["outcome"], "ACKNOWLEDGED_UNVERIFIED")
        self.assertNotIn("verified", result)

    def test_virsh_system_reads_readonly_writes_nonroot_without_sudo(self):
        with patch.object(vm.shutil, "which", return_value="/usr/bin/virsh"), patch.object(vm.subprocess, "run") as run:
            run.return_value.returncode = 0
            run.return_value.stdout = "qemu:///system\n"
            client = vm.Virsh(uri="qemu:///system")
            client.run("uri")
            read = run.call_args.args[0]
            client.run("start", UUID)
            write = run.call_args.args[0]
        self.assertIn("--readonly", read)
        self.assertNotIn("--readonly", write)
        self.assertEqual(read[read.index("--connect") + 1], "qemu:///system")
        self.assertEqual(write[write.index("--connect") + 1], "qemu:///system")
        self.assertNotIn("sudo", read + write)


if __name__ == "__main__":
    unittest.main()
