"""Synthetic offline tests; no Go download/build, no external dependencies."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-go-license-evidence.py"
spec = importlib.util.spec_from_file_location("gpupanel_go_license_evidence", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class GoLicenseEvidenceTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.cache = self.root / "cache"
        self.cache.mkdir()
        for scope in ("core", "agent"):
            (self.root / scope).mkdir()
        self.mod = self.cache / "github.com" / "example" / "p@v1.0.0"
        self.mod.mkdir(parents=True)
        (self.mod / "LICENSE").write_text("MIT\nfixture only\n")
        self.main = {"Path": "github.com/avaargsh/GPUPanel/core", "Main": True}
        self.entry = {"Path": "github.com/example/p", "Version": "v1.0.0", "Dir": str(self.mod)}
        self.dep = {"module": "github.com/example/p", "version": "v1.0.0"}
        self.built = {"main_module": self.main["Path"], "dependencies": [self.dep]}

    def test_multiple_go_json_documents(self):
        raw = json.dumps(self.main) + "\n" + json.dumps(self.entry) + "\n"
        self.assertEqual(len(audit.json_documents(raw)), 2)

    def test_duplicate_or_malformed_module_json_fails_closed(self):
        with self.assertRaisesRegex(audit.EvidenceError, "duplicate"):
            audit.json_documents(json.dumps(self.entry) + json.dumps(self.entry))
        with self.assertRaisesRegex(audit.EvidenceError, "malformed"):
            audit.json_documents('{"Path":')
        with self.assertRaisesRegex(audit.EvidenceError, "without Path"):
            audit.json_documents('{"Version": "1"}')

    def test_actual_binary_module_legal_file_digest_never_grants_rights(self):
        result = audit.analyse("core", self.built, [self.main, self.entry], self.cache, self.root)
        item = result["modules"][0]
        self.assertEqual(result["counts"], {"LEGAL_FILE_HASH_REVIEW": 1})
        self.assertEqual(item["effective_version"], "v1.0.0")
        self.assertEqual(item["legal_documents"][0]["sha256"],
                         audit.hashlib.sha256(b"MIT\nfixture only\n").hexdigest())

    def test_missing_legal_files_record_missing_not_false_mit(self):
        (self.mod / "LICENSE").unlink()
        result = audit.analyse("core", self.built, [self.main, self.entry], self.cache, self.root)
        self.assertEqual(result["counts"], {"LEGAL_FILE_MISSING_REVIEW": 1})

    def test_symlink_to_external_legal_file_is_not_followed(self):
        (self.mod / "LICENSE").unlink()
        (self.mod / "LICENSE").symlink_to("/etc/passwd")
        result = audit.analyse("core", self.built, [self.main, self.entry], self.cache, self.root)
        self.assertEqual(result["counts"], {"LEGAL_FILES_UNREADABLE_REVIEW": 1})
        self.assertEqual(result["modules"][0]["legal_documents"][0]["state"], "UNSAFE_OR_OVERSIZE")

    def test_undownloaded_go_source_is_not_license_cleared(self):
        without_dir = dict(self.entry)
        without_dir.pop("Dir")
        result = audit.analyse("core", self.built, [without_dir], self.cache, self.root)
        self.assertEqual(result["counts"], {"MODULE_SOURCE_NOT_PRESENT": 1})

    def test_outside_module_cache_is_not_silently_trusted(self):
        entry = dict(self.entry, Dir=str(self.root / "core"))
        self.assertEqual(audit.analyse("core", self.built, [entry], self.cache, self.root)["counts"],
                         {"MODULE_SOURCE_OUTSIDE_CACHE": 1})

    def test_binary_version_mismatch_is_fatal(self):
        with self.assertRaisesRegex(audit.EvidenceError, "binary module mismatch"):
            audit.analyse("core", self.built, [dict(self.entry, Version="v2.0.0")],
                          self.cache, self.root)

    def test_mismatched_fork_replacement_is_fatal(self):
        fork = {"Path": "github.com/fork/p", "Version": "v1.0.1", "Dir": str(self.mod)}
        entry = dict(self.entry, Replace=fork)
        with self.assertRaisesRegex(audit.EvidenceError, "inconsistent replacement"):
            audit.analyse("core", self.built, [entry], self.cache, self.root)
        built = {"main_module": self.main["Path"], "dependencies": [
            dict(self.dep, replacement={"module_or_path": "github.com/fork/p", "version": "v2.0.0"})]}
        with self.assertRaisesRegex(audit.EvidenceError, "replacement version mismatch"):
            audit.analyse("core", built, [entry], self.cache, self.root)

    def test_exact_fork_source_version_recorded_without_license_clearance(self):
        fork = {"Path": "github.com/1Panel-dev/lego/v5", "Version": "v5.3.1", "Dir": str(self.mod)}
        entry = dict(self.entry, Replace=fork)
        built = {"main_module": self.main["Path"], "dependencies": [
            dict(self.dep, replacement={"module_or_path": fork["Path"], "version": fork["Version"]})]}
        result = audit.analyse("core", built, [entry], self.cache, self.root)
        self.assertEqual(result["modules"][0]["effective_source"], fork["Path"])
        self.assertTrue(result["modules"][0]["replaced"])

    def test_main_graph_and_report_validation(self):
        input_path = self.root / "binary.json"
        report = {"result": "GO_BINARY_MODULE_METADATA_MATCHES_SOURCE",
                  "source_commit": "a" * 40, "archive_sha256": "b" * 64,
                  "binaries": {
                      scope: {"main_module": "github.com/avaargsh/GPUPanel/" + scope,
                              "dependencies": [self.dep]}
                      for scope in ("core", "agent")
                  }}
        input_path.write_text(json.dumps(report))
        def command(_root, scope, *args):
            if args[:2] == ("env", "GOMODCACHE"):
                return str(self.cache)
            return json.dumps({"Path": "github.com/avaargsh/GPUPanel/" + scope, "Main": True}) + "\n" + json.dumps(self.entry)
        with patch.object(audit, "go_command", side_effect=command):
            evidence = audit.inventory(self.root, input_path)
        self.assertEqual(set(evidence["binaries"]), {"core", "agent"})
        self.assertFalse(evidence["rights_clearance"])
        self.assertFalse(evidence["complete_sbom"])
        report["result"] = "UNVERIFIED"
        input_path.write_text(json.dumps(report))
        with self.assertRaisesRegex(audit.EvidenceError, "verified preview"):
            audit.inventory(self.root, input_path)


if __name__ == "__main__":
    unittest.main()
