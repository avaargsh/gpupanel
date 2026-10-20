"""Bounded source migration: export/import fresh HOME, hostile paths, and fail-closed tests."""
from __future__ import annotations
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_source_snapshot",
                                               ROOT / "scripts/gpupanel-source-snapshot.py")
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SourceSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old = self.root / "old-home"
        self.new = self.root / "new-home"
        for home in (self.old, self.new):
            home.mkdir(mode=0o700)
        self.project = self.old / "GPUPanel/projects/my-app"
        (self.project / "src").mkdir(parents=True, mode=0o700)
        (self.project / "src/app.py").write_text("print('hello')\n", encoding="utf-8")
        (self.project / "README.md").write_text("# Project\n", encoding="utf-8")
        (self.project / ".gitignore").write_text("__pycache__/\n", encoding="utf-8")
        (self.project / "uv.lock").write_text("version = 1\n", encoding="utf-8")
        (self.project / ".venv").mkdir()
        (self.project / ".venv/ignored.py").write_text("print('not backed up')")
        self.backup = self.root / "my-app-source-v1.zip"

    def test_fresh_home_export_inspect_restore_and_user_edits(self):
        review = snapshot.plan(self.old, "my-app")
        self.assertEqual(review["status"], "READY_FOR_APPROVAL")
        self.assertEqual(review["scope"], snapshot.SCOPE)
        self.assertGreaterEqual(review["excludedEntries"], 1)
        self.assertEqual(len(review["manifestDigest"]), 64)
        self.assertFalse(self.backup.exists())
        with mock.patch.object(snapshot.os, "geteuid", return_value=1000):
            result = snapshot.export(self.old, "my-app", self.backup, review["manifestDigest"])
        self.assertEqual(result["status"], "EXPORTED")
        self.assertEqual(self.backup.stat().st_mode & 0o777, 0o600)
        manifest, contents, digest = snapshot.inspect(self.backup)
        self.assertIn("src/app.py", contents)
        self.assertIn(".gitignore", contents)
        self.assertNotIn(".venv/ignored.py", contents)
        self.assertEqual(result["bundleDigest"], digest)
        with mock.patch.object(snapshot.os, "geteuid", return_value=1000):
            refusal = snapshot.restore(self.new, self.backup, "0"*64)
            self.assertEqual(refusal["status"], "APPROVAL_REQUIRED")
            self.assertFalse((self.new / "GPUPanel").exists())
            restored = snapshot.restore(self.new, self.backup, digest)
        self.assertEqual(restored["status"], "VERIFIED")
        dst = self.new / "GPUPanel/projects/my-app"
        self.assertEqual((dst / "src/app.py").read_text(), "print('hello')\n")
        self.assertFalse((dst / ".venv").exists())
        (dst / "src/app.py").write_text("print('edited by user')\n")
        with mock.patch.object(snapshot.os, "geteuid", return_value=1000):
            conflict = snapshot.restore(self.new, self.backup, digest)
        self.assertEqual(conflict["status"], "CONFLICT_NO_OVERWRITE")
        self.assertEqual((dst / "src/app.py").read_text(), "print('edited by user')\n")

    def test_changed_source_after_review_blocks_export(self):
        digest = snapshot.plan(self.old, "my-app")["manifestDigest"]
        (self.project / "src/app.py").write_text("print('different')\n")
        with mock.patch.object(snapshot.os, "geteuid", return_value=1000):
            refused = snapshot.export(self.old, "my-app", self.backup, digest)
        self.assertEqual(refused["status"], "APPROVAL_REQUIRED")
        self.assertFalse(self.backup.exists())

    def test_known_credential_text_refuses_export(self):
        (self.project / "src/app.py").write_bytes(b"API='ghp_TEST_PLACEHOLDER'\n")
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.plan(self.old, "my-app")
        self.assertFalse(self.backup.exists())

    def test_project_symlink_refused_and_victim_untouched(self):
        outside = self.root / "victim"
        outside.mkdir()
        (outside / "passwords.txt").write_text("do not read")
        (self.project / "src/linked").symlink_to(outside)
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.plan(self.old, "my-app")
        self.assertEqual((outside / "passwords.txt").read_text(), "do not read")

    def test_source_data_hidden_runtime_excluded(self):
        data = self.project / "data"
        data.mkdir()
        (data / "customers.json").write_text('{"private":"example"}')
        (self.project / ".env").write_text("MY_PASSWORD=example")
        (self.project / "dataset.bin").write_bytes(b"\x00\x01")
        manifest, _, excluded = snapshot.walk_source(self.old, "my-app")
        self.assertGreaterEqual(excluded, 3)
        paths = {item["path"] for item in manifest["files"]}
        self.assertNotIn(".env", paths)
        self.assertNotIn("data/customers.json", paths)
        self.assertNotIn("dataset.bin", paths)

    def test_bad_archive_path_and_duplicate_entries_rejected(self):
        manifest = {"formatVersion": snapshot.VERSION, "project": "my-app",
                    "scope": snapshot.SCOPE,
                    "files": [{"path": "../victim.py", "size": 4,
                               "sha256": snapshot.hash_bytes(b"evil")}]}
        with zipfile.ZipFile(self.backup, "w") as z:
            z.writestr("manifest.json", snapshot.canonical(manifest))
            z.writestr("src/../victim.py", b"evil")
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.inspect(self.backup)
        self.backup.unlink()
        with zipfile.ZipFile(self.backup, "w") as z:
            z.writestr("manifest.json", snapshot.canonical(manifest))
            z.writestr("manifest.json", snapshot.canonical(manifest))
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.inspect(self.backup)

    def test_backup_digest_tamper_refused(self):
        review = snapshot.plan(self.old, "my-app")
        with mock.patch.object(snapshot.os, "geteuid", return_value=1000):
            snapshot.export(self.old, "my-app", self.backup, review["manifestDigest"])
        manifest, _, digest = snapshot.inspect(self.backup)
        self.assertEqual(manifest["project"], "my-app")
        with zipfile.ZipFile(self.backup, "a") as z:
            z.writestr("src/malicious.py", b"print('bad')")
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.inspect(self.backup)
        self.assertNotEqual(snapshot.hash_bytes(self.backup.read_bytes()), digest)

    def test_source_file_count_bounded(self):
        for i in range(snapshot.MAX_FILES + 5):
            (self.project / "src" / f"x{i}.py").write_text("pass\n")
        with self.assertRaises(snapshot.SnapshotError):
            snapshot.plan(self.old, "my-app")

    def test_no_shell_network_or_container_installer(self):
        contents = (ROOT / "scripts/gpupanel-source-snapshot.py").read_text()
        for forbidden in ("subprocess.run(", "urllib.request", "os.system(",
                          "docker run", "shell=True", "eval("):
            self.assertNotIn(forbidden, contents)


if __name__ == "__main__":
    unittest.main()
