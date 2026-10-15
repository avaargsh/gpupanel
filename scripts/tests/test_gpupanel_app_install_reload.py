"""React reload guards supplement executable receipt and browser tests."""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[2]
class PendingAppInstallRecoveryContract(unittest.TestCase):
    def test_recovery_blocks_submit_and_binds_original_host(self):
        s = (ROOT / 'frontend/apps/panel/src/pages/app/InstallModal.tsx').read_text()
        self.assertIn("readPendingAppInstall() ? 'uncertain' : 'idle'", s)
        self.assertIn('node !== originNode', s)
        self.assertIn('node !== pending.node', s)
        self.assertIn('clearPendingAppInstall(pending.taskID)', s)
    def test_receipt_is_small_per_tab_and_nonsecret(self):
        s = (ROOT / 'frontend/apps/panel/src/utils/app-install-pending.ts').read_text()
        self.assertIn('window.sessionStorage', s)
        self.assertIn('MAX_RECEIPT_BYTES', s)
        self.assertIn('expectedTaskID', s)
        for secret in ('password:', 'params:', 'token:', 'dockerCompose:'):
            self.assertNotIn(secret, s)
