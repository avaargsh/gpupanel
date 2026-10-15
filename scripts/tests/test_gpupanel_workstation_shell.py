"""Static UI boundary checks; Vue/TypeScript are compiled by gpupanel-portal-checks."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
AI_ROUTES = ROOT / "frontend/src/routers/modules/ai.ts"
LAYOUT = ROOT / "frontend/src/layout/index.vue"
DOCK = ROOT / "frontend/src/components/gpupanel-assistant/assistant-dock.vue"
QUICK = ROOT / "frontend/src/views/home/gpupanel-quickstart.vue"


class PersonalWorkstationShellContract(unittest.TestCase):
    def test_login_and_public_views_do_not_load_assistant(self):
        layout = LAYOUT.read_text(encoding="utf-8")
        self.assertIn('GPUPanelAssistantDock v-if="!isFullScreen"', layout)
        self.assertIn("import GPUPanelAssistantDock from", layout)
        root = (ROOT / "frontend/src/App.vue").read_text(encoding="utf-8")
        self.assertNotIn("GPUPanelAssistantDock", root)

    def test_agent_and_mcp_configuration_remain_routable_but_not_in_menu(self):
        routes = AI_ROUTES.read_text(encoding="utf-8")
        for name in ("Agents", "MCPServer"):
            pattern = r"name: '" + name + r"',[\s\S]{0,350}?hidden: true,"
            # 'hidden' may be placed before name; inspect the bounded block.
            block = re.search(
                r"\{\s*path: '[^']+',\s*name: '" + name + r"',(?P<body>[\s\S]*?)\n\s*\},",
                routes,
            )
            self.assertIsNotNone(block, name)
            self.assertIn("hidden: true", block.group("body"))
        for path in ("/ai/gpu/current", "/ai/model/account"):
            self.assertIn(path, routes)

    def test_no_live_chat_claim_or_unsafe_execution(self):
        source = DOCK.read_text(encoding="utf-8")
        self.assertIn("聊天服务尚未接通", source)
        self.assertIn("Chat is not connected yet", source)
        self.assertIn("navigator.clipboard.writeText", source)
        self.assertIn("hasRouteAccess(target)", source)
        for banned in ("fetch(", "axios(", "http.post(", "eval(", "exec(", "innerHTML", "localStorage.setItem"):
            self.assertNotIn(banned, source)

    def test_existing_workstation_routes_remain_on_dashboard(self):
        source = QUICK.read_text(encoding="utf-8")
        for path in ("/ai/gpu/current", "/containers", "/hosts/files", "/terminal",
                     "/ai/model/account", "/apps/all", "/hosts/disk"):
            self.assertIn("path: '" + path + "'", source)
        self.assertIn("hasRouteAccess(target)", source)


if __name__ == "__main__":
    unittest.main()
