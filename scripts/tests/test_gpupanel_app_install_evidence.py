"""Read-only App installation evidence contract (not a Docker E2E)."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

def source(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")

class ReadOnlyInstallEvidenceContract(unittest.TestCase):
    def test_endpoint_uses_existing_app_router(self):
        route = source("agent/router/ro_app.go")
        api = source("agent/app/api/v2/app_install.go")
        self.assertIn('appRouter.GET("/installed/evidence/:appInstallId", baseApi.GetAppInstallEvidence)', route)
        self.assertIn('service.InspectAppInstallEvidence(appInstallId)', api)
        self.assertIn('helper.GetIntParamByKey(c, "appInstallId")', api)
        self.assertNotIn('appRouter.POST("/installed/evidence', route)
        self.assertIn('c.Header("Cache-Control", "no-store")', api)

    def test_pure_snapshot_never_resolves_unknown_or_mutates_resources(self):
        impl = source("agent/app/service/app_install_evidence.go")
        self.assertIn("func inspectAppInstallEvidence(", impl)
        self.assertIn('Classification: appEvidenceUnknown', impl)
        self.assertIn('Verified: false', impl)
        self.assertIn('install.Status == constant.StatusUnknown', impl)
        for forbidden in (
            "compose.Up(", "compose.Down(", "docker.CreateDefaultDockerNetwork(",
            ".Delete(", ".Updates(", ".Save(", ".Create(", "os.Remove(", "exec.Command(",
        ):
            self.assertNotIn(forbidden, impl)
        self.assertIn('Where("type = ? AND operate = ? AND resource_id = ?", "App", "TaskInstall", id)', impl)

    def test_no_secret_or_raw_docker_payload_in_response(self):
        impl = source("agent/app/service/app_install_evidence.go")
        self.assertNotIn('json:"env"', impl)
        self.assertNotIn('json:"password"', impl)
        self.assertNotIn('json:"params"', impl)
        self.assertNotIn('json:"labels"', impl)
        self.assertNotIn('json:"dockerCompose"', impl)
        response_dto = impl.split("type AppInstallEvidence struct {", 1)[1].split("type AppInstallContainerState", 1)[0]
        self.assertNotIn("ErrorMsg", response_dto)
        self.assertNotIn("Env", response_dto)
        self.assertNotIn("Param", response_dto)
        self.assertNotIn("Labels", response_dto)
        self.assertIn('Labels: con.Labels', impl)  # used only internally for ownership
        self.assertIn('json:"observedAt"', impl)
        self.assertIn('"DOCKER_OBSERVATION_UNAVAILABLE"', impl)

    def test_go_tests_cover_critical_cases(self):
        impl = source("agent/app/service/app_install_evidence_test.go")
        for name in (
            "TestAppInstallEvidenceConsistentIsStillUnverified",
            "TestAppInstallEvidencePartialAndNoAutoReconciliation",
            "TestAppInstallEvidenceUnknownDoesNotBecomeSuccess",
            "TestAppInstallEvidenceConflictForWrongComposeOwnership",
            "TestAppInstallEvidenceConflictForCompetingAppRecord",
            "TestAppInstallEvidenceUnknownWhenTaskOrDockerUnavailable",
        ):
            self.assertIn("func " + name, impl)

if __name__ == "__main__":
    unittest.main()
