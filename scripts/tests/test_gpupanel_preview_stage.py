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
        for name in ("bin/gpupanel-core", "bin/gpupanel-agent", "LICENSE", "NOTICE.md"):
            (staging / name).write_bytes(("fixture:" + name).encode())
        self.archive = self.root / "test.tar.gz"
        stage.release.package(staging, self.archive, "fixture-1", {"source_commit": "fixture"})

    def test_preview_inventory_empty_and_verified_with_drift(self):
        empty = stage.inventory(self.home)
        self.assertEqual(empty["slots"], [])
        self.assertFalse((self.home / "GPUPanel").exists())
        with patch.object(stage.os, "geteuid", return_value=1000):
            stage.stage(self.archive, self.home, True)
            results = stage.inventory(self.home)
            self.assertEqual((results["staged"], results["drifted"]), (1, 0))
            self.assertEqual(results["slots"][0]["version"], "fixture-1")
            self.assertTrue(results["slots"][0]["verified"])
            self.assertFalse(results["mutationPerformed"])
            target = stage.target_for("fixture-1", self.home)
            (target / "bin/gpupanel-agent").write_text("altered bytes")
            results = stage.inventory(self.home)
            self.assertEqual((results["staged"], results["drifted"]), (0, 1))
            self.assertEqual(results["slots"][0]["status"], "DRIFT")

    def test_preview_inventory_does_not_traverse_foreign_or_symlinked_slots(self):
        folder = self.home / "GPUPanel/previews"
        folder.mkdir(parents=True)
        (folder / "personal-project").mkdir()
        (folder / "source-review").symlink_to(self.root, target_is_directory=True)
        results = stage.inventory(self.home)
        self.assertEqual(len(results["slots"]), 1)
        self.assertEqual(results["slots"][0]["status"], "DRIFT")
        self.assertEqual(results["slots"][0]["reason"], "unsafe symlink")

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
            self.assertEqual((target / "bin/gpupanel-core").stat().st_mode & 0o111, 0)
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

    def test_changed_executable_bit_is_drift_and_blocks_removal(self):
        with patch.object(stage.os, "geteuid", return_value=1000):
            stage.stage(self.archive, self.home, True)
            target = stage.target_for("fixture-1", self.home)
            executable = target / "bin/gpupanel-agent"
            executable.chmod(0o700)
            self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "DRIFT")
            with self.assertRaises(stage.PreviewError):
                stage.remove("fixture-1", self.home, True)
            executable.chmod(0o600)
            receipt = target / stage.RECEIPT
            receipt.chmod(0o644)
            self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "DRIFT")
            receipt.chmod(0o600)
            self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "STAGED")
            self.assertEqual(stage.remove("fixture-1", self.home, True)["status"], "ABSENT")

    def test_mutated_archive_between_preflight_and_copy_is_refused(self):
        actual_plan = stage.preview_plan

        def mutate_after_plan(archive, home):
            plan = actual_plan(archive, home)
            with archive.open("ab") as f:
                f.write(b"changed after successful verification")
            return plan

        with patch.object(stage, "preview_plan", side_effect=mutate_after_plan), \
             patch.object(stage.os, "geteuid", return_value=1000):
            with self.assertRaisesRegex(stage.PreviewError, "changed between plan"):
                stage.stage(self.archive, self.home, True)
        self.assertEqual(stage.inspect("fixture-1", self.home)["status"], "ABSENT")

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
            for name in ("bin/gpupanel-core", "bin/gpupanel-agent", "LICENSE", "NOTICE.md"):
                (staging / name).write_text(name)
            stage.release.package(staging, self.archive, "fixture-2", {})
            with tarfile.open(self.archive, "r:gz") as t:
                members = {m.name: t.extractfile(m).read() for m in t.getmembers()}
            # Repackage with unchanged manifest but different binary contents.
            import io
            with tarfile.open(self.archive, "w:gz") as t:
                for name, blob in members.items():
                    if name == "gpupanel/bin/gpupanel-core":
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
