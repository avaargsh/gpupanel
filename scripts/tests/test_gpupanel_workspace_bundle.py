"""Bounded offline scaffold bundle contract tests. No privileged operations."""
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from unittest import mock
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "gpupanel_workspace_bundle", ROOT / "scripts/gpupanel-workspace-bundle.py"
)
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class WorkspaceBundleTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.home1 = Path(self.temporary.name) / "old"
        self.home2 = Path(self.temporary.name) / "new"
        self.home1.mkdir()
        self.home2.mkdir()
        self.source = self.home1 / "GPUPanel/projects/example"
        self.source.mkdir(parents=True)
        (self.source / "pyproject.toml").write_text("[project]\nname='example'\n")
        (self.source / "uv.lock").write_text("version = 1\n")
        (self.source / "main.py").write_text("print('ok')\n")
        (self.source / ".devcontainer").mkdir()
        (self.source / ".devcontainer/devcontainer.json").write_text('{"image":"python:3.12"}')
        self.archive = Path(self.temporary.name) / "snapshot.zip"

    def test_scaffold_round_trip_and_no_overwrite(self):
        result = bundle.export(self.home1, "example", self.archive)
        self.assertEqual(result["status"], "EXPORTED")
        manifest, files, digest = bundle.read_bundle(self.archive)
        self.assertEqual(digest, result["bundleDigest"])
        self.assertIn("uv.lock", files)
        self.assertIn(".devcontainer/devcontainer.json", files)
        self.assertEqual(bundle.restore(self.home2, self.archive, "wrong")["status"], "APPROVAL_REQUIRED")
        self.assertFalse((self.home2 / "GPUPanel/projects/example").exists())
        with mock.patch.object(bundle.os, "geteuid", return_value=1000):
            restored = bundle.restore(self.home2, self.archive, digest)
        self.assertEqual(restored["status"], "VERIFIED")
        self.assertEqual((self.home2 / "GPUPanel/projects/example/main.py").read_text(), "print('ok')\n")
        with mock.patch.object(bundle.os, "geteuid", return_value=1000):
            refused = bundle.restore(self.home2, self.archive, digest)
        self.assertEqual(refused["status"], "CONFLICT_NO_OVERWRITE")

    def test_secret_marker_rejected_before_archive_created(self):
        (self.source / "main.py").write_text('KEY="-----BEGIN PRIVATE KEY"')
        with self.assertRaises(bundle.BundleError):
            bundle.export(self.home1, "example", self.archive)
        self.assertFalse(self.archive.exists())

    def test_project_symlink_rejected(self):
        linked = self.home1 / "GPUPanel/projects/linked"
        linked.symlink_to(self.source, target_is_directory=True)
        with self.assertRaises(bundle.BundleError):
            bundle.snapshot(self.home1, "linked")

    def test_inner_symlink_refused(self):
        (self.source / "uv.lock").unlink()
        (self.source / "uv.lock").symlink_to(self.source / "main.py")
        with self.assertRaises(bundle.BundleError):
            bundle.snapshot(self.home1, "example")

    def test_tamper_detected(self):
        bundle.export(self.home1, "example", self.archive)
        manifest, files, _ = bundle.read_bundle(self.archive)
        with zipfile.ZipFile(self.archive, "w") as z:
            z.writestr("manifest.json", bundle.canonical(manifest))
            for name, content in files.items():
                z.writestr("files/" + name, content + b"tamper" if name == "main.py" else content)
        with self.assertRaises(bundle.BundleError):
            bundle.read_bundle(self.archive)

    def test_extra_zip_member_rejected(self):
        bundle.export(self.home1, "example", self.archive)
        with zipfile.ZipFile(self.archive, "a") as z:
            z.writestr("files/../../.ssh/id_rsa", b"no")
        with self.assertRaises(bundle.BundleError):
            bundle.read_bundle(self.archive)

    def test_unknown_project_name_refused(self):
        for name in ("../bad", "/tmp/bad", ".hidden", "with spaces"):
            with self.subTest(name=name), self.assertRaises(bundle.BundleError):
                bundle.project_dir(self.home1, name)

    def test_export_refuses_existing_bundle(self):
        self.archive.write_text("operator data")
        with self.assertRaises(bundle.BundleError):
            bundle.export(self.home1, "example", self.archive)
        self.assertEqual(self.archive.read_text(), "operator data")


if __name__ == "__main__":
    unittest.main()
