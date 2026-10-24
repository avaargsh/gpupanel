"""Produce sanitized, fail-closed *partial* real VM CI evidence.

No passwords, raw API/installer logs, screenshots, SSH keys, or VM disks.
Never emits an M0 GO decision or implies an upgrade/App lifecycle was tested.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
REPORT = STATE / "ci-evidence.json"
STAGES = (
    "source_release_built",
    "signed_ubuntu_image_prepared",
    "task_owned_vm_booted",
    "guest_docker_ready",
    "offline_checkpoint_sealed",
    "guest_release_archive_verified",
    "guest_read_only_preflight_accepted",
    "guest_fresh_install",
    "installed_backend_binary_identity_matched",
    "real_installed_browser",
    "guest_agent_recovery",
    "guest_app_install_denied_without_side_effects",
    "guest_compose_offline_lifecycle",
    "guest_core_fixture_image_prepared",
    "real_core_agent_container_lifecycle",
    "real_offline_appinstall_core_taskdb_docker",
    "guest_post_install_offline_restore",
    "guest_preinstall_rollback_recovered",
)
CHECKPOINT_NAME = re.compile(r"^checkpoint-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$")


def _load(path: Path):
    try:
        if path.is_symlink() or not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, UnicodeError):
        return None


def _digest(path: Path):
    if path.is_symlink() or not path.is_file():
        return None
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def summarize(state: Path, *, run_completed: bool, source_sha: str) -> dict:
    observed = (state / "ci-stages.txt")
    marks = [] if observed.is_symlink() or not observed.is_file() else (
        observed.read_text(encoding="utf-8").splitlines()
    )
    # Do not accept repeated, out-of-order or invented stages.
    sequence_ok = marks == list(STAGES[:len(marks)])
    browser = _load(state / "browser-live.json")
    runtime = _load(state / "runtime-live.json")
    prepared = _load(state / "ubuntu2404/image-provenance.json")
    release = _load(state / "release-transfer.json")
    compose = _load(state / "compose-live.json")
    container = _load(state / "container-live.json")
    app_install = _load(state / "app-install-live.json")
    app_rejection = _load(state / "app-rejection-live.json")
    restore = _load(state / "restore-live.json")
    preinstall_baseline = _load(state / "preinstall-baseline.json")
    preinstall_checkpoint = _load(state / "preinstall-checkpoint.json")
    preinstall_rollback = _load(state / "preinstall-rollback-live.json")
    valid_source = (
        isinstance(source_sha, str) and len(source_sha) == 40
        and all(char in "0123456789abcdef" for char in source_sha)
    )
    expected_archive = f"gpupanel-ci-{source_sha[:12]}-linux-amd64.tar.gz"
    release_ok = (
        valid_source
        and isinstance(release, dict)
        and set(release) == {
            "schema", "source_sha", "archive_name", "local_release_sha256",
            "guest_release_sha256", "guest_machine_id_sha256",
            "signature_proof",
        }
        and release.get("schema") == "gpupanel.vm.release-transfer.v1"
        and release.get("source_sha") == source_sha
        and release.get("archive_name") == expected_archive
        and isinstance(release.get("local_release_sha256"), str)
        and len(release["local_release_sha256"]) == 64
        and all(c in "0123456789abcdef" for c in release["local_release_sha256"])
        and release.get("guest_release_sha256") == release["local_release_sha256"]
        and isinstance(release.get("guest_machine_id_sha256"), str)
        and len(release["guest_machine_id_sha256"]) == 64
        and all(c in "0123456789abcdef" for c in release["guest_machine_id_sha256"])
        and release.get("signature_proof") == "NOT_ATTESTED"
        and isinstance(browser, dict)
        and release["guest_machine_id_sha256"] ==
            browser.get("guest_machine_id_sha256")
    )
    browser_ok = (
        isinstance(browser, dict)
        and browser.get("kind") == "LIVE local VM; no intercepted APIs"
        and browser.get("candidate", {}).get("source_sha") == source_sha
        and release_ok
        and browser.get("guest_machine_id_sha256") == release["guest_machine_id_sha256"]
        and browser.get("live_operations_center_read_only") is True
        and browser.get("browser_page_errors") == []
    )
    runtime_ok = (
        isinstance(runtime, dict)
        and browser_ok
        and runtime.get("candidate") == browser.get("candidate")
        and runtime.get("guest_machine_id_sha256")
            == browser.get("guest_machine_id_sha256")
        and runtime.get("same_candidate_live_browser_verified") is True
        and runtime.get("two_clean_agent_restarts") is True
        and runtime.get("explicit_fixture_operator_recovery") is True
        and runtime.get("fixture_marker_and_login_settings_retained") is True
    )
    compose_ok = (
        isinstance(compose, dict)
        and browser_ok and runtime_ok
        and compose == {
            "kind": "REAL GUEST OFFLINE DOCKER COMPOSE FIXTURE; NOT GPUPanel AppInstall",
            "source_sha": source_sha,
            "guest_machine_id_sha256": browser.get("guest_machine_id_sha256"),
            "container_created": True,
            "logs_observed": True,
            "offline_no_host_ports": True,
            "marker_reread_after_stop_start": True,
            "marker_reread_after_restart": True,
            "container_removed": True,
            "local_image_removed": True,
        }
    )
    expected_container_steps = [
        "create_and_independent_running_observation",
        "stop_with_independent_observation",
        "start_with_independent_observation",
        "restart_with_independent_observation",
        "remove_with_independent_observation",
    ]
    container_ok = (
        isinstance(container, dict)
        and compose_ok
        and container.get("kind") ==
            "REAL UBUNTU GUEST + AUTHENTICATED CORE→AGENT→DOCKER; NO MOCK API"
        and container.get("candidate") == browser.get("candidate")
        and container.get("guest_machine_id_sha256") ==
            browser.get("guest_machine_id_sha256")
        and container.get("steps") == expected_container_steps
        and container.get("distinct_task_ids") is True
        and container.get("no_external_app_catalog_used") is True
        and container.get("app_install_lifecycle") == "NOT_RUN"
        and container.get("compose_install_lifecycle") == "NOT_RUN"
        and isinstance(container.get("fixture_image_sha256"), str)
        and len(container["fixture_image_sha256"]) == 64
        and all(c in "0123456789abcdef" for c in container["fixture_image_sha256"])
    )
    expected_app_steps = [
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
    ]
    app_install_ok = (
        isinstance(app_install, dict) and container_ok
        and set(app_install) == {
            "kind", "candidate", "guest_machine_id_sha256",
            "steps", "durable_admission_survived_agent_restart",
            "duplicate_fences_observed",
            "interrupted_install_unknown_fences_observed",
            "distinct_operation_task_ids",
            "app_evidence_observational_only", "no_public_image_pull",
            "docker_no_network_or_host_ports", "fixture_source_cleaned",
            "g5_full_appstore_business_acceptance", "m0_release_decision",
        }
        and app_install.get("kind") ==
            "REAL OWNED UBUNTU GPUPANEL APPINSTALL API; NO MOCKS"
        and app_install.get("candidate") == browser.get("candidate")
        and app_install.get("guest_machine_id_sha256") ==
            browser.get("guest_machine_id_sha256")
        and app_install.get("steps") == expected_app_steps
        and app_install.get("durable_admission_survived_agent_restart") is True
        and app_install.get("duplicate_fences_observed") is True
        and app_install.get("interrupted_install_unknown_fences_observed") is True
        and app_install.get("distinct_operation_task_ids") is True
        and app_install.get("app_evidence_observational_only") is True
        and app_install.get("no_public_image_pull") is True
        and app_install.get("docker_no_network_or_host_ports") is True
        and app_install.get("fixture_source_cleaned") is True
        and app_install.get("g5_full_appstore_business_acceptance") == "NOT_RUN"
        and app_install.get("m0_release_decision") == "NO_GO"
    )
    expected_binary = browser.get("candidate", {}).get("binary_sha256") if browser_ok else None
    restored_digest = restore.get("offline_checkpoint_sha256") if isinstance(restore, dict) else None
    restore_ok = (
        isinstance(restore, dict) and runtime_ok and compose_ok and container_ok
        and app_install_ok
        and restore.get("kind") ==
            "REAL GUEST POST-INSTALL OFFLINE SNAPSHOT RESTORE; PARTIAL G3/G6"
        and restore.get("source_sha") == source_sha
        and restore.get("guest_machine_id_sha256")
            == browser.get("guest_machine_id_sha256")
        and restore.get("binary_sha256") == expected_binary
        and isinstance(restored_digest, str)
        and len(restored_digest) == 64
        and all(ch in "0123456789abcdef" for ch in restored_digest)
        and restore.get("restored_disk_sha256") == restored_digest
        and restore.get("fault_injected_marker_changed") is True
        and restore.get("marker_reverted_by_disk_restore") is True
        and restore.get("login_settings_digest_equal") is True
        and restore.get("services_running_exact_binaries") is True
        and restore.get("full_data_restore_verified") is False
        and restore.get("m0_release_decision") == "NO_GO"
    )
    app_rejection_ok = (
        isinstance(app_rejection, dict) and runtime_ok
        and set(app_rejection) == {
            "schema", "kind", "candidate", "guest_machine_id_sha256",
            "nonexistent_app_detail_rejected",
            "no_task_app_or_docker_mutation", "app_install_success",
            "duplicate_task_replay", "release_decision",
        }
        and app_rejection["schema"] == "gpupanel.vm.appinstall-rejection.v1"
        and app_rejection["kind"] ==
            "REAL INSTALLED CORE+AGENT APPINSTALL REJECTION; NOT APP INSTALL"
        and app_rejection["candidate"] == browser.get("candidate")
        and app_rejection["guest_machine_id_sha256"] ==
            browser.get("guest_machine_id_sha256")
        and app_rejection["nonexistent_app_detail_rejected"] is True
        and app_rejection["no_task_app_or_docker_mutation"] is True
        and app_rejection["app_install_success"] == "NOT_RUN"
        and app_rejection["duplicate_task_replay"] == "NOT_RUN"
        and app_rejection["release_decision"] == "NO_GO"
    )
    def valid_digest(value):
        return isinstance(value, str) and len(value) == 64 and all(
            char in "0123456789abcdef" for char in value
        )

    inventory_keys = {"containers", "networks", "volumes", "images"}
    baseline_keys = {
        "schema", "source_sha", "guest_machine_id_sha256", "binary_sha256",
        "docker_server_version", "docker_inventory_sha256", "docker_active",
        "docker_enabled", "panel_runtime_absent", "panel_port_closed",
    }
    baseline_inventory = (
        preinstall_baseline.get("docker_inventory_sha256")
        if isinstance(preinstall_baseline, dict) else None
    )
    baseline_ok = (
        isinstance(browser, dict)
        and isinstance(preinstall_baseline, dict)
        and set(preinstall_baseline) == baseline_keys
        and preinstall_baseline.get("schema") == "gpupanel.vm.preinstall-baseline.v1"
        and preinstall_baseline.get("source_sha") == source_sha
        and preinstall_baseline.get("guest_machine_id_sha256") == browser.get("guest_machine_id_sha256")
        and preinstall_baseline.get("binary_sha256") == expected_binary
        and isinstance(preinstall_baseline.get("docker_server_version"), str)
        and bool(preinstall_baseline["docker_server_version"])
        and isinstance(baseline_inventory, dict)
        and set(baseline_inventory) == inventory_keys
        and all(valid_digest(baseline_inventory.get(key)) for key in inventory_keys)
        and all(preinstall_baseline.get(key) is True for key in (
            "docker_active", "docker_enabled", "panel_runtime_absent", "panel_port_closed"
        ))
    )
    checkpoint_keys = {
        "schema", "source_sha", "checkpoint_name", "checkpoint_sha256",
        "guest_machine_id_sha256", "binary_sha256", "docker_server_version",
        "docker_inventory_sha256",
    }
    checkpoint_ok = (
        baseline_ok
        and isinstance(preinstall_checkpoint, dict)
        and set(preinstall_checkpoint) == checkpoint_keys
        and preinstall_checkpoint.get("schema") == "gpupanel.vm.preinstall-checkpoint.v1"
        and preinstall_checkpoint.get("source_sha") == source_sha
        and isinstance(preinstall_checkpoint.get("checkpoint_name"), str)
        and CHECKPOINT_NAME.fullmatch(preinstall_checkpoint["checkpoint_name"]) is not None
        and valid_digest(preinstall_checkpoint.get("checkpoint_sha256"))
        and preinstall_checkpoint.get("guest_machine_id_sha256") == preinstall_baseline.get("guest_machine_id_sha256")
        and preinstall_checkpoint.get("binary_sha256") == expected_binary
        and preinstall_checkpoint.get("docker_server_version") == preinstall_baseline.get("docker_server_version")
        and preinstall_checkpoint.get("docker_inventory_sha256") == baseline_inventory
    )
    rollback_keys = {
        "schema", "kind", "source_sha", "guest_machine_id_sha256",
        "preinstall_checkpoint_sha256", "restored_disk_sha256",
        "installed_candidate_matched_before_rollback", "synthetic_debris_marker_injected",
        "synthetic_debris_unit_injected", "panel_services_stopped_before_restore",
        "restored_guest_rebooted_and_reobserved", "guest_machine_id_matches_preinstall",
        "docker_server_version_matches_preinstall", "docker_inventory_matches_preinstall",
        "docker_service_active_and_enabled", "gpupanel_runtime_paths_absent",
        "gpupanel_systemd_units_absent", "synthetic_debris_state_absent", "panel_port_closed",
        "full_upgrade_rollback_verified", "m0_release_decision",
    }
    rollback_ok = (
        checkpoint_ok and restore_ok
        and isinstance(preinstall_rollback, dict)
        and set(preinstall_rollback) == rollback_keys
        and preinstall_rollback.get("schema") == "gpupanel.vm.preinstall-rollback.v1"
        and preinstall_rollback.get("kind") == "REAL TASK-OWNED UBUNTU PRE-INSTALL CHECKPOINT RESTORE AFTER SYNTHETIC DEBRIS INJECTION"
        and preinstall_rollback.get("source_sha") == source_sha
        and preinstall_rollback.get("guest_machine_id_sha256") == preinstall_baseline.get("guest_machine_id_sha256")
        and preinstall_rollback.get("preinstall_checkpoint_sha256") == preinstall_checkpoint.get("checkpoint_sha256")
        and preinstall_rollback.get("restored_disk_sha256") == preinstall_checkpoint.get("checkpoint_sha256")
        and all(preinstall_rollback.get(key) is True for key in (
            "installed_candidate_matched_before_rollback", "synthetic_debris_marker_injected",
            "synthetic_debris_unit_injected", "panel_services_stopped_before_restore",
            "restored_guest_rebooted_and_reobserved", "guest_machine_id_matches_preinstall",
            "docker_server_version_matches_preinstall", "docker_inventory_matches_preinstall",
            "docker_service_active_and_enabled", "gpupanel_runtime_paths_absent",
            "gpupanel_systemd_units_absent", "synthetic_debris_state_absent", "panel_port_closed",
        ))
        and preinstall_rollback.get("full_upgrade_rollback_verified") is False
        and preinstall_rollback.get("m0_release_decision") == "NO_GO"
    )
    success = (
        run_completed and valid_source and release_ok and sequence_ok
        and marks == list(STAGES) and browser_ok and runtime_ok and compose_ok
        and container_ok and restore_ok and app_rejection_ok and app_install_ok
        and rollback_ok
        and isinstance(prepared, dict)
        and prepared.get("signed_checksum_verified") is True
    )
    candidate = browser.get("candidate", {}) if browser_ok else {}
    bin_hashes = candidate.get("binary_sha256", {})
    if not isinstance(bin_hashes, dict):
        bin_hashes = {}
    return {
        "schema": "gpupanel.ci-live-vm-partial.v1",
        "source_sha": source_sha if valid_source else "INVALID",
        "kind": "REAL EPHEMERAL QEMU/UBUNTU VM; NO MOCKED CORE/AGENT APIs",
        "status": "PARTIAL_ACCEPTED" if success else "BLOCKED_OR_FAILED",
        "stages_completed": marks if sequence_ok else [],
        "stage_sequence_verified": sequence_ok,
        "guest_release_transfer": "MATCHED" if release_ok else "NOT_ATTESTED",
        "release_archive_sha256": (
            release["local_release_sha256"] if release_ok else None
        ),
        "release_package_signature": "NOT_ATTESTED",
        "source_binary_sha256": {
            name: bin_hashes.get(name) if isinstance(bin_hashes.get(name), str) else None
            for name in ("core", "agent")
        },
        "guest_machine_id_sha256": (
            browser.get("guest_machine_id_sha256") if browser_ok else None
        ),
        "fresh_install": "PASS" if success else "NOT_ATTESTED",
        "authenticated_operations_center": "PASS" if success else "NOT_ATTESTED",
        "agent_restart_and_recovery": "PARTIAL_PASS" if success else "NOT_ATTESTED",
        "offline_docker_compose_fixture": "PASS" if success else "NOT_ATTESTED",
        "core_agent_docker_container_lifecycle": "PARTIAL_PASS" if success else "NOT_ATTESTED",
        "gpupanel_offline_appinstall_lifecycle": "PARTIAL_PASS" if success else "NOT_ATTESTED",
        "real_appinstall_missing_detail_rejection": "PASS" if success else "NOT_ATTESTED",
        "post_install_offline_disk_restore": "PASS" if success else "NOT_ATTESTED",
        "pre_install_snapshot_rollback": "PASS" if success else "NOT_ATTESTED",
        "full_app_compose_install_lifecycle": "NOT_RUN",
        "upgrade_and_rollback": "NOT_RUN",
        "full_data_restore": "NOT_RUN",
        "independent_reviewer": "NOT_ATTESTED",
        "m0_release_decision": "NO_GO",
    }


def main() -> int:
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    run_completed = sys.argv[1:] == ["--live-script-completed"]
    report = summarize(
        STATE, run_completed=run_completed,
        source_sha=os.environ.get("GITHUB_SHA", ""),
    )
    # Atomic, 0600, no symlink destination; CI only uploads this report.
    tmp = STATE / "ci-evidence.json.partial"
    with tmp.open("x", encoding="utf-8") as stream:
        json.dump(report, stream, indent=2)
        stream.write("\n")
    tmp.replace(REPORT)
    print(json.dumps(report, sort_keys=True))
    # Failing evidence verification must fail the job, not just log BLOCKED.
    return 0 if report["status"] == "PARTIAL_ACCEPTED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
