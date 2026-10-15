"""Offline uv native project scaffold: real uv init/lock/run and safety failures."""
from __future__ import annotations

import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "gpupanel_uv_project_test", ROOT / "scripts/gpupanel-uv-project.py"
)
project = importlib.util.module_from_spec(spec)
spec.loader.exec_module(project)


class UVProjectTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.target = self.home / "GPUPanel" / "projects" / "uv-python-starter"

    def test_plan_is_readonly_and_requires_explicit_consent(self):
        result = project.options(self.target, self.home, uv_path="/usr/bin/uv")
        self.assertEqual(result["status"], "READY_FOR_APPROVAL")
        self.assertEqual(len(result["planDigest"]), 64)
        self.assertEqual(result["changes"], list(project.FILES) + [project.RECEIPT])
        self.assertFalse(self.target.parent.exists())
        self.assertEqual(project.options(self.target, self.home, uv_path="")["status"],
                         "MISSING_UV")
        self.assertEqual(project.create(self.target, self.home, False, uv_path="/usr/bin/uv")["status"],
                         "APPROVAL_REQUIRED")
        self.assertFalse(self.target.parent.exists())

    def test_preexisting_and_symlinked_projects_never_overwritten(self):
        self.target.parent.mkdir(parents=True)
        self.target.mkdir()
        user_file = self.target / "important.py"
        user_file.write_text("do not delete")
        self.assertEqual(project.create(self.target, self.home, True,
                                        uv_path="/usr/bin/uv")["status"], "REFUSED_EXISTS")
        self.assertEqual(user_file.read_text(), "do not delete")
        link = self.home / "redirect"
        link.symlink_to(self.target.parent, target_is_directory=True)
        with self.assertRaises(project.ProjectError):
            project.options(link / "project", self.home, uv_path="/usr/bin/uv")

    def test_uv_failure_never_publishes_and_never_leaks_stderr(self):
        commands = []
        def failing_runner(command, **kwargs):
            commands.append((command, kwargs))
            return Mock(returncode=2, stderr="PRIVATE_SECRET", stdout="")
        with patch.object(project.os, "geteuid", return_value=1000):
            result = project.create(self.target, self.home, True,
                                    uv_path="/usr/bin/uv", runner=failing_runner)
        self.assertEqual(result["status"], "UV_FAILED")
        self.assertFalse(self.target.exists())
        self.assertNotIn("PRIVATE_SECRET", str(result))
        self.assertEqual(commands[0][0][:2], ["/usr/bin/uv", "init"])
        self.assertIn("--no-package", commands[0][0])
        self.assertIn("--offline", commands[0][0])
        self.assertIn("--no-python-downloads", commands[0][0])
        self.assertIn("--no-config", commands[0][0])
        self.assertNotIn("UV_INDEX_URL", commands[0][1]["env"])

    def test_timeout_and_root_refusal_have_no_published_project(self):
        with patch.object(project.os, "geteuid", return_value=0):
            rejected = project.create(self.target, self.home, True, uv_path="/usr/bin/uv")
        self.assertEqual(rejected["status"], "UNSUPPORTED_USER")
        self.assertFalse(self.target.parent.exists())
        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired("uv", timeout=1)
        with patch.object(project.os, "geteuid", return_value=1000):
            result = project.create(self.target, self.home, True,
                                    uv_path="/usr/bin/uv", runner=timeout)
        self.assertEqual(result["status"], "UV_TIMEOUT")
        self.assertFalse(self.target.exists())

    @unittest.skipUnless(shutil.which("uv"), "requires uv installed")
    def test_real_uv_init_lock_run_and_modify_without_destroying_work(self):
        with patch.object(project.os, "geteuid", return_value=1000):
            created = project.create(self.target, self.home, True)
        self.assertEqual(created["status"], "VERIFIED", created)
        self.assertTrue((self.target / "uv.lock").is_file())
        self.assertTrue((self.target / project.RECEIPT).is_file())
        self.assertEqual(project.status(self.target, self.home)["status"], "VERIFIED")
        run = subprocess.run(
            ["uv", "run", "--locked", "--offline", "--no-config",
             "--no-python-downloads", "--no-managed-python",
             "python", "main.py"],
            cwd=self.target, capture_output=True, text=True, timeout=40, check=False,
            env=project.env_for_uv(),
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("Hello from", run.stdout)
        self.assertEqual(project.status(self.target, self.home)["status"], "VERIFIED")
        (self.target / "main.py").write_text("print('user-owned work')\n")
        self.assertEqual(project.status(self.target, self.home)["status"], "MODIFIED")
        self.assertEqual(project.create(self.target, self.home, True)["status"],
                         "REFUSED_EXISTS")
        self.assertEqual((self.target / "main.py").read_text(), "print('user-owned work')\n")

    def test_default_readable_and_json_output(self):
        with patch.object(project, "DEFAULT_TARGET", self.target), \
                patch.object(project.Path, "home", return_value=self.home):
            readable = io.StringIO()
            with contextlib.redirect_stdout(readable):
                code = project.main(["plan"])
            self.assertIn("GPUPanel · uv", readable.getvalue())
            self.assertEqual(code, 0 if shutil.which("uv") else 2)
            structured = io.StringIO()
            with contextlib.redirect_stdout(structured):
                code = project.main(["plan", "--json", "--target", str(self.target)])
            self.assertIn('"status":', structured.getvalue())
            self.assertEqual(code, 0 if shutil.which("uv") else 2)


if __name__ == "__main__":
    unittest.main()
