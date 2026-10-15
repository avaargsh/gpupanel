import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-release.py"
spec = importlib.util.spec_from_file_location("gpupanel_release", SCRIPT)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.stage = self.root / "stage"
        for name in release.REQUIRED:
            path = self.stage / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(("contents of " + name).encode())
        self.archive = self.root / "release.tar.gz"

    def package(self):
        return release.package(self.stage, self.archive, "v0.1.0",
                               {"source_commit": "abc123", "production_install_ready": False})

    def test_archive_roundtrip_and_metadata(self):
        self.package()
        result = release.verify(self.archive)
        self.assertTrue(result["verified"])
        self.assertFalse(result["installable"])
        self.assertEqual(result["version"], "v0.1.0")

    def test_detects_modified_artifact(self):
        self.package()
        bad = self.root / "tampered.tar.gz"
        with tarfile.open(self.archive) as src, tarfile.open(bad, "w:gz") as dst:
            for member in src.getmembers():
                content = src.extractfile(member).read()
                if member.name.endswith("1panel-agent"):
                    content = b"tampered agent"  # changes length, too
                member.size = len(content)
                dst.addfile(member, io.BytesIO(content))
        with self.assertRaises(release.ReleaseError):
            release.verify(bad)

    def test_rejects_archive_with_unexpected_path(self):
        self.package()
        evil = self.root / "evil.tar.gz"
        with tarfile.open(evil, "w:gz") as tar:
            data = b"root escape"
            info = tarfile.TarInfo("../escape")
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        with self.assertRaises(release.ReleaseError):
            release.verify(evil)

    def test_rejects_symlink(self):
        self.package()
        evil = self.root / "link.tar.gz"
        with tarfile.open(evil, "w:gz") as tar:
            symlink = tarfile.TarInfo("gpupanel/bin/1panel-core")
            symlink.type = tarfile.SYMTYPE
            symlink.linkname = "/etc/passwd"
            tar.addfile(symlink)
        with self.assertRaises(release.ReleaseError):
            release.verify(evil)

    def test_missing_artifact_rejected(self):
        (self.stage / "LICENSE").unlink()
        with self.assertRaises(release.ReleaseError):
            self.package()

    def test_invalid_release_name(self):
        with self.assertRaises(release.ReleaseError):
            release.package(self.stage, self.archive, "../../etc", {})

    def test_no_destructive_command_in_build(self):
        root = self.root / "checkout"
        for directory in ("frontend", "core", "agent"):
            (root / directory).mkdir(parents=True)
        for name in ("LICENSE", "NOTICE.md"):
            (root / name).write_text("license")
        web = root / "core/cmd/server/web"
        web.mkdir(parents=True)
        (web / "index.html").write_text("<html>GPUPanel preview</html>" + "x"*100)
        (web / "assets").mkdir()
        (web / "assets/app.js").write_text("js")
        calls = []
        def fake_run(args, cwd, env=None):
            calls.append((args, cwd, env))
            if args[0] == "go":
                Path(args[args.index("-o")+1]).write_bytes(b"fake Go binary")
        with patch.object(release, "checked_run", side_effect=fake_run):
            result = release.build(root, self.stage, offline=True)
        self.assertFalse(result["production_install_ready"])
        self.assertTrue(any(args[:3] == ["npm", "ci", "--offline"] for args, _, _ in calls))
        self.assertTrue(any(args[0] == "go" for args, _, _ in calls))
        self.assertEqual(sum(args[0] == "go" for args, _, _ in calls), 2)
        for args, _, env in calls:
            self.assertNotIn("sudo", args)
            if args[0] == "go":
                self.assertEqual(env["GOPROXY"], "off")
                self.assertEqual(env["CGO_ENABLED"], "0")

    def test_verifier_rejects_bounded_member_before_extracting(self):
        self.package()
        with patch.object(release, "MAX_BINARY_BYTES", 8):
            with self.assertRaisesRegex(release.ReleaseError, "oversized archive member"):
                release.verify(self.archive)

    def test_packager_rejects_oversized_artifacts_and_manifest(self):
        with patch.object(release, "MAX_TEXT_BYTES", 8):
            with self.assertRaisesRegex(release.ReleaseError, "size limit"):
                self.package()
        self.assertFalse(self.archive.exists())
        with patch.object(release, "MAX_MANIFEST_BYTES", 100):
            with self.assertRaisesRegex(release.ReleaseError, "manifest"):
                self.package()
        self.assertFalse(self.archive.exists())

    def test_verifier_rejects_expanded_tar_bomb_without_parsing(self):
        self.package()
        with patch.object(release, "MAX_RAW_TAR_BYTES", 64):
            with patch.object(release.tarfile, "open", side_effect=AssertionError("parsed unbounded tar")):
                with self.assertRaisesRegex(release.ReleaseError, "expanded tar size"):
                    release.verify(self.archive)

    def test_does_not_eagerly_collect_tar_members(self):
        self.package()
        with patch.object(release.tarfile.TarFile, "getmembers",
                          side_effect=AssertionError("getmembers is unbounded")):
            self.assertTrue(release.verify(self.archive)["verified"])

    def test_rejects_duplicate_member_and_malformed_manifest(self):
        self.package()
        duplicate = self.root / "duplicate.tar.gz"
        with tarfile.open(self.archive, "r:gz") as src, tarfile.open(duplicate, "w:gz") as dst:
            for member in src:
                blob = src.extractfile(member).read()
                dst.addfile(member, io.BytesIO(blob))
            member = tarfile.TarInfo("gpupanel/LICENSE")
            member.size = 1
            dst.addfile(member, io.BytesIO(b"x"))
        with self.assertRaisesRegex(release.ReleaseError, "duplicate"):
            release.verify(duplicate)

        malformed = self.root / "malformed.tar.gz"
        with tarfile.open(self.archive, "r:gz") as src, tarfile.open(malformed, "w:gz") as dst:
            for member in src:
                blob = src.extractfile(member).read()
                if member.name == "gpupanel/manifest.json":
                    obj = json.loads(blob)
                    obj["files"] = None
                    blob = json.dumps(obj).encode()
                member.size = len(blob)
                dst.addfile(member, io.BytesIO(blob))
        with self.assertRaisesRegex(release.ReleaseError, "manifest contract"):
            release.verify(malformed)

    def test_protected_manifest_fields_cannot_be_overridden(self):
        with self.assertRaisesRegex(release.ReleaseError, "protected"):
            release.package(self.stage, self.archive, "dev", {"status": "installable"})
        self.assertFalse(self.archive.exists())



if __name__ == "__main__":
    unittest.main()
