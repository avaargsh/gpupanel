from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend/src/views/home/gpupanel-first-run.vue"


class FirstRunContract(unittest.TestCase):
    def test_only_existing_routes(self):
        src = SOURCE.read_text()
        paths = ("/hosts/monitor/monitor", "/containers", "/apps/all")
        modules = "\n".join(p.read_text() for p in (ROOT / "frontend/src/routers/modules").glob("*.ts"))
        for path in paths:
            self.assertIn(f"'{path}'", src)
        self.assertIn("path: '/hosts/monitor/monitor'", modules)
        self.assertIn("path: '/containers'", modules)
        self.assertIn("path: 'all'", modules)
        self.assertNotIn("/workspaces", src)

    def test_real_status_permission_and_current_node(self):
        src = SOURCE.read_text()
        for needle in ("loadContainerStatus(currentNode.value", "hasRouteAccess(target)",
                       "Number.isFinite(response.data?.running)", "if (serial !== requestSerial) return",
                       "watch(currentNode", "if (canOpen(path))"):
            self.assertIn(needle, src)
        self.assertNotIn("localStorage", src)

    def test_i18n_and_home_entry(self):
        home = (ROOT / "frontend/src/views/home/index.vue").read_text()
        self.assertIn("<GPUPanelFirstRun", home)
        for language in ("zh", "en"):
            locale = (ROOT / f"frontend/src/lang/modules/{language}.ts").read_text()
            for token in ("firstRunTitle", "dockerUnavailable", "dockerReady", "appsStep"):
                self.assertIn(token + ":", locale)


if __name__ == "__main__":
    unittest.main()
