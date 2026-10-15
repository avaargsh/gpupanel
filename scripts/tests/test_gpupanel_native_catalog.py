"""Guard the GPUPanel local-application portal and independent CLI catalog."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[2]
VIEW = ROOT / "frontend/src/views/app-store/apps/index.vue"


class LocalAppPortalTest(unittest.TestCase):
    def test_reuses_real_local_1panel_installation_workflow(self):
        src = VIEW.read_text()
        for token in ("searchApp(", "syncLocalApp(", "getAppByKey(", "<AppCard",
                      "<Install ref=", "<Detail ref=", "<TaskLog ref=",
                      "parseLocalAppPage(response.data)", "resource: 'local'"):
            self.assertIn(token, src)
        for forbidden in ("syncApp(", "syncCutomAppStore(", "resource: 'remote'",
                          "resource: 'all'", "catalogIndex.definitions.filter",
                          "v-for=\"item in visibleDefinitions\""):
            self.assertNotIn(forbidden, src)

    def test_failure_stale_and_empty_states_remain_distinct(self):
        src = VIEW.read_text()
        for token in ("loadError", "catalogLoadFailed", "catalogRetry",
                      "catalogEmpty", "catalogClearFilters", "searchRevision",
                      "onBeforeUnmount", "currentNode.value", "loading"):
            self.assertIn(token, src)
        self.assertIn("if (revision !== searchRevision || node !== currentNode.value) return;", src)
        self.assertIn("if (!isExist.value || !isActive.value || syncing.value) return;", src)

    def test_no_auto_install_from_inherited_deeplinks(self):
        src = VIEW.read_text()
        self.assertIn("legacyInstallRequested", src)
        self.assertNotIn("route.query.install)", src.replace("typeof route.query.install === 'string'", ""))
        self.assertIn("apps.value.some(", src)
        self.assertIn("installRef.value?.acceptParams({ app: response.data })", src)
        self.assertIn("syncLocalApp({ taskID })", src)
        self.assertIn("ElMessageBox.confirm", src)
        self.assertIn("syncRevision", src)

    def test_install_deep_link_does_not_bypass_route_authorization(self):
        source = (ROOT / "frontend/src/routers/index.ts").read_text()
        self.assertIn("if (!hasRouteAccess(to))", source)
        self.assertNotIn("to.path === '/apps/all' && to.query.install", source)

    def test_installed_management_and_cli_scaffold_are_retained(self):
        index = (ROOT / "frontend/src/views/app-store/index.vue").read_text()
        self.assertIn("'/apps/installed'", index)
        routes = (ROOT / "frontend/src/routers/modules/app-store.ts").read_text()
        self.assertIn("name: 'AppInstalled'", routes)
        self.assertIn("name: 'AppAll'", routes)
        doc = json.loads((ROOT / "catalog/index.json").read_text())
        self.assertGreater(len(doc["definitions"]), 0)
        self.assertEqual(doc["revisions"][0]["definitionId"], "gpupanel.dev.python-stdlib")

    def test_locales_do_not_promise_remote_synchronization(self):
        for lang in ("zh", "en"):
            content = (ROOT / f"frontend/src/lang/modules/{lang}.ts").read_text()
            for key in ("catalogNotice:", "catalogLocalSync:", "catalogLoadFailed:",
                        "catalogSyncPending:", "catalogSyncConfirm:", "catalogSyncFailed:", "catalogInstalled:"):
                self.assertIn(key, content)


if __name__ == "__main__":
    unittest.main()
