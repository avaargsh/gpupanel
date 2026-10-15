"""Static regression contracts for recovering ambiguous App Store installs.

These checks are intentionally narrow: they catch accidental removal of the
reload guard, but do not replace frontend type-check, real browser or Docker E2E.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
FORM = ROOT / "frontend/src/views/app-store/detail/install/index.vue"
HELPER = ROOT / "frontend/src/utils/app-install-pending.ts"


class PendingAppInstallRecoveryContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.form = FORM.read_text(encoding="utf-8")
        cls.helper = HELPER.read_text(encoding="utf-8")

    def test_receipt_is_saved_before_any_network_side_effect(self):
        block = self.form.split("const handleSubmit = async () => {", 1)[1]
        self.assertLess(block.index("savePendingAppInstall(receipt)"),
                        block.index("await installAppToNodes(submitData)"))
        self.assertLess(block.index("savePendingAppInstall(receipt)"),
                        block.index("await installApp(submitData)"))
        self.assertIn("if (!savePendingAppInstall(receipt))", block)
        self.assertIn("appInstallStorageUnavailable", block)
        self.assertIn("phase.value = 'uncertain'", block)

    def test_recovery_is_fail_closed_until_manual_review(self):
        self.assertIn("const recoveredReceipt = readPendingAppInstall()", self.form)
        self.assertIn("recoveredReceipt ? 'uncertain' : 'idle'", self.form)
        self.assertIn("lastAttemptTaskID = ref(recoveredReceipt?.taskID", self.form)
        self.assertIn("phase.value === 'uncertain'", self.form)
        self.assertIn("appInstallRetryConfirm", self.form)
        self.assertIn("clearPendingAppInstall(lastAttemptTaskID.value)", self.form)
        self.assertIn("openTaskLog(lastAttemptTaskID.value)", self.form)

    def test_receipt_binds_node_and_original_app(self):
        self.assertIn("node: currentNode.value || 'local'", self.form)
        self.assertIn("appKey: appKey.value", self.form)
        self.assertIn("pendingNode.value !== (currentNode.value || 'local')", self.form)
        self.assertIn("openWithTaskID(taskID, undefined, targetNode || pendingNode.value", self.form)
        self.assertIn("openTaskLog(taskID, receipt.node)", self.form)
        self.assertIn("pendingAppKey", self.form)

    def test_storage_is_per_tab_small_and_never_persists_secrets(self):
        h = self.helper
        self.assertIn("window.sessionStorage", h)
        self.assertNotIn("window.localStorage", h)
        self.assertIn("MAX_RECEIPT_BYTES", h)
        self.assertIn("UUID.test(receipt.taskID)", h)
        self.assertIn("readPendingAppInstall()?.taskID === receipt.taskID", h)
        self.assertIn("existing.taskID !== receipt.taskID", h)
        self.assertIn("expectedTaskID", h)
        for secret in ("password:", "params:", "apiKey:", "token:", "dockerCompose:"):
            self.assertNotIn(secret, h)
        self.assertIn("taskID: record.taskID", h)
        self.assertIn("node: record.node", h)
        self.assertIn("appKey: record.appKey", h)

    def test_explicit_translations_and_no_extra_install_api(self):
        for locale in ("zh", "en"):
            s = (ROOT / f"frontend/src/lang/modules/{locale}.ts").read_text(encoding="utf-8")
            self.assertIn("appInstallSwitchNode:", s)
            self.assertIn("appInstallStorageUnavailable:", s)
        self.assertNotIn("window.location.reload(", self.form)


if __name__ == "__main__":
    unittest.main()
