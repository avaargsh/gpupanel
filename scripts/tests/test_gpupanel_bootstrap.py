import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-bootstrap.py"
spec = importlib.util.spec_from_file_location("gpupanel_bootstrap", SCRIPT)
bootstrap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bootstrap)


class BootstrapTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.content = b"GPUPanel offline fixture\n"
        self.artifact = {"name": "example.tar.gz", "sha256": hashlib.sha256(self.content).hexdigest(),
                         "urls": ["https://mirror-one.invalid/example.tar.gz", "https://mirror-two.invalid/example.tar.gz"]}
        self.lock = {"format_version": 1, "os": "ubuntu-24.04", "profile": "test",
                     "tools": [{"name": "Python", "command": "python3"}], "artifacts": [self.artifact]}
        self.lock_path = self.root / "lock.json"
        self.lock_path.write_text(json.dumps(self.lock), encoding="utf-8")
        self.cache = self.root / "cache"

    def test_lock_rejects_path_traversal_and_http(self):
        for name in ("../escaped", "/etc/passwd", "nested/path"):
            self.lock["artifacts"][0]["name"] = name
            self.lock_path.write_text(json.dumps(self.lock))
            with self.assertRaises(bootstrap.BootstrapError):
                bootstrap.load_lock(self.lock_path)
        self.lock["artifacts"][0]["name"] = "ok"
        self.lock["artifacts"][0]["urls"] = ["http://example.invalid/a"]
        self.lock_path.write_text(json.dumps(self.lock))
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.load_lock(self.lock_path)

    def test_cached_offline_and_tampered_artifact(self):
        self.cache.mkdir()
        (self.cache / self.artifact["name"]).write_bytes(self.content)
        self.assertEqual(bootstrap.get_artifact(self.artifact, self.cache, 2, True), "cached")
        (self.cache / self.artifact["name"]).write_bytes(b"tampered")
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.get_artifact(self.artifact, self.cache, 2, True)

    def test_mirror_fallback_checks_digest(self):
        requests = []
        def fetch(request, timeout):
            requests.append(request.full_url)
            return io.BytesIO(b"wrong" if len(requests) == 1 else self.content)
        with patch.object(bootstrap.urllib.request, "urlopen", side_effect=fetch):
            self.assertEqual(bootstrap.get_artifact(self.artifact, self.cache, 2, False), "downloaded")
        self.assertEqual(len(requests), 2)
        self.assertEqual((self.cache / self.artifact["name"]).read_bytes(), self.content)

    def test_https_redirect_downgrade_is_rejected(self):
        class Downgraded(io.BytesIO):
            def geturl(self):
                return "http://untrusted.example/pkg"
        with patch.object(bootstrap.urllib.request, "urlopen", return_value=Downgraded(self.content)):
            with self.assertRaises(bootstrap.BootstrapError):
                bootstrap.get_artifact(self.artifact, self.cache, 2, False)
        self.assertFalse((self.cache / self.artifact["name"]).exists())

    def test_bundle_round_trip_and_tampering(self):
        self.cache.mkdir()
        (self.cache / self.artifact["name"]).write_bytes(self.content)
        bundle = self.root / "offline.zip"
        bootstrap.export_bundle(self.lock_path, self.lock, self.cache, bundle)
        other_cache = self.root / "offline"
        bootstrap.import_bundle(bundle, other_cache, self.lock)
        self.assertTrue(bootstrap.check_artifact(other_cache, self.artifact))
        bad_lock = {**self.lock, "profile": "not-the-same"}
        with self.assertRaises(bootstrap.BootstrapError):
            bootstrap.import_bundle(bundle, other_cache, bad_lock)

    def test_no_download_on_doctor_and_plan(self):
        with patch.object(bootstrap.urllib.request, "urlopen", side_effect=AssertionError("network called")):
            self.assertEqual(bootstrap.main(["--lock", str(self.lock_path), "--cache", str(self.cache), "plan"]), 0)


if __name__ == "__main__":
    unittest.main()
