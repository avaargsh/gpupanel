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
            "private": "NEVER_EXPOSE_CONTAINER_TASK_LOG",
        }
        self.app_rejection = {
            "schema": "gpupanel.vm.appinstall-rejection.v1",
            "kind": "REAL INSTALLED CORE+AGENT APPINSTALL REJECTION; NOT APP INSTALL",
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "nonexistent_app_detail_rejected": True,
            "no_task_app_or_docker_mutation": True,
            "app_install_success": "NOT_RUN",
            "duplicate_task_replay": "NOT_RUN",
            "release_decision": "NO_GO",
        }
        self.app_install = {
            "kind": "REAL OWNED UBUNTU GPUPANEL APPINSTALL API; NO MOCKS",
            "candidate": self.candidate,
            "guest_machine_id_sha256": "d" * 64,
            "steps": [
                "real_local_catalog_sync",
                "invalid_install_uuid_rejected_without_side_effects",
                "real_appinstall_taskdb_success",
                "independent_running_image_and_network_evidence",
                "durable_admission_survives_agent_restart",
                "replay_install_taskid_denied_without_side_effects",
                "same_name_install_denied_without_side_effects",
                "real_app_uninstall_and_resource_removal",
                "interrupted_install_marked_unknown_without_retry",
                "unknown_install_operations_blocked_without_side_effects",
                "fixture_catalog_cleanup",
            ],
            "durable_admission_survived_agent_restart": True,
            "duplicate_fences_observed": True,
            "interrupted_install_unknown_fences_observed": True,
            "distinct_operation_task_ids": True,
            "app_evidence_observational_only": True,
            "no_public_image_pull": True,
            "docker_no_network_or_host_ports": True,
            "fixture_source_cleaned": True,
            "g5_full_appstore_business_acceptance": "NOT_RUN",
            "m0_release_decision": "NO_GO",
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
        self.uninstall = {
            "schema": "gpupanel.vm.system-uninstall.v1",
            "kind": "REAL UBUNTU PACKAGE SYSTEMD UNINSTALL; DEFAULT DATA PRESERVATION; NO MOCKS",
            "source_sha": self.source,
            "guest_machine_id_sha256": "d" * 64,
            "binary_sha256": self.candidate["binary_sha256"],
            "retained_file_sha256": {"pctl": "1" * 64, "core_db": "2" * 64, "app_yaml": "3" * 64},
            "retained_tree_policy": "ALL_PATHS_TYPES_MODES_OWNERS; FILE_DIGESTS_EXCEPT_VOLATILE_LOG_CONTENTS",
            "retained_tree_before_sha256": "a" * 64,
            "retained_tree_after_sha256": "a" * 64,
            "retained_tree_unchanged": True,
            "retention_sentinel_before_sha256": "b" * 64,
            "retention_sentinel_after_sha256": "b" * 64,
            "retention_sentinel_preserved": True,
            "unit_file_sha256": {"gpupanel-core": "4" * 64, "gpupanel-agent": "5" * 64},
            "docker_inventory_sha256": {"containers": "6" * 64, "networks": "7" * 64,
                                        "volumes": "8" * 64, "images": "9" * 64},
            "docker_server_version": "27.0.3",
            "owned_units_removed": True,
            "repeat_default_uninstall_idempotent": True,
            "services_inactive_and_disabled": True,
            "running_processes_absent": True,
            "binaries_and_data_retained": True,
            "data_digests_unchanged": True,
            "docker_inventory_unchanged": True,
            "purge": "NOT_RUN",
            "upgrade_and_rollback": "NOT_RUN",
            "m0_release_decision": "NO_GO",
        }
        (self.state / "ubuntu2404").mkdir()
        self.write("ubuntu2404/image-provenance.json", {
            "signed_checksum_verified": True,
            "url": "DO_NOT_PRINT_VM_IMAGE_PROVIDER",
        })
        self.release_transfer = {
            "schema": "gpupanel.vm.release-transfer.v1",
            "source_sha": self.source,
            "archive_name": f"gpupanel-ci-{self.source[:12]}-linux-amd64.tar.gz",
            "local_release_sha256": "9" * 64,
            "guest_release_sha256": "9" * 64,
            "guest_machine_id_sha256": "d" * 64,
            "signature_proof": "NOT_ATTESTED",
        }
        self.write("release-transfer.json", self.release_transfer)
        self.write("browser-live.json", self.browser)
        self.write("runtime-live.json", self.runtime)
        self.write("compose-live.json", self.compose)
        self.write("container-live.json", self.container)
        self.write("app-install-live.json", self.app_install)
        self.write("app-rejection-live.json", self.app_rejection)
        self.write("restore-live.json", self.restore)
        self.write("uninstall-live.json", self.uninstall)
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
        self.assertEqual(result["post_install_offline_disk_restore"], "PASS")
        self.assertEqual(result["core_agent_docker_container_lifecycle"], "PARTIAL_PASS")
        self.assertEqual(result["gpupanel_offline_appinstall_lifecycle"], "PARTIAL_PASS")
        self.assertEqual(result["real_appinstall_missing_detail_rejection"], "PASS")
        self.assertEqual(result["upgrade_and_rollback"], "NOT_RUN")
        self.assertEqual(result["full_app_compose_install_lifecycle"], "NOT_RUN")
        self.assertEqual(result["independent_reviewer"], "NOT_ATTESTED")
        encoded = json.dumps(result)
        for secret in ("MUST_NOT_LEAK", "SECRET_LOG_SHOULD_NEVER_APPEAR",
                       "DO_NOT_PRINT_VM_IMAGE_PROVIDER", "NEVER_REPORT_ME",
                       "NEVER_EXPOSE_CONTAINER_TASK_LOG"):
            self.assertNotIn(secret, encoded)

    def test_system_uninstall_evidence_is_exact_and_preserves_data(self):
        result = self.summarise()
        self.assertEqual(result["system_uninstall"], "PASS")
        self.assertEqual(result["uninstall_data_preservation"], "PASS")
        self.assertEqual(result["uninstall_purge"], "NOT_RUN")
        faults = (
            {"source_sha": "0" * 40},
            {"guest_machine_id_sha256": "0" * 64},
            {"owned_units_removed": False},
            {"repeat_default_uninstall_idempotent": False},
            {"data_digests_unchanged": False},
            {"retained_tree_after_sha256": "invalid"},
            {"retained_tree_after_sha256": "c" * 64},
            {"retained_tree_unchanged": False},
            {"retained_tree_policy": "ALL_FILES_UNFILTERED"},
            {"retention_sentinel_after_sha256": "invalid"},
            {"retention_sentinel_after_sha256": "c" * 64},
            {"retention_sentinel_preserved": False},
            {"docker_inventory_unchanged": False},
            {"purge": "PASS"},
            {"upgrade_and_rollback": "PASS"},
            {"m0_release_decision": "GO"},
            {"extra_field": "reject"},
        )
        for fault in faults:
            with self.subTest(fault=fault):
                self.write("uninstall-live.json", {**self.uninstall, **fault})
                report = self.summarise()
                self.assertEqual(report["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(report["system_uninstall"], "NOT_ATTESTED")
        self.write("uninstall-live.json", self.uninstall)
        (self.state / "uninstall-live.json").unlink()
        report = self.summarise()
        self.assertEqual(report["status"], "BLOCKED_OR_FAILED")
        self.assertEqual(report["system_uninstall"], "NOT_ATTESTED")
        self.write("uninstall-live.json", self.uninstall)

    def test_archive_integrity_and_guest_binding_are_required(self):
        baseline = self.summarise()
        self.assertEqual(baseline["guest_release_transfer"], "MATCHED")
        self.assertEqual(baseline["release_archive_sha256"], "9" * 64)
        self.assertEqual(baseline["release_package_signature"], "NOT_ATTESTED")
        for corrupt in (
            {"source_sha": "0" * 40},
            {"archive_name": "gpupanel-ci-untrusted-linux-amd64.tar.gz"},
            {"guest_release_sha256": "0" * 64},
            {"local_release_sha256": "not-a-sha"},
            {"guest_machine_id_sha256": "0" * 64},
            {"signature_proof": "VERIFIED"},
            {"injected_secret": "NO"},
        ):
            with self.subTest(corrupt=corrupt):
                self.write("release-transfer.json", {
                    **self.release_transfer, **corrupt,
                })
                report = self.summarise()
                self.assertEqual(report["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(report["guest_release_transfer"], "NOT_ATTESTED")
                self.assertIsNone(report["release_archive_sha256"])
        self.write("release-transfer.json", self.release_transfer)
        (self.state / "release-transfer.json").unlink()
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
        # System uninstall diagnostics export only an allowlisted stage/category,
        # never the dynamic error string, filesystem path, or guest content.
        self.assertEqual(
            failure.system_uninstall_stage(
                "GPUPANEL_SYSTEM_UNINSTALL_STAGE=first-uninstaller release=NO_GO\\n"
                "password=SECRET_SHOULD_NOT_LEAK\\n"
            ),
            "first-uninstaller",
        )
        self.assertEqual(
            failure.system_uninstall_stage(
                "GPUPANEL_SYSTEM_UNINSTALL_STAGE=first-uninstaller password=LEAK release=NO_GO\\n"
            ),
            "unknown",
        )
        self.assertEqual(
            failure.system_uninstall_failure_category(
                "GPUPanel uninstall refused/failed: systemd did not confirm stop/disable; "
                "secret=DO_NOT_LEAK"
            ),
            "service-stop-disable-unconfirmed",
        )
        self.assertEqual(
            failure.system_uninstall_failure_category(
                "arbitrary untrusted output: password=DO_NOT_LEAK"
            ),
            "unknown",
        )
        safe_report = (
            "GPUPANEL_SYSTEM_UNINSTALL_STAGE="
            + failure.system_uninstall_stage("password=DO_NOT_LEAK")
            + " GPUPANEL_SYSTEM_UNINSTALL_CATEGORY="
            + failure.system_uninstall_failure_category("password=DO_NOT_LEAK")
        )
        self.assertNotIn("DO_NOT_LEAK", safe_report)
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
        self.assertEqual(failure.SCRIPTS.keys(), {"browser", "runtime", "compose", "restore", "container", "app-rejection", "app-install", "system-uninstall"})
        self.assertEqual(failure.app_api_stage(
            "G5_APP_API_FAILURE_STAGE=catalog-sync release=NO_GO\n"
            "cookie=UNREDACTABLE_SECRET\n"
        ), "catalog-sync")
        self.assertEqual(failure.app_api_stage(
            "G5_APP_API_FAILURE_STAGE=install-admission release=NO_GO\n"
        ), "install-admission")
        for forged in (
            "G5_APP_API_FAILURE_STAGE=/api/v1/apps/install release=NO_GO\n",
            "G5_APP_API_FAILURE_STAGE=install-admission password=SECRET release=NO_GO\n",
            "G5_APP_API_FAILURE_STAGE=detail-lookup release=GO\n",
        ):
            self.assertEqual(failure.app_api_stage(forged), "unknown")
        self.assertNotIn(
            "UNREDACTABLE_SECRET",
            "G5_APP_API_FAILURE_STAGE=" + failure.app_api_stage(
                "cookie=UNREDACTABLE_SECRET\n"
            ) + " release=NO_GO",
        )


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

    def test_live_appinstall_uses_complete_csrf_cookie_and_no_retry(self):
        source = (ROOT / "scripts/install-test/app-install-live.py").read_text()
        self.assertIn("item.slice('pcsrftoken='.length)", source)
        self.assertNotIn("item.slice(12)", source)
        self.assertIn("await_task(install_task, \"App\", \"TaskInstall\")", source)
        self.assertIn("await_task(uninstall_id, \"App\", \"TaskUninstall\")", source)
        self.assertIn('raise RuntimeError("task outcome ambiguous; do NOT retry")', source)
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertLess(
            runner.index("stage 'real_offline_appinstall_core_taskdb_docker'"),
            runner.index("stage 'guest_post_install_offline_restore'"),
        )

    def test_actual_appinstall_evidence_requires_exact_identity_and_cleanup(self):
        for changed in (
            {"guest_machine_id_sha256": "0" * 64},
            {"candidate": {**self.candidate, "source_sha": "0" * 40}},
            {"durable_admission_survived_agent_restart": False},
            {"duplicate_fences_observed": False},
            {"interrupted_install_unknown_fences_observed": False},
            {"distinct_operation_task_ids": False},
            {"app_evidence_observational_only": False},
            {"no_public_image_pull": False},
            {"docker_no_network_or_host_ports": False},
            {"fixture_source_cleaned": False},
            {"g5_full_appstore_business_acceptance": "PASS"},
            {"m0_release_decision": "GO"},
            {"steps": self.app_install["steps"][:-1]},
            {"steps": list(reversed(self.app_install["steps"]))},
            {"secret": "UNTRUSTED_EXTRA_FIELD"},
        ):
            with self.subTest(changed=changed):
                self.write("app-install-live.json", {**self.app_install, **changed})
                proof = self.summarise()
                self.assertEqual(proof["status"], "BLOCKED_OR_FAILED")
                self.assertEqual(proof["gpupanel_offline_appinstall_lifecycle"], "NOT_ATTESTED")
                self.assertEqual(proof["m0_release_decision"], "NO_GO")
        (self.state / "app-install-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")
        self.assertEqual(self.summarise()["gpupanel_offline_appinstall_lifecycle"], "NOT_ATTESTED")

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

    def test_real_appinstall_negative_proof_fail_closed(self):
        for fault in (
            {"candidate": {**self.candidate, "source_sha": "0" * 40}},
            {"guest_machine_id_sha256": "0" * 64},
            {"nonexistent_app_detail_rejected": False},
            {"no_task_app_or_docker_mutation": False},
            {"app_install_success": "PASS"},
            {"duplicate_task_replay": "PASS"},
            {"release_decision": "GO"},
            {"unexpected": "injected"},
        ):
            self.write("app-rejection-live.json", {**self.app_rejection, **fault})
            output = self.summarise()
            self.assertEqual(output["status"], "BLOCKED_OR_FAILED")
            self.assertEqual(output["real_appinstall_missing_detail_rejection"], "NOT_ATTESTED")
        self.write("app-rejection-live.json", self.app_rejection)
        (self.state / "app-rejection-live.json").unlink()
        self.assertEqual(self.summarise()["status"], "BLOCKED_OR_FAILED")

    def test_live_negative_requires_owned_guest_and_never_claims_replay(self):
        import ast
        source = (ROOT / "scripts/install-test/app-rejection-live.py").read_text()
        ast.parse(source)
        self.assertIn("vm.owned_pid", source)
        self.assertIn("candidate.verify_browser_chain", source)
        self.assertIn("/api/v1/apps/install", source)
        self.assertIn("after != before", source)
        self.assertIn('"duplicate_task_replay": "NOT_RUN"', source)
        runner = (ROOT / "scripts/install-test/ci-live-vm.sh").read_text()
        self.assertLess(
            runner.index("stage 'guest_agent_recovery'"),
            runner.index("stage 'guest_app_install_denied_without_side_effects'"),
        )
        self.assertLess(
            runner.index("stage 'guest_app_install_denied_without_side_effects'"),
            runner.index("stage 'guest_compose_offline_lifecycle'"),
        )

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
