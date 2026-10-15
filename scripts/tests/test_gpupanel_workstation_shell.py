from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
class PersonalWorkstationShellContract(unittest.TestCase):
    def test_assistant_only_in_authenticated_layout(self):
        self.assertIn('<AssistantDock />', (ROOT / 'frontend/apps/panel/src/layout/AppLayout.tsx').read_text())
        self.assertNotIn('AssistantDock', (ROOT / 'frontend/apps/panel/src/App.tsx').read_text())
        self.assertNotIn('AssistantDock', (ROOT / 'frontend/apps/panel/src/pages/LoginPage.tsx').read_text())
    def test_draft_has_no_connected_chat_or_execution(self):
        src = (ROOT / 'frontend/apps/panel/src/components/AssistantDock.tsx').read_text()
        self.assertIn('Chat is not connected yet', src)
        self.assertIn('navigator.clipboard.writeText', src)
        for forbidden in ('fetch(', 'eval(', 'exec(', 'innerHTML', 'localStorage'):
            self.assertNotIn(forbidden, src)
    def test_existing_ai_tools_remain(self):
        src = (ROOT / 'frontend/apps/panel/src/pages/ai/index.tsx').read_text()
        for tool in ('AccountsTab', 'McpTab', 'GpuTab', 'AgentsTab', 'LocalTab'):
            self.assertIn(tool, src)
