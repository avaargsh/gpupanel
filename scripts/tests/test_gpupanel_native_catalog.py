from pathlib import Path
import json
import unittest
ROOT = Path(__file__).resolve().parents[2]
class LocalAppPortalTest(unittest.TestCase):
    def test_real_local_api_and_distinct_error_empty_states(self):
        src = (ROOT / 'frontend/apps/panel/src/pages/app/store.tsx').read_text()
        for token in ("resource: 'local'", 'useSyncLocalAppsMutation', 'listQuery.currentData', 'listQuery.isError', 'listQuery.isFetching', 'apps.length === 0', 'window.confirm('):
            self.assertIn(token, src)
        self.assertNotIn('useSyncAppsMutation', src)
        self.assertNotIn("resource: 'all'", src)
    def test_installed_management_and_offline_catalog_retained(self):
        src = (ROOT / 'frontend/apps/panel/src/pages/app/index.tsx').read_text()
        self.assertIn('<InstalledTab', src)
        doc = json.loads((ROOT / 'catalog/index.json').read_text())
        self.assertGreater(len(doc['definitions']), 0)
        self.assertEqual(doc['revisions'][0]['definitionId'], 'gpupanel.dev.python-stdlib')
    def test_host_change_invalidates_api_cache(self):
        src = (ROOT / 'frontend/apps/panel/src/store/index.ts').read_text()
        self.assertIn('setCurrentNode.match(action)', src)
        self.assertIn('baseApi.util.resetApiState()', src)
