from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
class PortalLinksTest(unittest.TestCase):
    def test_shortcuts_map_to_current_router(self):
        src = (ROOT / 'frontend/apps/panel/src/components/FirstRun.tsx').read_text()
        routes = (ROOT / 'frontend/apps/panel/src/routes/index.tsx').read_text()
        for route in ('host', 'containers', 'apps', 'ai'):
            self.assertIn(f"path: '{route}'", routes)
            self.assertIn(f"'/{route}", src)
        self.assertNotIn('/workspaces', src)
    def test_workstation_stays_inside_authenticated_layout(self):
        guard = (ROOT / 'frontend/apps/panel/src/routes/ProtectedRoute.tsx').read_text()
        self.assertIn('isAuthenticated', guard)
        self.assertIn('<Navigate to="/login"', guard)
        routes = (ROOT / 'frontend/apps/panel/src/routes/index.tsx').read_text()
        self.assertIn('<ProtectedRoute>', routes)
