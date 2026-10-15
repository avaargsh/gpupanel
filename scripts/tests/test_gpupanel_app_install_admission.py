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

if __name__ == "__main__":
    unittest.main()
