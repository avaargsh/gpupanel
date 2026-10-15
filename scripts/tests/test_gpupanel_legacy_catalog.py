"""Prevent legacy app catalog reactivation or destructive deletion of installations."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

class UpstreamRetirement(unittest.TestCase):
    def test_no_background_catalog_sync(self):
        src = (ROOT / "agent/cron/cron.go").read_text()
        self.assertNotIn("job.NewAppStoreJob()", src)
        self.assertIn("job.NewBackupJob()", src)
    def test_discovery_never_shows_upstream_remote_records(self):
        src = (ROOT / "agent/app/service/app.go").read_text()
        self.assertIn("appRepo.WithNotRemote()", src)
        self.assertIn("if !legacyRemoteCatalogEnabled()", src)
        query = (ROOT / "agent/app/repo/app.go").read_text()
        self.assertIn('g.Where("resource != ?", "remote")', query)
    def test_disable_without_mutating_installation_history(self):
        src = (ROOT / "agent/app/service/legacy_catalog.go").read_text()
        self.assertIn("return false", src)
        self.assertNotIn("Delete", src)
        self.assertNotIn("os.Getenv", src)
        app = (ROOT / "agent/app/service/app.go").read_text()
        self.assertIn("legacy upstream 1Panel application catalog is retired", app)
    def test_existing_app_install_management_kept(self):
        router = (ROOT / "agent/router/ro_app.go").read_text()
        for action in ('"/installed/search"','"/installed/op"','"/installed/info/:appInstallId"'):
            self.assertIn(action,router)

if __name__ == "__main__":
    unittest.main()
