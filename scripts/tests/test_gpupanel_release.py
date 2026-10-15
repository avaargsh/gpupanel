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


if __name__ == "__main__":
    unittest.main()
