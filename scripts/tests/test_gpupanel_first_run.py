from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
class FirstRunContract(unittest.TestCase):
    def test_status_comes_from_actual_docker_api_and_is_not_installation_proof(self):
        src = (ROOT / 'frontend/apps/panel/src/components/FirstRun.tsx').read_text()
        for item in ('useGetDockerStatusQuery', 'useGetContainerStatusQuery', 'isExist', 'isActive', 'Number.isFinite', 'currentData', 'state.ui.currentNode'):
            self.assertIn(item, src)
        self.assertIn('do not prove installation acceptance', src)
    def test_dashboard_has_no_synthesized_metrics(self):
        src = (ROOT / 'frontend/apps/panel/src/pages/HomePage.tsx').read_text()
        self.assertIn('<FirstRun />', src)
        self.assertNotIn('Math.sin', src)
        self.assertNotIn('Math.cos', src)
        self.assertNotIn('?? 8.6', src)
