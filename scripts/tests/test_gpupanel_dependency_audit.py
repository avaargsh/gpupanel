# Copyright 2026 GPUPanel contributors
# SPDX-License-Identifier: Apache-2.0
# See LICENSES/Apache-2.0.txt for the license terms.

"""Offline fixture tests for a conservative third-party dependency inventory."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-dependency-audit.py"
spec = importlib.util.spec_from_file_location("gpupanel_dependency_audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class DependencyAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write_json("frontend/package.json", {
            "name": "fixture", "dependencies": {"vue": "^3.5"},
            "devDependencies": {"vite": "^8.0"}})
        self.write_json("frontend/package-lock.json", {
            "name": "fixture", "lockfileVersion": 3,
            "packages": {
                "": {"name": "fixture", "dependencies": {"vue": "^3.5"},
                     "devDependencies": {"vite": "^8.0"}},
                "node_modules/vue": {"version": "3.5.43", "license": "MIT"},
                "node_modules/vite": {"version": "8.2.0"},
                "node_modules/vue/node_modules/@scope/helper": {
                    "version": "1.0.0", "license": "Apache-2.0"}}})
        self.write("core/go.mod", """module github.com/example/core
go 1.26.6
require (
    github.com/example/dependency v1.2.3
    github.com/example/inner v0.9.0 // indirect
)
""")
        self.write("agent/go.mod", """module github.com/example/agent
go 1.26.6
replace github.com/example/lego => github.com/fork/lego v1.2.3
require github.com/example/lego v1.2.3
""")

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def write_json(self, name, value):
        self.write(name, json.dumps(value))

    def test_npm_locked_metadata_is_hint_not_license_clearance(self):
        result = audit.inventory(self.root)
        self.assertEqual(result["summary"]["npm_entries"], 3)
        self.assertEqual(result["summary"]["npm_missing_license_hints"], 1)
        self.assertEqual(result["overall_review"], "THIRD_PARTY_REVIEW")
        p = {x["path"]: x for x in result["npm"]["packages"]}
        self.assertEqual(p["node_modules/vue"]["license_hint"], "MIT")
        self.assertEqual(p["node_modules/vue"]["review"], "THIRD_PARTY_REVIEW")
        self.assertEqual(p["node_modules/vue/node_modules/@scope/helper"]["name"], "@scope/helper")
        self.assertEqual(p["node_modules/vite"]["review"], "THIRD_PARTY_REVIEW")

    def test_go_require_and_fork_replace(self):
        result = audit.inventory(self.root)
        self.assertEqual(result["summary"]["go_require_entries"], 3)
        self.assertEqual(result["summary"]["go_direct_entries"], 2)
        self.assertEqual(result["summary"]["go_replace_entries"], 1)
        req = result["go"]["core"]["requirements"]
        self.assertEqual([r["scope"] for r in req], ["direct", "indirect"])
        replacement = result["go"]["agent"]["replacements"][0]
        self.assertEqual(replacement["to"], "github.com/fork/lego")
        self.assertEqual(replacement["review"], "FORK_REPLACEMENT_REVIEW")

    def test_local_go_replace_is_flagged(self):
        self.write("agent/go.mod", """module github.com/example/agent
replace github.com/example/test => ../test
require github.com/example/test v1.0.0
""")
        record = audit.inventory(self.root)["go"]["agent"]["replacements"][0]
        self.assertEqual(record["review"], "LOCAL_REPLACEMENT_REVIEW")

    def test_missing_lock_version_fails_closed(self):
        lock = json.loads((self.root / "frontend/package-lock.json").read_text())
        lock["packages"]["node_modules/vue"].pop("version")
        self.write_json("frontend/package-lock.json", lock)
        with self.assertRaisesRegex(audit.AuditError, "without locked version"):
            audit.inventory(self.root)

    def test_mismatched_npm_manifest_fails_closed(self):
        package = json.loads((self.root / "frontend/package.json").read_text())
        package["dependencies"]["new-package"] = "^1.0"
        self.write_json("frontend/package.json", package)
        with self.assertRaisesRegex(audit.AuditError, "disagree"):
            audit.inventory(self.root)

    def test_malformed_go_directive_fails_closed(self):
        self.write("core/go.mod", "module github.com/example/core\nrequire github.com/oops\n")
        with self.assertRaisesRegex(audit.AuditError, "malformed require"):
            audit.inventory(self.root)

    def test_deterministic_json_and_read_only(self):
        before = [p.read_bytes() for p in sorted(self.root.rglob("*")) if p.is_file()]
        first = audit.inventory(self.root)
        second = audit.inventory(self.root)
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))
        self.assertEqual(before, [p.read_bytes() for p in sorted(self.root.rglob("*")) if p.is_file()])
        self.assertEqual(len(first["go"]["core"]["manifest_sha256"]), 64)

    def test_cli_output_and_invalid_input(self):
        dest = self.root / "report.json"
        self.assertEqual(audit.main(["--repo", str(self.root), "--output", str(dest)]), 0)
        self.assertEqual(json.loads(dest.read_text())["schema_version"], 1)
        (self.root / "frontend/package-lock.json").write_text("{invalid")
        self.assertEqual(audit.main(["--repo", str(self.root)]), 2)

    def test_symlink_lock_entry_not_assumed_resolved(self):
        lock = json.loads((self.root / "frontend/package-lock.json").read_text())
        lock["packages"]["node_modules/my-link"] = {"link": True, "resolved": "../workspace"}
        self.write_json("frontend/package-lock.json", lock)
        result = audit.inventory(self.root)
        item = next(x for x in result["npm"]["packages"] if x["name"] == "my-link")
        self.assertEqual(item["review"], "LINK_REVIEW")
        self.assertIsNone(item["version"])


if __name__ == "__main__":
    unittest.main()
