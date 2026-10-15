"""Offline uv lock inspection: authentic uv sync plus fail-closed fixtures."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "gpupanel_uv_lock_check_test", ROOT / "scripts/gpupanel-uv-lock-check.py"
)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class UVLockCheckTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.project = self.home / "GPUPanel" / "projects" / "demo"
        self.project.mkdir(parents=True)
        self.meta = {"project": {"name": "gpupanel-starter",
                                 "version": "0.1.0", "requires-python": ">=3.12",
                                 "dependencies": []}}
        (self.project / "pyproject.toml").write_text(
            '[project]\nname = "gpupanel-starter"\nversion = "0.1.0"\n'
            'requires-python = ">=3.12"\ndependencies = []\n')
        self.lock = {"version": 1, "revision": 3, "requires-python": ">=3.12",
                     "package": [{"name": "gpupanel-starter", "version": "0.1.0",
                                  "source": {"virtual": "."}}]}
        self.write_lock()

    def write_lock(self):
        # One tiny TOML fixture with the minimal uv lock format.
        entries = []
        for pkg in self.lock["package"]:
            source = pkg["source"]
            source_string = ", ".join(f'{k} = "{v}"' for k, v in source.items())
            entry = f'[[package]]\nname = "{pkg["name"]}"\nversion = "{pkg["version"]}"\nsource = {{ {source_string} }}\n'
            if "wheels" in pkg:
                entry += "wheels = [\n"
                for wheel in pkg["wheels"]:
                    entry += '  { url = "' + wheel["url"] + '", hash = "' + wheel["hash"] + '" },\n'
                entry += "]\n"
            entries.append(entry)
        (self.project / "uv.lock").write_text(
            f'version = {self.lock["version"]}\nrevision = 3\n'
            'requires-python = ">=3.12"\n\n' + "\n".join(entries))

    def test_readonly_uses_metadata_and_never_runs_uv(self):
        with patch.object(tool.subprocess, "run", side_effect=AssertionError("subprocess")):
            data = tool.inspect(self.project, self.home)
        self.assertEqual(data["status"], "REVIEWED_LOCK")
        self.assertEqual(data["packages"], 1)
        self.assertEqual(data["wheels"], 0)
        self.assertEqual(data["offlineCache"], "NOT_VERIFIED")
        self.assertEqual(tool.verify_offline(self.project, self.home, False,
                                               uv_path="/usr/bin/uv")["status"],
                         "APPROVAL_REQUIRED")
        self.assertFalse((self.project / ".venv").exists())

    def test_missing_invalid_and_symlinked_metadata_fail_closed(self):
        (self.project / "uv.lock").unlink()
        self.assertEqual(tool.inspect(self.project, self.home)["status"], "INVALID_LOCK")
        (self.project / "uv.lock").symlink_to("/etc/passwd")
        self.assertEqual(tool.inspect(self.project, self.home)["status"], "INVALID_LOCK")
        with self.assertRaises(tool.LockCheckError):
            tool.inspect(self.home.parent / "outside", self.home)

    def test_ban_unreviewed_sources_and_unhashed_wheels(self):
        for source in ({"git": "https://example.com/repo.git"},
                       {"directory": "../other"}, {"url": "https://example.com/foo.whl"}):
            with self.subTest(source=source):
                self.lock["package"][0]["source"] = source
                self.write_lock()
                self.assertEqual(tool.inspect(self.project, self.home)["status"],
                                 "UNREVIEWED_SOURCE")
        self.lock["package"][0]["source"] = {"registry": "https://pypi.org/simple"}
        self.lock["package"][0]["wheels"] = [
            {"url": "https://files.pythonhosted.org/packages/example.whl",
             "hash": "sha256:" + "a" * 64}]
        self.write_lock()
        # The package is the virtual root and cannot be registry-backed without
        # a project match; uv locked sync will reject this fake lock.
        self.assertEqual(tool.inspect(self.project, self.home)["status"], "REVIEWED_LOCK")
        self.lock["package"][0]["wheels"][0]["hash"] = "unhashed"
        self.write_lock()
        self.assertEqual(tool.inspect(self.project, self.home)["status"], "UNREVIEWED_SOURCE")
        self.lock["package"][0]["wheels"] = []
        self.write_lock()
        self.assertEqual(tool.inspect(self.project, self.home)["status"], "SOURCE_BUILD_BLOCKED")

    def test_rejects_nontrivial_build_system_and_uv_configuration(self):
        with (self.project / "pyproject.toml").open("a") as out:
            out.write('\n[tool.uv]\nindex-url = "https://example.com"\n')
        self.assertEqual(tool.inspect(self.project, self.home)["status"], "UNREVIEWED_SOURCE")

    def test_runner_errors_never_include_stderr_or_change_original(self):
        before = {p.name: p.read_bytes() for p in self.project.iterdir()}
        def bad(command, **kwargs):
            self.assertIn("--no-build", command)
            self.assertIn("--offline", command)
            self.assertIn("--locked", command)
            self.assertNotIn("UV_INDEX_URL", kwargs["env"])
            self.assertNotEqual(kwargs["cwd"], self.project)
            return Mock(returncode=1, stderr="PRIVATE_TOKEN")
        with patch.object(tool.os, "geteuid", return_value=1000):
            result = tool.verify_offline(self.project, self.home, True,
                                         uv_path="/usr/bin/uv", runner=bad)
        self.assertEqual(result["status"], "OFFLINE_SYNC_FAILED")
        self.assertNotIn("PRIVATE_TOKEN", str(result))
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.project.iterdir()})

    def test_timeout_root_denial_and_missing_uv(self):
        with patch.object(tool.os, "geteuid", return_value=0):
            self.assertEqual(tool.verify_offline(self.project, self.home, True,
                                                  uv_path="/usr/bin/uv")["status"],
                             "UNSUPPORTED_USER")
        with patch.object(tool.os, "geteuid", return_value=1000):
            self.assertEqual(tool.verify_offline(self.project, self.home, True,
                                                  uv_path="")["status"], "MISSING_UV")
            def timeout(*args, **kwargs):
                raise subprocess.TimeoutExpired("uv", timeout=1)
            self.assertEqual(tool.verify_offline(self.project, self.home, True,
                                                  uv_path="/usr/bin/uv", runner=timeout)["status"],
                             "TIMEOUT")

    @unittest.skipUnless(shutil.which("uv"), "requires uv 0.10.0")
    def test_real_uv_empty_lock_offline_sync_keeps_user_project_untouched(self):
        uv = shutil.which("uv")
        # Make a real uv-generated lock; this is different from the synthetic
        # parser fixture and proves a real offline project environment can sync.
        (self.project / "uv.lock").unlink()
        real = subprocess.run(
            [uv, "lock", "--offline", "--no-config",
             "--no-python-downloads", "--no-managed-python"],
            cwd=self.project, capture_output=True, text=True, check=False, timeout=30,
            env=tool.uv_environment())
        self.assertEqual(real.returncode, 0, real.stderr)
        before = {p.name: p.read_bytes() for p in self.project.iterdir()}
        checked = tool.inspect(self.project, self.home)
        self.assertEqual(checked["status"], "REVIEWED_LOCK", checked)
        with patch.object(tool.os, "geteuid", return_value=1000):
            verified = tool.verify_offline(self.project, self.home, True)
        self.assertEqual(verified["status"], "OFFLINE_SYNC_VERIFIED", verified)
        self.assertFalse(verified["runtimeVerified"])
        self.assertEqual(verified["offlineCache"], "VERIFIED_FOR_CURRENT_PYTHON_AND_PLATFORM")
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.project.iterdir()})
        self.assertFalse((self.project / ".venv").exists())

    def test_cli_default_and_json(self):
        with patch.object(tool.Path, "home", return_value=self.home):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(tool.main(["check", "--project", str(self.project)]), 0)
            self.assertIn("GPUPanel · uv", output.getvalue())
            machine = io.StringIO()
            with contextlib.redirect_stdout(machine):
                self.assertEqual(tool.main(["check", "--json", "--project", str(self.project)]), 0)
            self.assertEqual(json.loads(machine.getvalue())["status"], "REVIEWED_LOCK")


if __name__ == "__main__":
    unittest.main()
