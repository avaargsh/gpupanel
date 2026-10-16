"""Offline fixture regression suite for pnpm package license-text evidence."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-pnpm-license-evidence.py"
spec = importlib.util.spec_from_file_location("gpupanel_installed_license_evidence", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class InstalledLicenseEvidenceTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.store = self.root / "frontend/node_modules/.pnpm"
        self.store.mkdir(parents=True)

    def make_package(self, name: str, version="1.0.0", *, peer="", license="MIT", doc=True):
        slug = name.replace("/", "+")
        target = self.store / f"{slug}@{version}{peer}" / "node_modules" / name
        target.mkdir(parents=True)
        metadata = {"name": name, "version": version}
        if license is not None:
            metadata["license"] = license
        (target / "package.json").write_text(json.dumps(metadata))
        if doc:
            (target / "LICENSE").write_text(f"{name} license evidence fixture")
        return target

    @staticmethod
    def expected(*names):
        return [{"name": name, "version": "1.0.0"} for name in names]

    def test_scoped_package_license_hash_is_evidence_not_clearance(self):
        self.make_package("@scope/engine")
        result = audit.collect(self.root, self.expected("@scope/engine"))
        record = result["packages"][0]
        self.assertEqual(record["state"], "LICENSE_TEXT_FOUND_REVIEW")
        self.assertEqual(record["evidence"]["license_hint"], "MIT")
        self.assertEqual(len(record["evidence"]["license_documents"][0]["sha256"]), 64)
        self.assertFalse(result["rights_clearance"])
        self.assertFalse(result["release_bom_verified"])

    def test_missing_license_text_is_visible_even_with_mit_metadata(self):
        self.make_package("engine", doc=False)
        result = audit.collect(self.root, self.expected("engine"))
        self.assertEqual(result["counts"], {"LICENSE_TEXT_MISSING_REVIEW": 1})

    def test_uninstalled_optional_lock_record_is_not_called_a_violation(self):
        self.make_package("engine")
        result = audit.collect(self.root, self.expected("engine", "platform-optional"))
        self.assertEqual(result["counts"]["NOT_INSTALLED_IN_THIS_ENV"], 1)
        self.assertEqual(result["observed_identities"], 1)

    def test_unlocked_installed_metadata_is_reported(self):
        self.make_package("engine")
        self.make_package("unexpected")
        result = audit.collect(self.root, self.expected("engine"))
        self.assertEqual(result["unlocked_installed_identities"],
                         [{"name": "unexpected", "version": "1.0.0"}])

    def test_conflicting_peer_resolution_license_is_not_silently_chosen(self):
        self.make_package("engine", peer="_react18", license="MIT")
        self.make_package("engine", peer="_react19", license="Apache-2.0")
        result = audit.collect(self.root, self.expected("engine"))
        self.assertEqual(result["counts"], {"CONFLICTING_INSTALLED_EVIDENCE": 1})
        self.assertIsNone(result["packages"][0]["evidence"])

    def test_symlinked_metadata_is_rejected_without_following(self):
        path = self.make_package("engine")
        (path / "package.json").unlink()
        (path / "package.json").symlink_to("/etc/passwd")
        with self.assertRaisesRegex(audit.EvidenceError, "unsafe"):
            audit.collect(self.root, self.expected("engine"))

    def test_symlinked_license_is_not_read(self):
        path = self.make_package("engine", doc=False)
        (path / "LICENSE").symlink_to("/etc/passwd")
        result = audit.collect(self.root, self.expected("engine"))
        entry = result["packages"][0]["evidence"]["license_documents"][0]
        self.assertEqual(entry["state"], "UNREADABLE_OR_OVERSIZE")
        self.assertEqual(result["counts"], {"LICENSE_TEXT_MISSING_REVIEW": 1})

    def test_missing_store_fails_closed(self):
        self.store.rmdir()
        with self.assertRaisesRegex(audit.EvidenceError, "virtual store missing"):
            audit.collect(self.root, self.expected("engine"))

    def test_bad_installed_json_fails_closed(self):
        path = self.make_package("engine")
        (path / "package.json").write_text("{bad")
        with self.assertRaisesRegex(audit.EvidenceError, "malformed"):
            audit.collect(self.root, self.expected("engine"))

    def test_same_evidence_multiple_peers_is_one_identity(self):
        self.make_package("engine", peer="_react18")
        self.make_package("engine", peer="_react19")
        result = audit.collect(self.root, self.expected("engine"))
        self.assertEqual(result["packages"][0]["variants"], 2)
        self.assertEqual(result["counts"], {"LICENSE_TEXT_FOUND_REVIEW": 1})


if __name__ == "__main__":
    unittest.main()
