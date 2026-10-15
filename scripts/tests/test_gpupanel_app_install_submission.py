"""React install boundary; interactive negative controls live in scripts/browser/remote-integration.py."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
class AppInstallSubmissionContract(unittest.TestCase):
    def test_single_flight_and_confirmation_precede_post(self):
        s = (ROOT / 'frontend/apps/panel/src/pages/app/InstallModal.tsx').read_text()
        self.assertLess(s.index('singleFlight.current = true'), s.index('window.confirm('))
        self.assertLess(s.index('window.confirm('), s.index('await install('))
        self.assertIn("phase !== 'idle'", s)
        self.assertIn('singleFlight.current = false; return;', s)
    def test_receipt_is_saved_before_install_and_http_is_not_success(self):
        s = (ROOT / 'frontend/apps/panel/src/pages/app/InstallModal.tsx').read_text()
        self.assertLess(s.index('savePendingAppInstall(receipt)'), s.index('await install('))
        self.assertIn("setPhase('uncertain')", s)
        self.assertNotIn('Toast.success', s)
        self.assertIn('detailQuery.currentData', s)
        self.assertIn('detailQuery.isFetching', s)
