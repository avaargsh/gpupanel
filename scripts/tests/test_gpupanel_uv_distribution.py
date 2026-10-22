"""Hermetic offline uv distribution tests. No network, shell or root actions."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("uv_dist", ROOT / "scripts/gpupanel-uv-distribution.py")
dist = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dist)


class UvDistributionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.cache = self.home / ".cache/gpupanel/uv"
        self.cache.mkdir(parents=True)
        self.archive = self.cache / dist.ASSET
        self.elf = b"\x7fELF" + b"test-only-uv-binary" * 24

    def make_archive(self, *, members=None):
        if members is None:
            members = [("uv-x86_64-unknown-linux-gnu/uv", self.elf)]
        with tarfile.open(self.archive, "w:gz") as tf:
            for name, content in members:
                info = tarfile.TarInfo(name)
                info.size = len(content)
                tf.addfile(info, io.BytesIO(content))
        return hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def test_missing_archive_is_non_mutating(self):
        result = dist.plan(self.home, supported=True)
        self.assertEqual(result["status"], "MISSING_ARCHIVE")
        self.assertFalse(result["executed"])
        self.assertFalse((self.home / "GPUPanel").exists())
        self.assertEqual(result["expectedSHA256"], dist.EXPECTED_SHA256)

    def test_digest_approval_exclusive_publish(self):
        checksum = self.make_archive()
        review = dist.plan(self.home, supported=True, reviewed_sha=checksum)
        self.assertEqual(review["status"], "READY_FOR_APPROVAL")
        self.assertEqual(len(review["planDigest"]), 64)
        with mock.patch.object(dist.os, "geteuid", return_value=1000):
            denied = dist.install(self.home, "bad", supported=True, reviewed_sha=checksum)
            self.assertEqual(denied["status"], "REFUSED_PLAN_MISMATCH")
            self.assertFalse((self.home / "GPUPanel").exists())
            applied = dist.install(self.home, review["planDigest"], supported=True,
                                   reviewed_sha=checksum)
        self.assertEqual(applied["status"], "VERIFIED")
        dest = self.home / "GPUPanel/tools/uv" / dist.VERSION
        self.assertEqual((dest / "bin/uv").read_bytes(), self.elf)
        self.assertEqual((dest / "bin/uv").stat().st_mode & 0o777, 0o700)
        self.assertEqual(dist.plan(self.home, supported=True,
                                   reviewed_sha=checksum)["status"], "ALREADY_PRESENT")
        self.assertEqual(json.loads((dest / "receipt.json").read_text())["archiveSHA256"], checksum)
        # Synthetic fixtures may prove installer mechanics, but can never
        # impersonate the pinned official release even with a matching receipt.
        self.assertEqual(dist.status(self.home)["status"], "MODIFIED")

    def test_tampered_digest_does_not_publish(self):
        self.make_archive()
        result = dist.plan(self.home, supported=True)
        self.assertEqual(result["status"], "UNTRUSTED_ARCHIVE")
        self.assertFalse((self.home / "GPUPanel").exists())

    def test_archive_traversal_and_duplicate_executable_refused(self):
        checksum = self.make_archive(members=[
            ("uv-x86_64-unknown-linux-gnu/uv", self.elf),
            ("../../.ssh/id_rsa", b"evil")])
        self.assertEqual(dist.plan(self.home, supported=True, reviewed_sha=checksum)["status"],
                         "UNTRUSTED_ARCHIVE")
        checksum = self.make_archive(members=[
            ("uv-x86_64-unknown-linux-gnu/uv", self.elf),
            ("uv-x86_64-unknown-linux-gnu/uv", self.elf)])
        self.assertEqual(dist.plan(self.home, supported=True, reviewed_sha=checksum)["status"],
                         "UNTRUSTED_ARCHIVE")

    def test_linked_archive_is_refused(self):
        source = self.home / "untrusted"
        source.write_bytes(b"stuff")
        self.archive.symlink_to(source)
        self.assertEqual(dist.plan(self.home, supported=True)["status"], "UNTRUSTED_ARCHIVE")
        self.assertEqual(source.read_bytes(), b"stuff")

    def test_os_and_conflict_gate(self):
        self.make_archive()
        self.assertEqual(dist.plan(self.home, supported=False)["status"], "UNSUPPORTED_OS")
        folder = self.home / "GPUPanel/tools/uv" / dist.VERSION
        folder.mkdir(parents=True)
        self.assertEqual(dist.plan(self.home, supported=True)["status"], "ALREADY_PRESENT")

    def test_offline_only_no_download_code(self):
        source = (ROOT / "scripts/gpupanel-uv-distribution.py").read_text()
        self.assertNotIn("urllib.request", source)
        self.assertNotIn("subprocess.run", source)
        self.assertNotIn("curl |", source)


if __name__ == "__main__":
    unittest.main()
