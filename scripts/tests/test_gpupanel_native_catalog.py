"""GPUPanel native Catalog and legacy UI retirement contracts."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[2]
VIEW = ROOT / "frontend/src/views/app-store/apps/index.vue"

class CatalogPortalTest(unittest.TestCase):
    def test_portal_uses_canonical_index_and_no_original_sync(self):
        src = VIEW.read_text()
        self.assertIn("from '../../../../../catalog/index.json'", src)
        self.assertIn("catalogIndex.definitions.filter", src)
        for forbidden in ("syncApp(", "syncCutomAppStore(", "syncLocalApp(", "openInstall(", "Install ref=", "<AppCard"):
            self.assertNotIn(forbidden, src)
        self.assertIn("disabled class=", src)
        self.assertIn("item.id === 'gpupanel.dev.python-stdlib'", src)
        self.assertIn("showStarterGuide = true", src)
        self.assertIn("navigator.clipboard.writeText(pythonStarterCommands)", src)
        plan_block = src.split("const pythonStarterCommands = [", 1)[1].split("].join", 1)[0]
        self.assertNotIn("--approve", plan_block)
        self.assertIn("const pythonInstallCommands =", src)
        self.assertIn("const pythonUninstallCommand =", src)
        self.assertNotIn("exec(", src)
        self.assertNotIn("syncApp(", src)
    def test_installed_management_link_stays(self):
        index = (ROOT / "frontend/src/views/app-store/index.vue").read_text()
        self.assertIn("'/apps/installed'", index)
        self.assertNotIn("searchAppInstalled(", index)
        routes = (ROOT / "frontend/src/routers/modules/app-store.ts").read_text()
        self.assertIn("name: 'AppInstalled'", routes)
        self.assertIn("name: 'AppAll'", routes)
    def test_definition_count_matches_single_source(self):
        doc = json.loads((ROOT / "catalog/index.json").read_text())
        self.assertGreater(len(doc["definitions"]), 0)
        self.assertEqual(len(doc["revisions"]), 1)
        for item in doc["definitions"]:
            self.assertIn(item["status"], ("planned", "experimental"))
        self.assertEqual(doc["revisions"][0]["definitionId"], "gpupanel.dev.python-stdlib")
    def test_locales_announce_non_installable_state(self):
        for language in ("zh","en"):
            s=(ROOT / f"frontend/src/lang/modules/{language}.ts").read_text()
            for field in ("catalogNav:", "catalogNotice:", "catalogUnavailable:", "catalogInstalled:"):
                self.assertIn(field,s)

if __name__=="__main__":
    unittest.main()
