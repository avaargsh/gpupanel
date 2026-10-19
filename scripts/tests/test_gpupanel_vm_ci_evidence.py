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
        self.reinstall = {
            "kind": "REAL OWNED UBUNTU GUEST REINSTALL REFUSAL; NO MOCKS",
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "preflight_runtime_collision": "BLOCKED",
            "operator_gated_reinstall": "DENIED",
            "running_binary_and_pid_unchanged": True,
            "pctl_and_systemd_hashes_unchanged": True,
            "credential_values_recorded": False,
            "release_decision": "NO_GO",
            "private_password": "NEVER_PRINT_PASSWORD",
        }
        # Evidence schema rejects extraneous fields, including passwords.
        self.reinstall.pop("private_password")
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
            "private": "NEVER_EXPOSE_CONTAINER_TASK_LOG",
        }
        self.restore = {
            "kind": "REAL GUEST POST-INSTALL OFFLINE SNAPSHOT RESTORE; PARTIAL G3/G6",
            "source_sha": self.source,
            "guest_machine_id_sha256": "d" * 64,
            "binary_sha256": self.candidate["binary_sha256"],
            "offline_checkpoint_sha256": "e" * 64,
            "restored_disk_sha256": "e" * 64,
            "fault_injected_marker_changed": True,
            "marker_reverted_by_disk_restore": True,
            "login_settings_digest_equal": True,
            "services_running_exact_binaries": True,
            "full_data_restore_verified": False,
            "m0_release_decision": "NO_GO",
            "secret": "NEVER_REPORT_ME",
        }
        (self.state / "ubuntu2404").mkdir()
        self.write("ubuntu2404/image-provenance.json", {
            "signed_checksum_verified": True,
            "url": "DO_NOT_PRINT_VM_IMAGE_PROVIDER",
        })
        self.write("browser-live.json", self.browser)
        self.write("runtime-live.json", self.runtime)
        self.write("reinstall-denial-live.json", self.reinstall)
        self.write("compose-live.json", self.compose)
        self.write("container-live.json", self.container)
        self.write("restore-live.json", self.restore)
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
        self.assertEqual(result["already_installed_reinstall_refusal"], "PASS")
        self.assertEqual(result["offline_docker_compose_fixture"], "PASS")
        self.assertEqual(result["post_install_offline_disk_restore"], "PASS")
        self.assertEqual(result["core_agent_docker_container_lifecycle"], "PARTIAL_PASS")
        self.assertEqual(result["upgrade_and_rollback"], "NOT_RUN")
        self.assertEqual(result["full_app_compose_install_lifecycle"], "NOT_RUN")
        self.assertEqual(result["independent_reviewer"], "NOT_ATTESTED")
        encoded = json.dumps(result)
        for secret in ("MUST_NOT_LEAK", "SECRET_LOG_SHOULD_NEVER_APPEAR",
                       "DO_NOT_PRINT_VM_IMAGE_PROVIDER", "NEVER_REPORT_ME",
                       "NEVER_EXPOSE_CONTAINER_TASK_LOG"):
            self.assertNotIn(secret, encoded)

    def test_reinstall_denial_is_required_exact_scope_and_no_mutation(self):
        script = (ROOT / "scripts/install-test/reinstall-denial.py").read_text()
        import ast
        ast.parse(script)
        self.assertIn("candidate.verify_browser_chain(browser, local)", script)
        self.assertIn("verify_preflight(preflight.stdout, preflight.returncode)", script)
        self.assertIn("if after != before:", script)
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertIn("python3 scripts/install-test/reinstall-denial.py", runner)
        self.assertLess(runner.index("stage 'guest_reinstall_collision_denied'"),
                        runner.index("stage 'guest_compose_offline_lifecycle'"))
        faults = [
            {"candidate": {**self.candidate, "source_sha": "0" * 40}},
            {"guest_machine_id_sha256": "0" * 64},
            {"preflight_runtime_collision": "PASS"},
            {"operator_gated_reinstall": "SUCCESS"},
            {"running_binary_and_pid_unchanged": False},
            {"pctl_and_systemd_hashes_unchanged": False},
            {"credential_values_recorded": True},
            {"release_decision": "GO"},
            {"hidden_password": "SECRET"},
        ]
        for change in faults:
            with self.subTest(fault=change):
                self.write("reinstall-denial-live.json", {**self.reinstall, **change})
                report = self.summarise()
                self.assertEqual(report["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(report["already_installed_reinstall_refusal"], "NOT_ATTESTED")
        (self.state / "reinstall-denial-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

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
        self.assertEqual(failure.SCRIPTS.keys(), {"browser", "runtime", "compose", "restore", "container"})

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

    def test_post_install_restore_proof_is_required_and_exact(self):
        faults = [
            {"source_sha": "0" * 40},
            {"guest_machine_id_sha256": "0" * 64},
            {"binary_sha256": {"core": "a" * 64, "agent": "0" * 64}},
            {"offline_checkpoint_sha256": "0" * 64},
            {"restored_disk_sha256": "0" * 64},
            {"fault_injected_marker_changed": False},
            {"marker_reverted_by_disk_restore": False},
            {"login_settings_digest_equal": False},
            {"services_running_exact_binaries": False},
            {"full_data_restore_verified": True},
            {"m0_release_decision": "GO"},
            {"kind": "SIMULATED_RESTORE"},
        ]
        for fault in faults:
            with self.subTest(fault=fault):
                self.write("restore-live.json", {**self.restore, **fault})
                proof = self.summarise()
                self.assertEqual(proof["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(proof["post_install_offline_disk_restore"], "NOT_ATTESTED")
        self.write("restore-live.json", self.restore)
        (self.state / "restore-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_restore_script_is_owned_vm_only_and_preserves_previous_disk(self):
        import ast
        source = (ROOT / "scripts/install-test/restore-live.py").read_text()
        ast.parse(source)
        self.assertIn("vm.guarded_vm_change(exchange)", source)
        self.assertIn('VM / "disk.before-ci-restore.qcow2"', source)
        self.assertIn("checkpoint.verify_checkpoint(folder)", source)
        self.assertIn("original.exists() or original.is_symlink()", source)
        self.assertIn("marker_reverted_by_disk_restore", source)
        self.assertNotIn("subprocess.run(['docker'", source)
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertIn("python3 scripts/install-test/restore-live.py", runner)
        self.assertIn("stage 'guest_post_install_offline_restore'", runner)

    def test_container_evidence_requires_exact_guest_and_complete_lifecycle(self):
        for invalid in (
            {"guest_machine_id_sha256": "0" * 64},
            {"candidate": {**self.candidate, "source_sha": "a" * 40}},
            {"steps": self.container["steps"][:-1]},
            {"distinct_task_ids": False},
            {"fixture_image_sha256": "not_a_hash"},
            {"no_external_app_catalog_used": False},
            {"app_install_lifecycle": "PASS"},
            {"compose_install_lifecycle": "PASS"},
        ):
            with self.subTest(invalid=invalid):
                self.write("container-live.json", {**self.container, **invalid})
                result = self.summarise()
                self.assertEqual(result["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(result["core_agent_docker_container_lifecycle"], "NOT_ATTESTED")
                self.assertEqual(result["post_install_offline_disk_restore"], "NOT_ATTESTED")
        self.write("container-live.json", self.container)
        (self.state / "container-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_core_container_fixture_has_explicit_offline_network_and_identity(self):
        source = (ROOT / "scripts/install-test/container.py").read_text()
        backend = (ROOT / "agent/app/service/container.go").read_text()
        self.assertIn('return nil, nil, nil, fmt.Errorf("please set up the network")', backend)
        self.assertIn('"networks": [{"network": "none"}]', source)
        self.assertIn('{{.HostConfig.NetworkMode}}', source)
        self.assertIn('if network_mode != "none":', source)
        self.assertIn('"privileged": False', source)
        self.assertIn('"publishAllPorts": False', source)
        self.assertNotIn('forcePull": True', source)
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertLess(
            runner.index("stage 'real_core_agent_container_lifecycle'"),
            runner.index("stage 'guest_post_install_offline_restore'"),
        )

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

    def test_real_vm_runs_for_release_inputs_and_immutable_main_sha(self):
        import re
        flow = (ROOT / ".github/workflows/gpupanel-real-ubuntu-vm.yml").read_text()
        self.assertIn("  push:\n    branches: [main]", flow)
        self.assertIn("  pull_request:\n    branches: [main]", flow)
        for event in ("pull_request", "push"):
            rest = flow.split("  " + event + ":\n", 1)[1]
            # Only the next 2-space event key ends this block; nested
            # 4-space 'branches' and 'paths' must remain inside it.
            end = re.search(r"(?m)^  [a-z_]+:", rest)
            block = rest[:end.start()] if end else rest
            self.assertIn("branches: [main]", block)
            paths = re.findall(r"^      - '([^']+)'$", block, re.MULTILINE)
            self.assertEqual(set(paths), {
                "core/**", "agent/**", "frontend/**", "deploy/**",
                "scripts/**",
                ".github/workflows/gpupanel-real-ubuntu-vm.yml",
            })
        # Never run an untrusted fork PR in the privileged KVM CI lane.
        self.assertIn(
            "github.event.pull_request.head.repo.full_name == github.repository",
            flow,
        )
        # The source identity in the report must be the exact CI checkout.
        source = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertIn('git rev-parse HEAD', source)
        self.assertIn('$(git status --porcelain --untracked-files=all)', source)
        self.assertIn('GITHUB_SHA', source)
        self.assertIn("m0_release_decision", (
            ROOT / "scripts/install-test/ci-evidence.py"
        ).read_text())

    def test_scheduled_latest_main_rechecks_automation_merged_code(self):
        flow = (ROOT / ".github/workflows/gpupanel-real-ubuntu-vm.yml").read_text()
        self.assertIn("  schedule:\n    - cron: '43 13 * * *'", flow)
        self.assertIn("  workflow_dispatch:", flow)
        self.assertIn("  push:\n    branches: [main]", flow)
        # Scheduled workflows use GitHub's current default branch commit.
        # Never replace GITHUB_SHA with the PR source SHA or a cached value.
        live = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertIn('$(git rev-parse HEAD)', live)
        self.assertIn('"$GITHUB_SHA"', live)
        evidence = (ROOT / "scripts/install-test/ci-evidence.py").read_text()
        self.assertIn('source_sha=os.environ.get("GITHUB_SHA", "")', evidence)
        self.assertIn('"m0_release_decision": "NO_GO"', evidence)

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
