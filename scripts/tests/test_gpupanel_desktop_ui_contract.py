"""UI-shell contract checks; no browser session or Docker needed."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / "desktop/ui/index.html"
JS = ROOT / "desktop/ui/app.js"
GO = list((ROOT / "desktop").glob("*.go"))


class Elements(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.duplicates = set()

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if "id" in values:
            if values["id"] in self.ids:
                self.duplicates.add(values["id"])
            self.ids.add(values["id"])


class DesktopUIContractTests(unittest.TestCase):
    def test_every_dom_reference_exists_and_is_unique(self):
        parser = Elements()
        parser.feed(HTML.read_text())
        self.assertFalse(parser.duplicates, parser.duplicates)
        refs = re.findall(r"\$\('([a-z-]+)'\)", JS.read_text())
        self.assertGreaterEqual(len(refs), 12)
        self.assertEqual(sorted(set(refs) - parser.ids), [])

    def test_profile_and_bundle_buttons_have_real_callbacks(self):
        frontend = JS.read_text()
        methods = {
            "ProfileBackup", "ProfileImportPlan", "ProfileImport",
            "BundleExport", "BundleInspect", "BundleRestore",
            "LauncherPlan", "LauncherInstall",
            "UvProjectPlan", "UvProjectStatus", "UvProjectCreate",
            "OpenProjectTerminal", "OpenProjectEditor",
            "UvToolPlan", "UvToolInstall", "UvToolStatus",
            "SourcePlan", "SourceExport", "SourceInspect", "SourceRestore",
        }
        source = "\n".join(file.read_text() for file in GO)
        for name in sorted(methods):
            with self.subTest(method=name):
                self.assertIn("action('" + name + "'", frontend)
                self.assertIn("func (s *DesktopService) " + name + "(", source)

    def test_polkit_approval_consumed_and_distinct_statuses_visible(self):
        source = JS.read_text()
        self.assertIn("const approved = installDigest;", source)
        self.assertIn("installDigest = '';", source)
        self.assertIn("AUTH_CANCELLED:", source)
        self.assertIn("AUTH_NOT_GRANTED:", source)
        self.assertIn("UNKNOWN: '安装结果未知 / 必须先对账'", source)
        self.assertIn("reconciliationRequired: receipt.reconciliationRequired", source)
        self.assertIn("先人工核对 dpkg 状态", source)

    def test_native_workstation_has_no_required_core_endpoint(self):
        js = JS.read_text()
        self.assertNotIn("/api/v1", js)
        self.assertNotIn("fetch(", js)
        self.assertIn("BundleInspect", js)
        self.assertIn("ProfileImportPlan", js)


if __name__ == "__main__":
    unittest.main()
