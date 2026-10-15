"""Source-level guard for UNKNOWN outcomes on interrupted App installs.

This complements SQLite Go tests; it does not prove live Docker reconciliation
or protect across simultaneous Agent processes.
"""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class InterruptedAppInstallUnknownContract(unittest.TestCase):
    def test_task_restart_recovery_is_transactional_and_install_specific(self):
        source = read("agent/app/repo/task.go")
        block = source.split("func reconcileRunningTasksOnRestart(", 1)[1].split("\nfunc ", 1)[0]
        self.assertIn("db.Transaction(", block)
        self.assertIn('constant.StatusExecuting, "App", "TaskInstall"', block)
        self.assertRegex(block, r'"status":\s+constant.StatusUnknown')
        self.assertIn('"status": constant.StatusFailed', block)
        self.assertLess(block.index("constant.StatusUnknown"), block.index("constant.StatusFailed"))
        self.assertIn("return reconcileRunningTasksOnRestart(global.TaskDB)", source)

    def test_startup_preserves_install_row_as_unknown(self):
        source = read("agent/app/service/app_install.go")
        block = source.split("func (a *AppInstallService) SyncAll(", 1)[1].split("\nfunc ", 1)[0]
        self.assertIn("if systemInit && i.Status == constant.StatusInstalling", block)
        self.assertIn("markInterruptedAppInstallationUnknown(global.DB, &i)", block)
        self.assertLess(block.index("markInterruptedAppInstallationUnknown(global.DB, &i)"),
                        block.index("i.Status = appInstallOperationFailureStatus(i.Status)"))
        self.assertIn("if appInstall.Status == constant.StatusUnknown", source)
        self.assertIn("return nil", source)

    def test_unknown_is_not_silently_reclassified_by_normal_refresh(self):
        source = read("agent/app/service/app_utils.go")
        self.assertIn("installed.Status == constant.StatusUnknown", source)
        status = read("agent/app/service/app_operation_status.go")
        self.assertIn("updated_at = ?", status)
        self.assertIn('"status": constant.StatusUnknown', status)
        self.assertNotIn("compose.Up(", status)
        self.assertNotIn("docker.NewClient()", status)

    def test_unknown_blocks_management_side_effects(self):
        source = read("agent/app/service/app_install.go")
        for marker in (
            'requireReconciledAppInstallation(install.Status, string(req.Operate))',
            'requireReconciledAppInstallation(installed.Status, "update")',
            'requireReconciledAppInstallation(appInstall.Status, "change-port")',
        ):
            self.assertIn(marker, source)
        status = read("agent/app/service/app_operation_status.go")
        self.assertIn('case "sync", "favorite":', status)
        self.assertIn("application installation outcome is unknown", status)

    def test_no_automatic_replay_of_install_request(self):
        source = read("agent/app/service/task.go")
        self.assertIn("return taskRepo.UpdateRunningTaskToFailed()", source)
        doc = read("docs/gpupanel/LOCAL_APP_STORE.md")
        self.assertIn("UNKNOWN", doc)
        self.assertIn("NOT RUN", doc)


if __name__ == "__main__":
    unittest.main()
