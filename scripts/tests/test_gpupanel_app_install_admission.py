"""Guard pre-side-effect admission for the GPUPanel application install API."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

class AppInstallAdmissionContract(unittest.TestCase):
    def test_api_reserves_before_invoking_mutating_service(self):
        source = (ROOT / "agent/app/api/v1/app.go").read_text()
        start = source.index("func (b *BaseApi) InstallApp(c *gin.Context) {")
        end = source.index("// @Tags App", start + 10)
        block = source[start:end]
        self.assertIn("service.NormalizeAppInstallTaskID(req.TaskID)", block)
        self.assertIn("service.ReserveAppInstallTask(req.TaskID, req.Name)", block)
        self.assertIn("service.MarkAppInstallAdmissionFailed(req.TaskID)", block)
        self.assertIn("errors.Is(err, service.ErrAppInstallTaskReplay)", block)
        self.assertLess(block.index("service.IsRetiredRemoteAppDetail"),
                        block.index("service.ReserveAppInstallTask"))
        self.assertLess(block.index("service.ReserveAppInstallTask"),
                        block.index("appService.Install(req, true)"))
        self.assertLess(block.index("appService.Install(req, true)"),
                        block.index("service.MarkAppInstallAdmissionFailed"))
        self.assertNotIn("os.Remove", block)
        self.assertNotIn("Delete", block)

    def test_claim_is_atomic_and_preserves_failed_receipts(self):
        source = (ROOT / "agent/app/service/app_install_admission.go").read_text()
        self.assertIn("clause.OnConflict", source)
        self.assertIn("DoNothing: true", source)
        self.assertIn("result.RowsAffected != 1", source)
        self.assertIn("ErrAppInstallTaskReplay", source)
        self.assertIn("gorm", source)
        self.assertIn("resource_id = 0", source)
        self.assertNotIn("Delete(", source)
        self.assertNotIn("O_TRUNC", source)

    def test_every_install_entrypoint_consumes_durable_execution_before_side_effects(self):
        service = (ROOT / "agent/app/service/app.go").read_text()
        start = service.index("func (a AppService) installWithHooks(")
        end = service.index("func (a AppService) SyncAppListFromLocal", start)
        block = service[start:end]
        self.assertIn("BeginAppInstallExecution(req.TaskID, req.Name)", block)
        self.assertLess(
            block.index("BeginAppInstallExecution(req.TaskID, req.Name)"),
            block.index("lockAppInstallPreparation(req.Name)"),
        )
        self.assertLess(
            block.index("BeginAppInstallExecution(req.TaskID, req.Name)"),
            block.index("docker.CreateDefaultDockerNetwork()"),
        )
        self.assertIn("return a.installWithHooks(req, executeScript, nil)", service)
        gate = (ROOT / "agent/app/service/app_install_execution_gate.go").read_text()
        self.assertIn("execution_started_at IS NULL", gate)
        self.assertIn("AND EXISTS (SELECT 1 FROM tasks", gate)
        self.assertIn("result.RowsAffected != 1", gate)
        self.assertNotIn("Delete(", gate)
        self.assertNotIn("MarkAppInstallAdmissionFailed(", gate)

if __name__ == "__main__":
    unittest.main()
