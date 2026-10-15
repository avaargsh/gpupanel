"""Source preview is staged under user home, never installed as a system service."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_preview_stage", ROOT / "scripts/gpupanel-preview-stage.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


class PreviewStagingContract(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        staging = self.root / "input"
        (staging / "bin").mkdir(parents=True)
        for name in ("bin/1panel-core", "bin/1panel-agent", "LICENSE", "NOTICE.md"):
            (staging / name).write_bytes(("fixture:" + name).encode())
        self.archive = self.root / "test.tar.gz"
        stage.release.package(staging, self.archive, "fixture-1", {"source_commit": "fixture"})

    def test_plan_is_read_only(self):
        plan = stage.preview_plan(self.archive, self.home)
        self.assertEqual(plan["status"], "APPROVAL_REQUIRED")
        self.assertFalse(plan["publisherSignatureVerified"])
        self.assertFalse(plan["systemServiceInstalled"])
        self.assertFalse((self.home / "GPUPanel").exists())

    def test_stage_inspect_modified_refusal_remove(self):
        with patch.object(stage.os, "geteuid", return_value=1000):
            plan = stage.stage(self.archive, self.home, False)
            self.assertEqual(plan["status"], "APPROVAL_REQUIRED")
            result = stage.stage(self.archive, self.home, True)
            self.assertEqual(result["status"], "STAGED")
            self.assertFalse(result["systemServiceInstalled"])
            target = stage.target_for("fixture-1", self.home)
            self.assertEqual((target / "bin/1panel-core").stat().st_mode & 0o111, 0)
            self.assertEqual((self.home / "GPUPanel").stat().st_mode & 0o777, 0o700)
            self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "STAGED")
            with self.assertRaises(stage.PreviewError):
                stage.stage(self.archive, self.home, True)
            original = (target / "LICENSE").read_bytes()
            (target / "LICENSE").write_text("user edit")
            self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "DRIFT")
            with self.assertRaises(stage.PreviewError):
                stage.remove("fixture-1", self.home, True)
            self.assertEqual((target / "LICENSE").read_text(), "user edit")
            (target / "LICENSE").write_bytes(original)
            self.assertEqual(stage.remove("fixture-1", self.home, False)["status"], "APPROVAL_REQUIRED")
            self.assertEqual(stage.remove("fixture-1", self.home, True)["status"], "ABSENT")
            self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "ABSENT")
            self.assertTrue(target.parent.is_dir())

    def test_unmanaged_target_preserved(self):
        target = stage.target_for("fixture-1", self.home)
        target.mkdir(parents=True)
        (target / "notes.txt").write_text("important")
        with patch.object(stage.os, "geteuid", return_value=1000):
            with self.assertRaises(stage.PreviewError):
                stage.stage(self.archive, self.home, True)
            with self.assertRaises(stage.PreviewError):
                stage.remove("fixture-1", self.home, True)
        self.assertEqual((target / "notes.txt").read_text(), "important")

    def test_bad_archive_rejected_no_files_created(self):
        with self.archive.open("ab") as f:
            f.write(b"trailing garbage")
        # Even a self-contained hash manifest is not a trusted vendor signature.
        # Add a real member content corruption in a fresh archive.
        with tempfile.TemporaryDirectory() as temp:
            import tarfile
            staging = Path(temp)
            (staging / "bin").mkdir()
            for name in ("bin/1panel-core", "bin/1panel-agent", "LICENSE", "NOTICE.md"):
                (staging / name).write_text(name)
            stage.release.package(staging, self.archive, "fixture-2", {})
            with tarfile.open(self.archive, "r:gz") as t:
                members = {m.name: t.extractfile(m).read() for m in t.getmembers()}
            # Repackage with unchanged manifest but different binary contents.
            import io
            with tarfile.open(self.archive, "w:gz") as t:
                for name, blob in members.items():
                    if name == "gpupanel/bin/1panel-core":
                        blob = b"corruption"
                    entry = tarfile.TarInfo(name)
                    entry.size = len(blob)
                    t.addfile(entry, io.BytesIO(blob))
        with self.assertRaises(stage.release.ReleaseError):
            stage.preview_plan(self.archive, self.home)
        self.assertFalse((self.home / "GPUPanel").exists())

    def test_root_and_traversal_rejected(self):
        with self.assertRaises(stage.PreviewError):
            stage.target_for("../escape", self.home)
        target = self.home / "GPUPanel"
        target.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(stage.PreviewError):
            stage.target_for("fixture-1", self.home)


if __name__ == "__main__":
    unittest.main()
