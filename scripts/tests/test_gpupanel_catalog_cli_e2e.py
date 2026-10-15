"""Black-box Catalog CLI acceptance as an unprivileged Ubuntu user.

Uses a disposable directory inside the invoking user's home; never touches
existing GPUPanel projects or system services. No network or Docker involved.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "scripts/gpupanel-catalog-workspace.py"


class WorkspaceCliAcceptance(unittest.TestCase):
    @unittest.skipIf(os.geteuid() == 0, "CLI is intentionally forbidden to run as root")
    def test_real_cli_first_run_and_recovery(self):
        with tempfile.TemporaryDirectory(prefix=".gpupanel-cli-e2e-", dir=Path.home()) as tmp:
            dest = Path(tmp) / "new" / "projects" / "example"

            def cli(command: str, *args: str) -> tuple[int, dict]:
                result = subprocess.run(
                    [sys.executable, str(CLI), "--target", str(dest), command, *args],
                    cwd=ROOT, capture_output=True, text=True, timeout=20,
                    check=False,
                )
                try:
                    data = json.loads(result.stdout or result.stderr)
                except ValueError as exc:
                    self.fail(f"CLI failed to return JSON for {command}: {result.stderr}: {exc}")
                return result.returncode, data

            code, plan = cli("plan")
            self.assertEqual(code, 2)
            self.assertEqual(plan["status"], "APPROVAL_REQUIRED")
            self.assertFalse(dest.parent.exists(), "plan must never mutate the filesystem")

            code, observed = cli("status")
            self.assertEqual((code, observed["status"]), (0, "ABSENT"))

            code, denied = cli("install")
            self.assertEqual((code, denied["status"]), (2, "APPROVAL_REQUIRED"))
            self.assertFalse(dest.parent.exists())

            code, ready = cli("install", "--approve")
            self.assertEqual((code, ready["status"]), (0, "INSTALLED"))
            self.assertTrue(ready["verified"])
            self.assertTrue(dest.is_dir())
            self.assertEqual(dest.parent.stat().st_mode & 0o777, 0o700)

            output = subprocess.run(
                [sys.executable, str(dest / "main.py")],
                capture_output=True, text=True, timeout=10, check=True,
            )
            self.assertIn("GPUPanel Python starter ready", output.stdout)
            self.assertEqual(cli("status")[1]["status"], "INSTALLED")

            # Repeated requests must never overwrite an existing project.
            code, repeated = cli("install", "--approve")
            self.assertEqual(code, 2)
            self.assertIn("already exists", repeated["error"])

            original = (dest / "main.py").read_bytes()
            (dest / "main.py").write_text("print('locally customized')\n")
            self.assertEqual(cli("status")[1]["status"], "DRIFT")
            code, rejected = cli("uninstall", "--approve")
            self.assertEqual(code, 2)
            self.assertIn("refused", rejected["error"])
            self.assertTrue((dest / "main.py").is_file(), "drift must preserve user content")

            (dest / "main.py").write_bytes(original)
            code, denied = cli("uninstall")
            self.assertEqual((code, denied["status"]), (2, "APPROVAL_REQUIRED"))
            self.assertEqual(cli("status")[1]["status"], "INSTALLED")

            code, removed = cli("uninstall", "--approve")
            self.assertEqual((code, removed["status"]), (0, "ABSENT"))
            self.assertFalse(dest.exists())
            self.assertTrue(dest.parent.is_dir(), "shared parent directories must remain")
            self.assertEqual(cli("status")[1]["status"], "ABSENT")


if __name__ == "__main__":
    unittest.main()
