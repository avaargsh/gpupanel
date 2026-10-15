"""Read-only uv package inventory contract."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_packages", ROOT / "scripts/gpupanel-env-packages.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class UVPackagesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.venv = Path(self.tmp.name)
        (self.venv / "bin").mkdir()
        (self.venv / "bin" / "python").write_text("fixture")

    def test_valid_and_empty_inventory(self):
        calls = []
        def runner(cmd, **kwargs):
            calls.append((cmd, kwargs))
            return Mock(returncode=0, stdout=json.dumps([
                {"name": "torch", "version": "2.6.0+cu124"},
                {"name": "numpy", "version": "2.1.0"},
            ]), stderr="/private/path")
        found = mod.installed_packages(self.venv, "/usr/bin/uv", {}, runner=runner)
        self.assertEqual(found["status"], "OK")
        self.assertEqual([p["name"] for p in found["packages"]], ["numpy", "torch"])
        self.assertEqual(found["count"], 2)
        self.assertEqual(calls[0][0][:3], ["/usr/bin/uv", "pip", "list"])
        self.assertIn("--offline", calls[0][0])
        self.assertEqual(calls[0][1]["timeout"], 20)
        self.assertFalse(calls[0][1]["check"])
        empty = mod.installed_packages(self.venv, "/usr/bin/uv", {},
            runner=lambda *a, **kw: Mock(returncode=0, stdout="[]"))
        self.assertEqual(empty["status"], "OK")
        self.assertEqual(empty["count"], 0)

    def test_malformed_and_error_cases_fail_closed(self):
        samples = [
            "private header\n[]", "{}", json.dumps([{"name": "unsafe", "version": "<script>"}]),
            json.dumps([{"name": "Foo", "version": "1.0"}, {"name": "foo", "version": "2.0"}]),
            json.dumps([{"name": "../secret", "version": "1"}]),
            json.dumps([{"name": "x", "version": "1"}] * 1001),
            "x" * (mod.MAX_OUTPUT + 1),
        ]
        for payload in samples:
            with self.subTest(payload=payload[:30]):
                observed = mod.installed_packages(self.venv, "/usr/bin/uv", {},
                    runner=lambda *a, **kw: Mock(returncode=0, stdout=payload))
                self.assertEqual(observed["status"], "INVALID_RESPONSE")
                self.assertEqual(observed["packages"], [])
        self.assertEqual(mod.installed_packages(self.venv, "/usr/bin/uv", {},
            runner=lambda *a, **kw: Mock(returncode=3, stdout="", stderr="secret"))["status"], "QUERY_FAILED")
        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired("uv", 20)
        self.assertEqual(mod.installed_packages(self.venv, "/usr/bin/uv", {},
            runner=timeout)["status"], "TIMEOUT")

    def test_missing_interpreter_never_runs_uv(self):
        (self.venv / "bin" / "python").unlink()
        self.assertEqual(mod.installed_packages(self.venv, "/usr/bin/uv", {},
            runner=lambda *a, **kw: self.fail("unexpected subprocess"))["status"], "INVALID_ENVIRONMENT")


if __name__ == "__main__":
    unittest.main()
