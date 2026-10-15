"""Read-only unlinked App install TaskDB -> AppInstall DB UI contract."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "agent/app/service/app_install_receipt_inspect.go"
TASK = ROOT / "agent/app/service/task.go"
UI = ROOT / "frontend/src/components/log/file/index.vue"


class AppInstallReceiptContract(unittest.TestCase):
    def test_unlinked_task_is_intercepted_before_os_open(self):
        task = TASK.read_text(encoding="utf-8")
        self.assertLess(
            task.index("inspectUnlinkedInstallReceipt(taskModel, global.DB)"),
            task.index("os.Open(taskModel.LogFile)"),
        )
        helper = HELPER.read_text(encoding="utf-8")
        self.assertIn("receipt.ResourceID != 0", helper)
        self.assertIn('receipt.Operate != task.TaskInstall', helper)
        self.assertIn('strings.TrimSpace(receipt.LogFile) != ""', helper)

    def test_only_read_only_db_inspection(self):
        s = HELPER.read_text(encoding="utf-8")
        self.assertIn("Count(&count).Error", s)
        self.assertIn('Where("LOWER(name) = ?"', s)
        self.assertNotIn("db.Exec(", s)
        for mutation in (".Delete(", ".Updates(", ".Save(", ".Create(", ".Update("):
            self.assertNotIn(mutation, s)
        self.assertIn("state remain UNKNOWN", s)
        self.assertIn("Partial Docker or filesystem effects are still possible", s)

    def test_ui_disables_tailing_and_download_of_synthetic_log(self):
        s = UI.read_text(encoding="utf-8")
        self.assertIn("res.data.scope === 'admission'", s)
        self.assertIn("isTailDisabled.value = true;", s)
        self.assertIn("onCloseLog();", s)
        self.assertIn('v-if="showDownload && !!logPath"', s)


if __name__ == "__main__":
    unittest.main()
