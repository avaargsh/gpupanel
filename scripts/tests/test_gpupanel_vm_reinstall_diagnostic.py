"""Sanitized guest preflight diagnosis; never run a VM in this unit suite."""
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/install-test"))
file = ROOT / "scripts/install-test/reinstall-denial.py"
spec = importlib.util.spec_from_file_location("guest_reinstall_diagnosis", file)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)

PACKAGE = "gpupanel-ci-" + "a" * 12 + "-linux-amd64"


class ReinstallDiagnostic(unittest.TestCase):
    def test_valid_fixture_probe_is_strictly_read_only(self):
        observations = []
        def stub(args, *, max_seconds):
            observations.append((args, max_seconds))
            return SimpleNamespace(
                returncode=0,
                stdout='{"regular":true,"readable":true,"traversable":true,"syntax_ok":true}',
                stderr="PASSWORD=never-report-this",
            )
        with patch.object(tool, "guest", side_effect=stub):
            self.assertEqual(tool.classify_guest_preflight(PACKAGE),
                             "SCRIPT_PRESENT_AND_PARSEABLE")
        self.assertEqual(len(observations), 1)
        cmd, timeout = observations[0]
        self.assertEqual(cmd[0:3], ["python3", "-c", cmd[2]])
        self.assertEqual(cmd[-1], PACKAGE)
        self.assertEqual(timeout, 20)
        self.assertNotIn("sudo", cmd)
        self.assertNotIn("install.sh", str(cmd))
        self.assertNotIn("write_text", cmd[2])
        self.assertNotIn("unlink", cmd[2])

    def test_invalid_path_never_invokes_guest(self):
        with patch.object(tool, "guest", side_effect=AssertionError("should not call")):
            for bad in ("", "../", "gpupanel-ci-../../-linux-amd64",
                        "gpupanel-ci-" + "x" * 12 + "-linux-amd64",
                        PACKAGE + "/../x", "gpupanel-ci-1-linux-amd64"):
                self.assertEqual(tool.classify_guest_preflight(bad), "INVALID_PACKAGE")

    def test_only_fixed_diagnostic_enums_are_emitted(self):
        fixtures = [
            ('{"regular":false,"readable":true,"traversable":true,"syntax_ok":false}', "SCRIPT_NOT_REGULAR"),
            ('{"regular":true,"readable":true,"traversable":false,"syntax_ok":false}', "DIRECTORY_NOT_TRAVERSABLE"),
            ('{"regular":true,"readable":false,"traversable":true,"syntax_ok":false}', "SCRIPT_NOT_READABLE"),
            ('{"regular":true,"readable":true,"traversable":true,"syntax_ok":false}', "SCRIPT_SYNTAX_UNVERIFIED"),
            ('{"regular":1,"readable":true,"traversable":true,"syntax_ok":true}', "PROBE_INVALID"),
            ('{"other":"SECRET-CANNOT-LEAK"}', "PROBE_INVALID"),
            ("SECRET=never-print", "PROBE_INVALID"),
        ]
        for stdout, code in fixtures:
            with self.subTest(code=code, stdout=stdout), patch.object(
                tool, "guest",
                return_value=SimpleNamespace(returncode=0, stdout=stdout, stderr="PRIVATE=SECRET"),
            ):
                self.assertEqual(tool.classify_guest_preflight(PACKAGE), code)

    def test_failed_preflight_never_echoes_raw_server_output(self):
        record = io.StringIO()
        with patch.object(tool, "classify_guest_preflight",
                          return_value="SCRIPT_NOT_REGULAR"), contextlib.redirect_stderr(record):
            with self.assertRaisesRegex(RuntimeError, "did not reject"):
                tool.verify_preflight("DB_PASSWORD=REDACTME", 1, package=PACKAGE)
        summary = record.getvalue()
        self.assertIn("exit=OTHER report=NON_JSON script=SCRIPT_NOT_REGULAR", summary)
        self.assertNotIn("REDACTME", summary)

    def test_expected_collision_acceptance_requires_exact_blocked_state(self):
        import json
        good = {
            "product": "GPUPanel", "phase": "pre-install-diagnostics-only",
            "installable": False, "safe_to_install": False,
            "checks": [
                {"code": "runtime_collision", "state": "BLOCKED"},
                {"code": "disk_space", "state": "PASS"},
            ],
            "blockers": ["runtime_collision"],
        }
        tool.verify_preflight(json.dumps(good), 2, package=PACKAGE)
        good["checks"][0]["state"] = "PASS"
        with self.assertRaisesRegex(RuntimeError, "collision"):
            tool.verify_preflight(json.dumps(good), 2, package=PACKAGE)


if __name__ == "__main__":
    unittest.main()
