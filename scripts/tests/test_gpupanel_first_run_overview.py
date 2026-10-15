"""First-run overview is read-only, and does not misreport Core/Agent as installable."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_first_run_overview", ROOT / "scripts/gpupanel-first-run-overview.py")
overview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overview)


class FirstRunOverviewTest(unittest.TestCase):
    def test_current_source_is_not_a_system_installer(self):
        report = overview.overview(Path("/"), ROOT, free_bytes=15 * 1024 ** 3)
        self.assertEqual(report["conclusion"], "SYSTEM_INSTALL_BLOCKED")
        self.assertFalse(report["readyForProduction"])
        self.assertFalse(report["mutationPerformed"])
        self.assertFalse(report["systemServiceInstalled"])
        self.assertGreater(report["systemRuntime"]["namespaceRisks"], 0)
        self.assertTrue(report["catalog"]["approvedUserWorkflows"])
        self.assertTrue(all(not x["systemInstall"] for x in report["catalog"]["approvedUserWorkflows"]))

    def test_fixture_host_reports_blocked_ubuntu_and_collision(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Path(tmp)
            (host / "etc").mkdir()
            (host / "etc/os-release").write_text('ID=debian\nVERSION_ID="12"\n')
            (host / "usr/local/bin").mkdir(parents=True)
            (host / "usr/local/bin/1pctl").write_text("legacy")
            report = overview.overview(host, ROOT, free_bytes=500)
            self.assertIn("operating_system", report["host"]["blockers"])
            self.assertIn("runtime_collision", report["host"]["blockers"])
            self.assertIn("disk_space", report["host"]["blockers"])
            self.assertFalse(report["readyForProduction"])

    def test_independent_repeat_has_no_write_side_effect(self):
        with tempfile.TemporaryDirectory() as tmp:
            host = Path(tmp)
            (host / "etc").mkdir()
            (host / "etc/os-release").write_text('ID=ubuntu\nVERSION_ID="24.04"\n')
            before = sorted(p.relative_to(host).as_posix() for p in host.rglob("*"))
            a = overview.overview(host, ROOT, free_bytes=30 * 1024 ** 3)
            b = overview.overview(host, ROOT, free_bytes=30 * 1024 ** 3)
            after = sorted(p.relative_to(host).as_posix() for p in host.rglob("*"))
            self.assertEqual(before, after)
            self.assertEqual(a, b)
            self.assertEqual(a["host"]["blockers"], [])

if __name__ == "__main__":
    unittest.main()
