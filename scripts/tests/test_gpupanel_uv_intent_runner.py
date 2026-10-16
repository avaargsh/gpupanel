"""Security and actual offline-uv contract for an explicit local-user handoff."""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import Mock, patch
import uuid

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_local_runner_test",
                                              ROOT / "scripts/gpupanel-uv-intent-runner.py")
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


def intent_plan():
    project, workspace, request = [str(uuid.uuid4()) for _ in range(3)]
    expected = local.digest(project, workspace)
    return {
        "projectId": project, "workspaceId": workspace,
        "profile": local.FORMAT, "planDigest": expected,
        "workspaceState": "NotProvisioned", "executionAvailable": False,
        "blocker": "HostRunnerUnbound",
        "intent": {"id": request, "projectId": project,
                   "workspaceId": workspace, "profile": local.FORMAT,
                   "planDigest": expected, "state": local.STATE},
    }


class LocalRunnerTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.home = Path(tmp.name)
        self.source = self.home / "approved-plan.json"
        self.plan = intent_plan()
        self.write_plan()

    def write_plan(self, obj=None):
        self.source.write_text(json.dumps(self.plan if obj is None else obj))
        self.source.chmod(0o600)

    def test_core_digest_contract_and_untrusted_payload_rejection(self):
        p = local.read_intent_file(self.source)
        expected = hashlib.sha256(("GPUPanel-workspace-intent-v1\n" +
            self.plan["projectId"] + "\n" + self.plan["workspaceId"] +
            "\nuv-python-stdlib-offline-v1\n").encode()).hexdigest()
        self.assertEqual(p["planDigest"], expected)
        self.assertEqual(p["intentId"], self.plan["intent"]["id"])
        changes = (
            ("executionAvailable", True),
            ("workspaceState", "Provisioned"),
            ("blocker", "None"),
            ("profile", "shell-admin"),
            ("planDigest", "0" * 64),
            ("workspaceId", "../home"),
            ("intent", None),
        )
        for key, bad in changes:
            self.write_plan({**self.plan, key: bad})
            with self.subTest(key=key), self.assertRaises(local.IntentError):
                local.read_intent_file(self.source)
        self.write_plan()
        self.plan["intent"]["state"] = "Running"
        self.write_plan()
        with self.assertRaises(local.IntentError):
            local.read_intent_file(self.source)

    def test_core_envelope_accepted_but_non_success_rejected(self):
        original = intent_plan()
        self.write_plan({"code": 200, "message": "", "data": original})
        self.assertEqual(local.read_intent_file(self.source)["intentId"],
                         original["intent"]["id"])
        self.write_plan({"code": 403, "data": original})
        with self.assertRaises(local.IntentError):
            local.read_intent_file(self.source)

    def test_file_symlinks_duplicate_fields_and_oversized_refused(self):
        alias = self.home / "linked.json"
        alias.symlink_to(self.source)
        with self.assertRaises(local.IntentError):
            local.read_intent_file(alias)
        self.source.write_text('{"projectId":"a","projectId":"b"}')
        with self.assertRaises(local.IntentError):
            local.read_intent_file(self.source)
        self.source.write_bytes(b"x" * (local.MAX_INPUT + 1))
        with self.assertRaises(local.IntentError):
            local.read_intent_file(self.source)
        fifo = self.home / "intent.pipe"
        os.mkfifo(fifo)
        with self.assertRaises(local.IntentError):
            local.read_intent_file(fifo)

    def test_root_setuid_and_foreign_home_cannot_run(self):
        with patch.object(local.os, "getuid", return_value=0):
            with self.assertRaises(local.IntentError):
                local.identity_home()
        with patch.object(local.os, "getuid", return_value=1000), \
                patch.object(local.os, "geteuid", return_value=0):
            with self.assertRaises(local.IntentError):
                local.identity_home()
        with patch.object(local.os, "getuid", return_value=1000), \
                patch.object(local.os, "geteuid", return_value=1001):
            with self.assertRaises(local.IntentError):
                local.identity_home()

    def test_fixed_user_home_target_rejects_symlinked_intermediates(self):
        bound = local.read_intent_file(self.source)
        target = local.workspace_target(self.home, bound["workspaceId"])
        self.assertEqual(target, self.home / "GPUPanel" / "projects" /
                         ("workspace-" + bound["workspaceId"]))
        other = self.home / "outside"
        other.mkdir()
        (self.home / "GPUPanel").symlink_to(other, target_is_directory=True)
        with self.assertRaises(local.uv.ProjectError):
            local.workspace_target(self.home, bound["workspaceId"])
        self.assertEqual(list(other.iterdir()), [])

    def test_missing_uv_is_readonly_and_both_approvals_required(self):
        bound = local.read_intent_file(self.source)
        missing = local.inspect(bound, self.home, uv_path="")
        self.assertEqual(missing["status"], "MISSING_UV")
        self.assertFalse((self.home / "GPUPanel").exists())
        ready = local.inspect(bound, self.home, uv_path="/usr/bin/uv")
        self.assertEqual(ready["status"], "READY_FOR_APPROVAL")
        self.assertNotEqual(ready["uvPlanDigest"], ready["planDigest"])
        for ca, ua in [("", ready["uvPlanDigest"]),
                       (ready["planDigest"], ""), ("0" * 64, ready["uvPlanDigest"]),
                       (ready["planDigest"], "f" * 64)]:
            refused = local.apply(bound, self.home, ca, ua, uv_path="/usr/bin/uv")
            self.assertEqual(refused["status"], "APPROVAL_MISMATCH")
            self.assertFalse(refused["executed"])
            self.assertFalse((self.home / "GPUPanel").exists())

    def test_generator_failure_never_publishes_or_exposes_logs(self):
        bound = local.read_intent_file(self.source)
        ready = local.inspect(bound, self.home, uv_path="/usr/bin/uv")
        calls = []
        def fail(cmd, **kwargs):
            calls.append((cmd, kwargs))
            return Mock(returncode=8, stdout="", stderr="PRIVATE_TOKEN")
        with patch.object(local.os, "geteuid", return_value=1001):
            status = local.apply(bound, self.home, ready["planDigest"], ready["uvPlanDigest"],
                                 uv_path="/usr/bin/uv", runner=fail)
        self.assertEqual(status["status"], "UV_FAILED")
        self.assertNotIn("PRIVATE_TOKEN", str(status))
        self.assertFalse(local.workspace_target(self.home, bound["workspaceId"]).exists())
        self.assertEqual(calls[0][0][:2], ["/usr/bin/uv", "init"])
        self.assertIn("--offline", calls[0][0])

    def test_existing_work_data_never_adopted_or_overwritten(self):
        bound = local.read_intent_file(self.source)
        target = local.workspace_target(self.home, bound["workspaceId"])
        target.mkdir(parents=True)
        important = target / "user-code.py"
        important.write_text("precious")
        checked = local.inspect(bound, self.home, uv_path="/usr/bin/uv")
        self.assertEqual(checked["status"], "EXISTS_REQUIRES_REVIEW")
        self.assertEqual(checked["localUvState"], "UNMANAGED")
        refused = local.apply(bound, self.home, bound["planDigest"], "f" * 64,
                              uv_path="/usr/bin/uv")
        self.assertEqual(refused["status"], "EXISTS_REQUIRES_REVIEW")
        self.assertEqual(important.read_text(), "precious")

    @unittest.skipUnless(shutil.which("uv") and os.name == "posix",
                         "real offline uv requires installed uv on Linux")
    def test_real_uv_creation_and_independent_readback(self):
        bound = local.read_intent_file(self.source)
        preview = local.inspect(bound, self.home)
        self.assertEqual(preview["status"], "READY_FOR_APPROVAL")
        with patch.object(local.os, "geteuid", return_value=1001):
            done = local.apply(bound, self.home, preview["planDigest"],
                               preview["uvPlanDigest"])
        self.assertEqual(done["status"], "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED", done)
        self.assertEqual(done["coreWorkspaceState"], "NotProvisioned")
        claim = done["localEvidence"]
        self.assertEqual(done["trustState"], "OperatorReported")
        self.assertEqual(claim["intentId"], bound["intentId"])
        self.assertEqual(claim["planDigest"], bound["planDigest"])
        self.assertEqual(len(claim["receiptDigest"]), 64)
        digest = hashlib.sha256(("GPUPanel-local-evidence-v1\\n" +
            claim["intentId"] + "\\n" + claim["planDigest"] + "\\n" +
            claim["receiptDigest"] + "\\n").encode()).hexdigest()
        self.assertEqual(claim["evidenceDigest"], digest)
        target = local.workspace_target(self.home, bound["workspaceId"])
        self.assertEqual(local.uv.status(target, self.home)["status"], "VERIFIED")
        replay = local.inspect(bound, self.home)
        self.assertEqual(replay["status"], "EXISTS_REQUIRES_REVIEW")
        self.assertEqual(replay["localUvState"], "VERIFIED")
        (target / "main.py").write_text("print('my actual project')\n")
        self.assertEqual(local.inspect(bound, self.home)["localUvState"], "MODIFIED")
        with self.assertRaises(local.IntentError):
            local.operator_observation(bound, self.home)


if __name__ == "__main__":
    unittest.main()
