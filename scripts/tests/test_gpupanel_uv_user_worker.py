"""Same-UID worker: capability, exclusive durable attempt and socket fencing."""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import socket
import struct
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_user_worker_test",
                                              ROOT / "scripts/gpupanel-uv-user-worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.home = Path(tmp.name)
        self.runtime = self.home / "runtime"
        self.runtime.mkdir(mode=0o700)
        self.plan = {"projectId": str(uuid.uuid4()), "workspaceId": str(uuid.uuid4()),
                     "intentId": str(uuid.uuid4()), "planDigest": "a" * 64}
        self.token = "b" * 64

    def wire(self, action="execute", token=None, ident=None, **extra):
        return json.dumps({"action": action,
                           "intentId": ident or self.plan["intentId"],
                           "token": token or self.token, **extra}).encode()

    def test_reject_unauthorized_and_arbitrary_requests(self):
        for raw in (
            self.wire(token="c" * 64),
            self.wire(ident=str(uuid.uuid4())),
            self.wire(action="shell"),
            self.wire(command="python user.py"),
            b'{"action":"execute","action":"inspect"}',
            b"x" * 1025,
            b'[]',
        ):
            with self.subTest(raw=raw[:40]), self.assertRaises(worker.WorkerError):
                worker.checked_message(raw, self.token, self.plan["intentId"])
        self.assertEqual(worker.checked_message(self.wire("inspect"),
                                                self.token, self.plan["intentId"]), "inspect")

    def test_same_uid_gate_rejects_root_other_user_and_missing_credentials(self):
        class FakeConnection:
            def __init__(self, credentials): self.credentials = credentials
            def getsockopt(self, *_): return self.credentials
        uid = 1001
        self.assertTrue(worker.authorized_peer(FakeConnection(struct.pack("3i", 12, uid, uid)), uid))
        self.assertFalse(worker.authorized_peer(FakeConnection(struct.pack("3i", 12, 0, 0)), uid))
        self.assertFalse(worker.authorized_peer(FakeConnection(struct.pack("3i", 12, uid + 1, uid)), uid))
        self.assertFalse(worker.authorized_peer(FakeConnection(b"bad"), uid))

    def test_private_runtime_and_existing_socket_never_unlinked(self):
        path = worker.worker_socket(self.runtime, os.getuid())
        self.assertEqual(path.name, "uv-worker.sock")
        self.runtime.chmod(0o777)
        with self.assertRaises(worker.WorkerError):
            worker.worker_socket(self.runtime, os.getuid())
        self.runtime.chmod(0o700)
        subdir = self.runtime / "gpupanel"
        subdir.chmod(0o755)
        with self.assertRaises(worker.WorkerError):
            worker.worker_socket(self.runtime, os.getuid())
        subdir.chmod(0o700)
        path.write_text("existing-user-file")
        with self.assertRaises(OSError):
            worker.serve_once(self.plan, self.home, self.runtime, self.token,
                              "a" * 64, "uv", on_ready=lambda _: None)
        self.assertEqual(path.read_text(), "existing-user-file")

    def test_journal_prevents_replay_across_new_worker_instance(self):
        calls = []
        def fake_apply(*_):
            calls.append(1)
            return {"status": "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED",
                    "coreWorkspaceState": "NotProvisioned"}
        first = worker.dispatch(self.wire(), self.token, self.plan, self.home,
                                "a" * 64, "uv", fake_apply)
        self.assertEqual(first["status"], "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED")
        after_crash = worker.dispatch(self.wire(), self.token, self.plan, self.home,
                                      "a" * 64, "uv", fake_apply)
        self.assertEqual(after_crash["status"], "ATTEMPT_UNKNOWN_NO_REPLAY")
        self.assertEqual(calls, [1])
        marker = (self.home / "GPUPanel" / "workspace-attempts" /
                  (self.plan["intentId"] + ".json"))
        self.assertEqual(json.loads(marker.read_text())["state"], "UNKNOWN_UNTIL_REVIEW")
        self.assertEqual(marker.stat().st_mode & 0o777, 0o600)

    def test_exception_after_claim_stays_unknown_even_if_mutation_might_have_happened(self):
        def interrupted(*_): raise OSError("secret in local traceback")
        outcome = worker.dispatch(self.wire(), self.token, self.plan, self.home,
                                  "a" * 64, "uv", interrupted)
        self.assertEqual(outcome, {"status": "ATTEMPT_UNKNOWN_NO_REPLAY",
                                   "coreWorkspaceState": "NotProvisioned"})
        with self.assertRaises(worker.WorkerError):
            worker.checked_message(self.wire(token="0" * 64),
                                   self.token, self.plan["intentId"])
        self.assertTrue((self.home / "GPUPanel" / "workspace-attempts" /
                         (self.plan["intentId"] + ".json")).exists())

    def test_inspect_is_readonly_and_not_claimed(self):
        with patch.object(worker.local, "inspect", return_value={"status": "MISSING_UV",
                                                                 "executed": False}):
            result = worker.dispatch(self.wire("inspect"), self.token, self.plan,
                                     self.home, "a" * 64, "uv")
        self.assertEqual(result["status"], "MISSING_UV")
        self.assertFalse((self.home / "GPUPanel").exists())

    @unittest.skipIf(os.getuid() == 0, "real socket test needs a non-root runner")
    def test_real_local_socket_same_os_user_and_one_attempt(self):
        ready = threading.Event()
        done = []
        def fake_apply(*_):
            done.append(True)
            return {"status": "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED",
                    "coreWorkspaceState": "NotProvisioned"}
        thread = threading.Thread(target=lambda: worker.serve_once(
            self.plan, self.home, self.runtime, self.token,
            self.plan["planDigest"], "uv-digest",
            on_ready=lambda _: ready.set(), execute=fake_apply
        ), daemon=True)
        thread.start()
        self.assertTrue(ready.wait(5), "worker socket did not start")
        answer = worker.request_local(self.runtime, self.token, self.plan["intentId"], "execute")
        thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertEqual(answer["status"], "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED")
        self.assertEqual(done, [True])
        self.assertFalse((self.runtime / "gpupanel" / worker.SOCKET_NAME).exists())
        with self.assertRaises(worker.WorkerError):
            worker.request_local(self.runtime, self.token, self.plan["intentId"], "execute")


if __name__ == "__main__":
    unittest.main()
