"""First-run overview is read-only, and does not misreport Core/Agent as installable."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gpupanel_first_run_overview", ROOT / "scripts/gpupanel-first-run-overview.py")
overview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(overview)


class FirstRunOverviewTest(unittest.TestCase):
    def test_docker_probe_opt_in_and_classifications(self):
        calls = []
        def runner(*args, **kwargs):
            calls.append((args, kwargs))
            return Mock(returncode=0, stdout="27.4.1\n", stderr="")
        no_probe = overview.docker_health(False, which=lambda _: "/usr/bin/docker",
                                          runner=runner)
        self.assertEqual(no_probe["status"], "NOT_CHECKED")
        self.assertEqual(calls, [])
        healthy = overview.docker_health(True, which=lambda _: "/usr/bin/docker", runner=runner)
        self.assertTrue(healthy["daemonVerified"])
        self.assertEqual(healthy["serverVersion"], "27.4.1")
        self.assertEqual(calls[0][0][0], ["/usr/bin/docker", "info", "--format", "{{.ServerVersion}}"])
        self.assertEqual(calls[0][1]["timeout"], 8)
        self.assertFalse(calls[0][1]["check"])
        self.assertEqual(overview.docker_health(True, which=lambda _: None)["status"], "MISSING_CLI")
        denied = overview.docker_health(True, which=lambda _: "/usr/bin/docker",
                 runner=lambda *a, **k: Mock(returncode=1, stdout="", stderr="permission denied"))
        self.assertEqual(denied["status"], "ACCESS_DENIED")
        offline = overview.docker_health(True, which=lambda _: "/usr/bin/docker",
                 runner=lambda *a, **k: Mock(returncode=1, stdout="", stderr="daemon unavailable"))
        self.assertEqual(offline["status"], "UNAVAILABLE")

    def test_docker_info_never_reports_success_on_malformed_response(self):
        result = overview.docker_health(True, which=lambda _: "/usr/bin/docker",
                runner=lambda *a, **k: Mock(returncode=0, stdout="host\nsecret\n", stderr=""))
        self.assertEqual(result["status"], "INVALID_RESPONSE")
        self.assertFalse(result["daemonVerified"])


    def test_developer_environment_probe_is_opt_in(self):
        sample = {
            "python": {"status": "DETECTED", "version": "3.12.0"},
            "torch": {"status": "INSTALLED_UNVERIFIED", "version": "2.6.0"},
            "runtime": {"status": "NOT_CHECKED"},
            "toolkitVerified": False,
            "installPerformed": False,
        }
        with patch.object(overview.python_doctor, "inspect", return_value=sample) as inspect:
            default = overview.overview(Path("/"), ROOT, free_bytes=15 * 1024 ** 3)
            inspect.assert_called_once_with(probe_torch=False)
        self.assertEqual(default["developerEnvironment"]["runtime"]["status"], "NOT_CHECKED")
        with patch.object(overview.python_doctor, "inspect", return_value=sample) as inspect:
            overview.overview(Path("/"), ROOT, free_bytes=15 * 1024 ** 3, probe_torch=True)
            inspect.assert_called_once_with(probe_torch=True)

    def test_current_source_is_not_a_system_installer(self):
        report = overview.overview(Path("/"), ROOT, free_bytes=15 * 1024 ** 3)
        self.assertEqual(report["conclusion"], "SYSTEM_INSTALL_BLOCKED")
        self.assertFalse(report["readyForProduction"])
        self.assertFalse(report["mutationPerformed"])
        self.assertFalse(report["systemServiceInstalled"])
        # Blocked namespace risks cleared by migration; remaining risks are
        # unknown and require independent verification before installation.
        self.assertEqual(report["systemRuntime"]["namespaceRisks"], 0)
        self.assertGreater(report["systemRuntime"]["unknownIsolationRisks"], 0)
        self.assertGreater(report["systemRuntime"]["namespaceRisks"] +
                           report["systemRuntime"]["unknownIsolationRisks"], 0)
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
