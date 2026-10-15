"""uv-only offline workstation environment: staged, approved and non-overwriting."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "gpupanel_env_test", ROOT / "scripts/gpupanel-env.py"
)
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)


class OfflineUVEnvironmentTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.target = self.home / "GPUPanel" / "environments" / "workstation"

    def test_preview_readonly_and_requires_uv(self):
        report = env.plan(self.target, self.home, uv_path="/usr/bin/uv")
        self.assertEqual(report["status"], "READY_FOR_APPROVAL")
        self.assertEqual(len(report["planDigest"]), 64)
        self.assertFalse(self.target.parent.exists())
        self.assertEqual(env.plan(self.target, self.home, uv_path="")["status"], "MISSING_UV")
        self.assertEqual(env.create(self.target, self.home, False, uv_path="/usr/bin/uv")["status"],
                         "APPROVAL_REQUIRED")
        self.assertFalse(self.target.parent.exists())
        self.assertEqual(env.status(self.target, self.home)["status"], "ABSENT")

    def test_existing_project_and_symlink_are_never_overwritten(self):
        self.target.parent.mkdir(parents=True)
        self.target.mkdir()
        (self.target / "important.py").write_text("do not remove")
        self.assertEqual(env.plan(self.target, self.home, uv_path="/usr/bin/uv")["status"],
                         "REFUSED_EXISTS")
        self.assertEqual(env.create(self.target, self.home, True, uv_path="/usr/bin/uv")["status"],
                         "REFUSED_EXISTS")
        self.assertEqual((self.target / "important.py").read_text(), "do not remove")
        redirect = self.home / "redirect"
        redirect.symlink_to(self.target.parent, target_is_directory=True)
        with self.assertRaises(env.EnvironmentError):
            env.plan(redirect / "new-env", self.home, uv_path="/usr/bin/uv")

    def test_rejects_root_and_never_uses_subprocess_before_approval(self):
        with patch.object(env.os, "geteuid", return_value=0):
            result = env.create(self.target, self.home, True, uv_path="/usr/bin/uv")
        self.assertEqual(result["status"], "UNSUPPORTED_USER")
        self.assertFalse(self.target.parent.exists())

    def test_uv_failure_does_not_publish_destination_or_leak_stderr(self):
        captured = []
        def runner(command, **kw):
            captured.append((command, kw))
            return Mock(returncode=1, stdout="", stderr="/home/secret/token")
        with patch.object(env.os, "geteuid", return_value=1000):
            result = env.create(self.target, self.home, True,
                                uv_path="/usr/bin/uv", runner=runner)
        self.assertEqual(result["status"], "UV_FAILED")
        self.assertNotIn("secret", str(result))
        self.assertFalse(self.target.exists())
        self.assertFalse(list(self.target.parent.glob(".gpupanel-uv-stage-*")))
        cmd, opts = captured[0]
        self.assertEqual(cmd[:2], ["/usr/bin/uv", "venv"])
        for flag in ("--offline", "--no-python-downloads", "--no-managed-python",
                     "--no-config", "--no-project", "--relocatable", "--python"):
            self.assertIn(flag, cmd)
        self.assertNotIn("--clear", cmd)
        self.assertNotIn("--allow-existing", cmd)
        self.assertNotIn("PYTHONPATH", opts["env"])
        self.assertEqual(opts["env"]["UV_OFFLINE"], "1")

    def test_timeout_preserves_unmanaged_user_data(self):
        def runner(*args, **kwargs):
            raise subprocess.TimeoutExpired("uv", timeout=1)
        with patch.object(env.os, "geteuid", return_value=1000):
            result = env.create(self.target, self.home, True,
                                uv_path="/usr/bin/uv", runner=runner)
        self.assertEqual(result["status"], "UV_TIMEOUT")
        self.assertFalse(self.target.exists())

    @unittest.skipUnless(shutil.which("uv"), "uv is not installed in this runner")
    def test_real_offline_uv_create_verify_then_refuse_second_attempt(self):
        # Real subprocess integration using the runner-provided uv and Python.
        with patch.object(env.os, "geteuid", return_value=1000):
            created = env.create(self.target, self.home, True)
        self.assertEqual(created["status"], "VERIFIED", created)
        self.assertTrue((self.target / env.RECEIPT).is_file())
        self.assertEqual(env.status(self.target, self.home)["status"], "VERIFIED")
        self.assertEqual(env.create(self.target, self.home, True)["status"], "REFUSED_EXISTS")
        self.assertTrue((self.target / "pyvenv.cfg").is_file())
        activate = (self.target / "bin" / "activate").read_text()
        self.assertNotIn(".gpupanel-uv-stage-", activate)
        user_work = self.target / "note.txt"
        user_work.write_text("keep")
        self.assertEqual(env.status(self.target, self.home)["status"], "VERIFIED")
        self.assertEqual(user_work.read_text(), "keep")

    def test_default_cli_output_readable_and_json_after_command(self):
        with patch.object(env, "DEFAULT_TARGET", self.target):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(env.main(["plan"]), 0 if shutil.which("uv") else 2)
            self.assertIn("GPUPanel · uv", output.getvalue())
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                code = env.main(["plan", "--json", "--target", str(self.target)])
            self.assertIn('"status":', output.getvalue())
            self.assertEqual(code, 0 if shutil.which("uv") else 2)


if __name__ == "__main__":
    unittest.main()
