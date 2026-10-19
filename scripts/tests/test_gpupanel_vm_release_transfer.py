"""Test the exact-package/guest identity before any VM installer starts."""
from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/install-test/release-transfer.py"
spec = importlib.util.spec_from_file_location("gpupanel_release_transfer", SOURCE)
transfer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transfer)


class GuestReleaseIntegrity(unittest.TestCase):
    def setUp(self):
        self.source = "c" * 40
        self.filename = f"gpupanel-ci-{self.source[:12]}-linux-amd64.tar.gz"
        self.local_digest = "a" * 64
        self.guest = {
            "archive_sha256": self.local_digest,
            "guest_machine_id_sha256": "b" * 64,
        }

    def prove(self, **changes):
        values = {
            "source_sha": self.source, "archive": self.filename,
            "local_digest": self.local_digest, "remote": self.guest,
        }
        values.update(changes)
        return transfer.transfer_proof(**values)

    def test_exact_archive_digest_and_guest_machine_identity(self):
        result = self.prove()
        self.assertEqual(result["schema"], "gpupanel.vm.release-transfer.v1")
        self.assertEqual(result["source_sha"], self.source)
        self.assertEqual(result["archive_name"], self.filename)
        self.assertEqual(result["local_release_sha256"], "a" * 64)
        self.assertEqual(result["guest_release_sha256"], "a" * 64)
        self.assertEqual(result["guest_machine_id_sha256"], "b" * 64)
        self.assertEqual(result["signature_proof"], "NOT_ATTESTED")
        self.assertNotIn("password", result)

    def test_wrong_source_archive_name_or_mismatched_remote_sha(self):
        variants = (
            {"source_sha": "bad"},
            {"archive": "gpupanel-ci-previous-linux-amd64.tar.gz"},
            {"archive": "/tmp/" + self.filename},
            {"archive": self.filename + "; echo secret"},
            {"local_digest": "ABCDEF"},
            {"remote": {**self.guest, "archive_sha256": "0" * 64}},
            {"remote": {**self.guest, "archive_sha256": True}},
            {"remote": {**self.guest, "guest_machine_id_sha256": ""}},
            {"remote": {**self.guest, "extra": "untrusted"}},
            {"remote": {}},
        )
        for change in variants:
            with self.subTest(change=change), self.assertRaises(RuntimeError):
                self.prove(**change)

    def test_guest_probe_refuses_symlink_and_uses_fixed_path(self):
        import ast
        ast.parse(transfer.REMOTE_PROBE)
        self.assertIn("p.lstat().st_mode", transfer.REMOTE_PROBE)
        self.assertIn("stat.S_ISREG", transfer.REMOTE_PROBE)
        self.assertIn("Path('/etc/machine-id').read_bytes()", transfer.REMOTE_PROBE)
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertLess(
            runner.index("python3 scripts/install-test/release-transfer.py"),
            runner.index('sudo tar -xzf "/tmp/$archive"'),
        )
        self.assertLess(
            runner.index("stage 'guest_release_archive_verified'"),
            runner.index("stage 'guest_fresh_install'"),
        )
        self.assertIn("umask 077", runner)
        self.assertIn("release-transfer.json", SOURCE.read_text())


if __name__ == "__main__":
    unittest.main()
