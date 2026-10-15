"""Prevent a regression to read-before-create races in the App Store flow.

This is source-level gate only, not a live Docker or crash recovery test.
"""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "agent/app/service/app.go"
LOCK = ROOT / "agent/app/service/app_install_prepare_lock.go"
ROUTE = ROOT / "agent/app/api/v2/app.go"


class AppInstallPreparationContract(unittest.TestCase):
    def test_lock_encloses_synchronous_check_and_create(self):
        source = SOURCE.read_text(encoding="utf-8")
        block = source.split("func (a AppService) installWithHooks(", 1)[1]
        block = block.split("func (a AppService) SyncAppListFromLocal", 1)[0]
        self.assertLess(block.index("lockAppInstallPreparation(req.Name)"),
                        block.index("repo.WithByLowerName(req.Name)"))
        self.assertLess(block.index("repo.WithByLowerName(req.Name)"),
                        block.index("docker.CreateDefaultDockerNetwork()"))
        self.assertLess(block.index("docker.CreateDefaultDockerNetwork()"),
                        block.index("appInstallRepo.Create(context.Background(), appInstall)"))
        self.assertIn("defer unlockName()", block)
        self.assertIn("if lookupErr != nil", block)
        self.assertIn("return nil, fmt.Errorf", block)

    def test_lock_is_shared_by_non_http_install_paths(self):
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn("return a.installWithHooks(req, executeScript, nil)", source)
        self.assertIn("lockAppInstallPreparation(req.Name)", source)
        lock = LOCK.read_text(encoding="utf-8")
        self.assertIn("strings.ToLower(strings.TrimSpace(name))", lock)
        self.assertIn("lock.users++", lock)
        self.assertIn("lock.users--", lock)
        self.assertIn("delete(appInstallPreparationLocks.byName, key)", lock)

    def test_durable_task_id_admission_is_preserved(self):
        route = ROUTE.read_text(encoding="utf-8")
        self.assertLess(route.index("service.ReserveAppInstallTask(req.TaskID, req.Name)"),
                        route.index("appService.Install(req, true)"))
        self.assertIn("service.MarkAppInstallAdmissionFailed(req.TaskID)", route)


if __name__ == "__main__":
    unittest.main()
