# Copyright 2026 GPUPanel contributors
# SPDX-License-Identifier: Apache-2.0
# See LICENSES/Apache-2.0.txt for the license terms.

"""Synthetic Git histories exercise provenance conservatively, without network access."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-license-audit.py"
spec = importlib.util.spec_from_file_location("gpupanel_license_audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class LicenseAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        self.put("LICENSE", "GNU GENERAL PUBLIC LICENSE\nVersion 3\n")
        self.put("core/upstream.go", "// Copyright 1Panel contributors\npackage core\n")
        self.put("frontend/copied.vue", "<template>upstream</template>\n")
        self.git("add", ".")
        self.git("commit", "-qm", "upstream")
        self.base = self.git("rev-parse", "HEAD").strip()
        self.put("NOTICE.md", "1Panel contributors / GPL-3.0\n")
        self.put("core/upstream.go", "// Copyright 1Panel contributors\npackage core\n// changed\n")
        self.put("copy.vue", "<template>upstream</template>\n")
        self.put("docs/owned.md", "SPDX-License-Identifier: Apache-2.0\nOriginal independent text\n")
        self.put("assets/picture.svg", "<svg xmlns='http://www.w3.org/2000/svg'></svg>")
        self.git("add", ".")
        self.git("commit", "-qm", "fork")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True, text=True,
                              capture_output=True).stdout

    def put(self, name, content):
        dest = self.root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")

    def files(self, **kwargs):
        result = audit.inventory(self.root, baseline=self.base, **kwargs)
        return result, {row["path"]: row for row in result["files"]}

    def test_inherited_vs_changed_vs_copied_vs_new(self):
        report, files = self.files(verify_gpl=True)
        self.assertEqual(files["LICENSE"]["origin"], "INHERITED_UNCHANGED")
        self.assertEqual(files["core/upstream.go"]["origin"], "INHERITED_MODIFIED")
        self.assertEqual(files["core/upstream.go"]["review"], "KEEP_GPL")
        self.assertEqual(files["copy.vue"]["origin"], "EXACT_UPSTREAM_BLOB")
        self.assertEqual(files["copy.vue"]["upstream_paths"], ["frontend/copied.vue"])
        self.assertEqual(files["copy.vue"]["review"], "KEEP_GPL")
        self.assertEqual(files["docs/owned.md"]["origin"], "NEW_PATH_UNVERIFIED")
        self.assertEqual(files["docs/owned.md"]["spdx"], ["Apache-2.0"])
        self.assertEqual(files["docs/owned.md"]["review"], "UNKNOWN_BLOCK")
        self.assertEqual(files["assets/picture.svg"]["review"], "UNKNOWN_BLOCK")
        self.assertEqual(report["current_distribution_license"], "GPL-3.0 (fork; not relicensed)")

    def test_report_reproducible_and_ignores_dirty_worktree(self):
        first, _ = self.files()
        self.put("docs/owned.md", "Uncommitted edit that must be ignored")
        self.put("UNTRACKED", "untracked")
        second, _ = self.files()
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))
        self.assertNotIn("UNTRACKED", [r["path"] for r in second["files"]])

    def test_fail_closed_missing_baseline(self):
        with self.assertRaises(audit.AuditError):
            audit.inventory(self.root, baseline="deadbeef")

    def test_reject_unrelated_or_newer_baseline(self):
        current = self.git("rev-parse", "HEAD").strip()
        with self.assertRaises(audit.AuditError):
            audit.inventory(self.root, baseline=current, revision=self.base)

    def test_verify_gpl_rejects_license_edit(self):
        self.put("LICENSE", "Apache License\nVersion 2.0")
        self.git("add", "LICENSE")
        self.git("commit", "-qm", "bad relabel")
        with self.assertRaisesRegex(audit.AuditError, "LICENSE"):
            self.files(verify_gpl=True)
        self.assertEqual(self.files()[1]["LICENSE"]["origin"], "INHERITED_MODIFIED")

    def test_verify_gpl_rejects_missing_attribution(self):
        self.put("NOTICE.md", "Only GPUPanel")
        self.git("add", "NOTICE.md")
        self.git("commit", "-qm", "remove attribution")
        with self.assertRaisesRegex(audit.AuditError, "attribution"):
            self.files(verify_gpl=True)

    def test_binary_large_and_symlink_dont_get_false_license(self):
        (self.root / "binary.dat").write_bytes(b"a\x00b")
        (self.root / "large.txt").write_bytes(b"a" * (audit.MAX_SCAN_BYTES + 1))
        (self.root / "unsafe-link").symlink_to("LICENSE")
        self.git("add", ".")
        self.git("commit", "-qm", "special entries")
        _, records = self.files()
        self.assertEqual(records["binary.dat"]["scan"], "BINARY")
        self.assertEqual(records["large.txt"]["scan"], "OVERSIZE")
        self.assertEqual(records["unsafe-link"]["scan"], "NON_REGULAR")
        self.assertEqual(records["unsafe-link"]["review"], "UNKNOWN_BLOCK")

    def test_cli_report_json_and_no_silent_baseline_fallback(self):
        report = self.root / "inventory.json"
        code = audit.main(["--repo", str(self.root), "--baseline", self.base,
                           "--verify-gpl", "--output", str(report)])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(report.read_text())["schema_version"], 1)
        self.assertEqual(audit.main(["--repo", str(self.root),
                                     "--baseline", "not-a-commit"]), 2)


if __name__ == "__main__":
    unittest.main()
