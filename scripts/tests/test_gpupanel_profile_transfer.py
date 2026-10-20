"""Ubuntu-level portable Profile CLI exercise using isolated HOME directories.

No apt, Docker, privileged operations, remote Core or Kubernetes are launched.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "scripts/gpupanel-workstation.py"


class ProfileTransferTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.old = Path(self.temp.name) / "old"
        self.new = Path(self.temp.name) / "new"
        self.old.mkdir()
        self.new.mkdir()

    def execute(self, home, *args):
        env = dict(os.environ)
        env["HOME"] = str(home)
        result = subprocess.run([sys.executable, str(CLI), *map(str, args)],
                                env=env, capture_output=True, text=True,
                                check=False, timeout=15)
        stream = result.stdout if result.stdout.strip() else result.stderr
        return result.returncode, json.loads(stream)

    def test_cross_home_export_import_with_explicit_digest(self):
        old_backup = self.old / "GPUPanel/backups"
        old_backup.mkdir(parents=True)
        source = old_backup / "workstation-profile.json"
        rc, exported = self.execute(self.old, "export", source)
        self.assertEqual(rc, 0, exported)
        self.assertEqual(exported["status"], "EXPORTED")
        self.assertTrue(source.is_file())

        new_backup = self.new / "GPUPanel/backups"
        new_backup.mkdir(parents=True)
        target = new_backup / "workstation-profile.json"
        shutil.copyfile(source, target)

        rc, preview = self.execute(self.new, "--profile", target, "doctor")
        self.assertIn(preview["status"], {"READY", "UNSUPPORTED_OS"})
        self.assertFalse(preview["requires"]["docker"])
        self.assertEqual(preview["profileDigest"], exported["profileDigest"])
        self.assertFalse((self.new / ".config/gpupanel/workstation-profile.json").exists())

        rc, refused = self.execute(self.new, "--profile", target, "restore",
                                   "--approve-digest", "0" * 64)
        self.assertNotEqual(rc, 0)
        self.assertEqual(refused["status"], "APPROVAL_REQUIRED")
        rc, restored = self.execute(self.new, "--profile", target, "restore",
                                    "--approve-digest", preview["profileDigest"])
        self.assertEqual(rc, 0, restored)
        self.assertEqual(restored["status"], "VERIFIED")

        rc, repeated = self.execute(self.new, "--profile", target, "restore",
                                    "--approve-digest", preview["profileDigest"])
        self.assertEqual(rc, 0, repeated)
        self.assertEqual(repeated["status"], "VERIFIED_EXISTING")

        config = self.new / ".config/gpupanel/workstation-profile.json"
        config.write_text("operator modified")
        rc, conflict = self.execute(self.new, "--profile", target, "restore",
                                    "--approve-digest", preview["profileDigest"])
        self.assertNotEqual(rc, 0)
        self.assertEqual(conflict["status"], "CONFLICT_NO_OVERWRITE")
        self.assertEqual(config.read_text(), "operator modified")

    def test_invalid_mirror_is_rejected_at_import(self):
        backup = self.new / "GPUPanel/backups"
        backup.mkdir(parents=True)
        source = backup / "workstation-profile.json"
        profile = json.loads((ROOT / "profiles/ubuntu24-workstation.v1.json").read_text())
        profile["mirrors"]["GOPROXY"] = "http://insecure.invalid"
        source.write_text(json.dumps(profile))
        rc, refused = self.execute(self.new, "--profile", source, "doctor")
        self.assertNotEqual(rc, 0)
        self.assertEqual(refused["status"], "REFUSED")
        self.assertFalse((self.new / ".config/gpupanel/workstation-profile.json").exists())


if __name__ == "__main__":
    unittest.main()
