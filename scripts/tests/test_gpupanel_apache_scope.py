"""Fail-closed guard for four independently authored Apache-2.0 audit files."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
APACHE_FILES = (
    "scripts/gpupanel-license-audit.py",
    "scripts/tests/test_gpupanel_license_audit.py",
    "scripts/gpupanel-dependency-audit.py",
    "scripts/tests/test_gpupanel_dependency_audit.py",
)


class ApacheScopeTests(unittest.TestCase):
    def test_scoped_python_files_have_file_level_spdx(self):
        for name in APACHE_FILES:
            with self.subTest(path=name):
                path = ROOT / name
                self.assertTrue(path.is_file())
                first_lines = path.read_text(encoding="utf-8").splitlines()[:8]
                self.assertIn("# SPDX-License-Identifier: Apache-2.0", first_lines)
                self.assertIn("# Copyright 2026 GPUPanel contributors", first_lines)
                self.assertNotIn("# SPDX-License-Identifier: GPL-3.0-only", first_lines)

    def test_apache_license_copy_is_present(self):
        text = (ROOT / "LICENSES/Apache-2.0.txt").read_text(encoding="utf-8")
        self.assertIn("Apache License", text[:250])
        self.assertIn("Version 2.0, January 2004", text[:250])
        self.assertIn("END OF TERMS AND CONDITIONS", text)
        self.assertGreater(len(text), 10_000)

    def test_root_gpl_license_and_1panel_notice_remain(self):
        license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        notice = (ROOT / "NOTICE.md").read_text(encoding="utf-8")
        self.assertIn("GNU GENERAL PUBLIC LICENSE", license_text[:200])
        self.assertIn("Version 3", license_text[:200])
        self.assertIn("1Panel", notice)
        self.assertIn("GPL-3.0", notice)

    def test_documented_scope_exactly_lists_authorized_scripts(self):
        doc = (ROOT / "docs/gpupanel/APACHE_FILE_SCOPE.md").read_text(encoding="utf-8")
        for name in APACHE_FILES:
            self.assertIn(name, doc)
        self.assertIn("GPL-3.0", doc)


if __name__ == "__main__":
    unittest.main()
