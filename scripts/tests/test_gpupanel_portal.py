"""Static route and authorization contract for GPUPanel quickstart.

Not a substitute for Vue type-check or interactive browser acceptance.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "frontend/src/views/home/gpupanel-quickstart.vue"


class PortalLinksTest(unittest.TestCase):
    def test_shortcuts_exist_in_real_router_modules(self):
        content = COMPONENT.read_text()
        routes = set(re.findall(r"path: '(/[^']+)'", content))
        expected = {
            "/ai/gpu/current", "/hosts/monitor/monitor", "/containers",
            "/hosts/files", "/terminal", "/ai/model/account", "/apps/all", "/hosts/disk",
        }
        self.assertEqual(routes, expected)
        module_texts = "\n".join(p.read_text() for p in
            (ROOT / "frontend/src/routers/modules").glob("*.ts"))
        for path in routes:
            with self.subTest(path=path):
                if path == "/apps/all":
                    # The app catalog is a registered nested child of /apps.
                    self.assertIn("path: '/apps'", module_texts)
                    self.assertIn("path: 'all'", module_texts)
                else:
                    self.assertIn(f"path: '{path}'", module_texts)

    def test_permission_filter_used_for_visibility_and_click(self):
        content = COMPONENT.read_text()
        self.assertIn("hasRouteAccess(target)", content)
        self.assertIn("router.resolve(path)", content)
        self.assertIn("entries.filter((entry) => canOpen(entry.path))", content)
        self.assertIn("if (canOpen(path))", content)

    def test_labels_available_and_no_placeholder_future_routes(self):
        for locale in ("zh", "en"):
            code = (ROOT / f"frontend/src/lang/modules/{locale}.ts").read_text()
            self.assertIn("quickStartDescription:", code)
        text = COMPONENT.read_text()
        self.assertNotIn("/gpu-compute-platform", text)
        self.assertNotIn("/workspaces", text)


if __name__ == "__main__":
    unittest.main()
