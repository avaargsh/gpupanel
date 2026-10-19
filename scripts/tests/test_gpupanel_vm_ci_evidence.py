"""Source-only gate for sanitized full-chain VM CI evidence (no VM launched)."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/install-test/ci-evidence.py"
spec = importlib.util.spec_from_file_location("vm_ci_evidence", SOURCE)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class LiveVmEvidence(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.state = Path(temp.name)
        self.source = "b" * 40
        self.candidate = {
            "source_sha": self.source,
            "binary_sha256": {"core": "a" * 64, "agent": "c" * 64},
        }
        self.browser = {
            "kind": "LIVE local VM; no intercepted APIs",
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "browser_page_errors": [],
            "live_operations_center_read_only": True,
            "username": "MUST_NOT_LEAK",
        }
        self.runtime = {
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "same_candidate_live_browser_verified": True,
            "two_clean_agent_restarts": True,
            "explicit_fixture_operator_recovery": True,
            "fixture_marker_and_login_settings_retained": True,
            "other_secret": "SECRET_LOG_SHOULD_NEVER_APPEAR",
        }
        self.compose = {
            "kind": "REAL GUEST OFFLINE DOCKER COMPOSE FIXTURE; NOT GPUPanel AppInstall",
            "source_sha": self.source,
            "guest_machine_id_sha256": "d" * 64,
            "container_created": True, "logs_observed": True,
            "offline_no_host_ports": True,
            "marker_reread_after_stop_start": True,
            "marker_reread_after_restart": True,
            "container_removed": True,
            "local_image_removed": True,
        }
        self.container = {
            "kind": "REAL UBUNTU GUEST + AUTHENTICATED CORE→AGENT→DOCKER; NO MOCK API",
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "fixture_image_sha256": "e" * 64,
            "distinct_task_ids": True,
            "steps": [
                "create_and_independent_running_observation",
                "stop_with_independent_observation",
                "start_with_independent_observation",
                "restart_with_independent_observation",
                "remove_with_independent_observation",
            ],
            "no_external_app_catalog_used": True,
            "app_install_lifecycle": "NOT_RUN",
            "compose_install_lifecycle": "NOT_RUN",
            "secret": "DO_NOT_PRINT_CONTAINER_SECRET",
        }
        (self.state / "ubuntu2404").mkdir()
        self.write("ubuntu2404/image-provenance.json", {
            "signed_checksum_verified": True,
            "url": "DO_NOT_PRINT_VM_IMAGE_PROVIDER",
        })
        self.write("browser-live.json", self.browser)
        self.write("runtime-live.json", self.runtime)
        self.write("compose-live.json", self.compose)
        self.write("container-live.json", self.container)
        (self.state / "ci-stages.txt").write_text(
            "\n".join(audit.STAGES) + "\n"
        )

    def write(self, name, content):
        (self.state / name).write_text(json.dumps(content))

    def summarise(self, completed=True):
        return audit.summarize(self.state, run_completed=completed,
                               source_sha=self.source)

    def test_full_real_flag_is_only_partial_m0_no_go(self):
        result = self.summarise()
        self.assertEqual(result["status"], "PARTIAL_ACCEPTED")
        self.assertEqual(result["m0_release_decision"], "NO_GO")
        self.assertEqual(result["offline_docker_compose_fixture"], "PASS")
        self.assertEqual(result["core_agent_docker_container_lifecycle"], "PARTIAL_PASS")
        self.assertEqual(result["upgrade_and_rollback"], "NOT_RUN")
        self.assertEqual(result["full_app_compose_install_lifecycle"], "NOT_RUN")
        self.assertEqual(result["independent_reviewer"], "NOT_ATTESTED")
        encoded = json.dumps(result)
        for secret in ("MUST_NOT_LEAK", "SECRET_LOG_SHOULD_NEVER_APPEAR",
                       "DO_NOT_PRINT_VM_IMAGE_PROVIDER", "DO_NOT_PRINT_CONTAINER_SECRET"):
            self.assertNotIn(secret, encoded)

    def test_early_failure_cannot_mark_pass(self):
        self.assertEqual(self.summarise(completed=False)["status"], "BLOCKED_OR_FAILED")
        self.assertEqual(self.summarise()["fresh_install"], "PASS")
        for stages in (
            audit.STAGES[:-1], audit.STAGES + ("another",),
            audit.STAGES[:1] + ("guest_agent_recovery",),
            audit.STAGES + ("guest_agent_recovery",),
        ):
            (self.state / "ci-stages.txt").write_text("\n".join(stages) + "\n")
            self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_foreign_guest_and_missing_browser_fail_closed(self):
        self.write("runtime-live.json", {
            **self.runtime, "guest_machine_id_sha256": "0" * 64,
        })
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
        self.write("runtime-live.json", self.runtime)
        (self.state / "browser-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_wrong_binary_and_missing_agent_recovery_rejected(self):
        self.write("runtime-live.json", {
            **self.runtime,
            "candidate": {**self.candidate, "binary_sha256": {
                "core": "a" * 64, "agent": "0" * 64,
            }},
        })
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
        self.write("runtime-live.json", {
            **self.runtime, "explicit_fixture_operator_recovery": False,
        })
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_release_preflight_is_readable_under_private_runner_umask(self):
        build = (ROOT / "deploy/build.sh").read_text()
        self.assertIn("umask 022", build)
        # It must apply BEFORE mkdir/tar create the public release payload.
        self.assertLess(
            build.index("umask 022"), build.index('mkdir -p "$PKG_DIR/initscript"')
        )
        self.assertIn('install -m 0755 "$ROOT/scripts/gpupanel-install-preflight.py"', build)
        script = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertIn("umask 077", script)
        self.assertIn(
            'python3 scripts/install-test/vm.py ssh -- python3 "/tmp/$package/gpupanel-install-preflight.py" --json',
            script,
        )

    def test_private_browser_failure_is_redacted_to_line_and_class(self):
        failure_source = ROOT / "scripts/install-test/ci-failure.py"
        spec = importlib.util.spec_from_file_location("vm_ci_failure", failure_source)
        failure = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(failure)
        log = (
            'username=private-user password=UNREDACTABLE_SECRET\n'
            'Traceback (most recent call last):\n'
            '  File "/private/scripts/install-test/browser.py", line 88, in <module>\n'
            '    expect(page).to_be_visible(timeout=10000)\n'
            'AssertionError: cookie=SECRET_COOKIE payload=PRIVATE_BODY\n'
        )
        sanitized = failure.diagnostic(log, "browser.py")
        self.assertEqual(sanitized,
            "PRIVATE_VM_FAILURE source=browser.py:88 "
            "exception_class=AssertionError release=NO_GO")
        self.assertNotIn("UNREDACTABLE_SECRET", sanitized)
        self.assertNotIn("SECRET_COOKIE", sanitized)
        self.assertNotIn("PRIVATE_BODY", sanitized)
        self.assertNotIn("private-user", sanitized)
        # A literal escaped backslash-n log has no real exception line.
        # Never guess a class from a secret-bearing freeform string.
        untrusted_flat = log.replace("\n", r"\n")
        self.assertEqual(
            failure.diagnostic(untrusted_flat, "browser.py"),
            "PRIVATE_VM_FAILURE source=browser.py:88 "
            "exception_class=UNCLASSIFIED release=NO_GO",
        )
        self.assertNotIn("PRIVATE_BODY", failure.diagnostic(untrusted_flat, "browser.py"))
        # Caller-supplied arbitrary paths cannot be used to read private data.
        self.assertEqual(failure.compose_stage(
            "GUEST_COMPOSE_STAGE=up release=NO_GO\nusername=secret\n"
        ), "up")
        self.assertEqual(failure.compose_stage(
            "GUEST_COMPOSE_STAGE=unknown attacker-data release=NO_GO\n"
        ), "unknown")
        self.assertEqual(failure.compose_stage(
            "GUEST_COMPOSE_STAGE=up release=GO\n"
        ), "unknown")
        self.assertEqual(failure.SCRIPTS.keys(), {"browser", "runtime", "compose", "container"})

    def test_compose_fixture_requires_guest_identity_and_does_not_certify_appinstall(self):
        for corrupted in (
            {**self.compose, "source_sha": "0" * 40},
            {**self.compose, "guest_machine_id_sha256": "0" * 64},
            {**self.compose, "container_removed": False},
            {**self.compose, "offline_no_host_ports": False},
            {**self.compose, "marker_reread_after_restart": False},
            {**self.compose, "fake_appinstall": True},
        ):
            with self.subTest(corrupted=corrupted):
                self.write("compose-live.json", corrupted)
                self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(self.summarise()["full_app_compose_install_lifecycle"], "NOT_RUN")
        (self.state / "compose-live.json").unlink()
        self.assertEqual(self.summarise()["offline_docker_compose_fixture"], "NOT_ATTESTED")

    def test_core_agent_container_task_proof_is_exact_and_non_approving(self):
        for patch in (
            {"guest_machine_id_sha256": "0" * 64},
            {"candidate": {**self.candidate, "source_sha": "a" * 40}},
            {"steps": self.container["steps"][:-1]},
            {"distinct_task_ids": False},
            {"fixture_image_sha256": "no"},
            {"no_external_app_catalog_used": False},
            {"app_install_lifecycle": "PASS"},
        ):
            with self.subTest(patch=patch):
                self.write("container-live.json", {**self.container, **patch})
                self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
        (self.state / "container-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_core_container_fixture_requires_offline_network_configuration(self):
        # This is a real backend requirement: loadConfigInfo refuses
        # ContainerCreate without req.Networks. The M0 fixture must also
        # independently verify Docker used network=none.
        source = (ROOT / "scripts/install-test/container.py").read_text()
        backend = (ROOT / "agent/app/service/container.go").read_text()
        self.assertIn('return nil, nil, nil, fmt.Errorf("please set up the network")', backend)
        self.assertIn('"networks": [{"network": "none"}]', source)
        self.assertIn('{{.HostConfig.NetworkMode}}', source)
        self.assertIn('if network_mode != "none":', source)
        self.assertIn('"privileged": False', source)
        self.assertIn('"publishAllPorts": False', source)
        self.assertNotIn('forcePull": True', source)

    def test_offline_scratch_image_has_explicit_executable_entrypoint(self):
        guest = (ROOT / "scripts/install-test/compose-fixture-guest.py").read_text()
        self.assertIn('shutil.copyfile(binary, folder / "busybox")', guest)
        self.assertIn('(folder / "busybox").chmod(0o755)', guest)
        self.assertLess(
            guest.index('(folder / "busybox").chmod(0o755)'),
            guest.index('(folder / "Dockerfile").write_text('),
        )
        self.assertIn('"docker", "build", "--pull=false", "--network=none"', guest)
        self.assertIn('network_mode: none', guest)

    def test_workflow_only_uploads_redacted_json(self):
        flow = (ROOT / ".github/workflows/gpupanel-real-ubuntu-vm.yml").read_text()
        self.assertIn("persist-credentials: false", flow)
        self.assertIn("bash scripts/install-test/ci-live-vm.sh", flow)
        self.assertIn("path: .local/install-test/ci-evidence.json", flow)
        self.assertNotIn("path: .local/install-test/ubuntu2404/", flow)
        self.assertNotIn("path: .local/install-test/install.raw.log", flow)
        self.assertIn("retention-days: 7", flow)


if __name__ == "__main__":
    unittest.main()
