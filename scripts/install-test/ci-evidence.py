"""Produce sanitized, fail-closed *partial* real VM CI evidence.

No passwords, raw API/installer logs, screenshots, SSH keys, or VM disks.
Never emits an M0 GO decision or implies an upgrade/App lifecycle was tested.
"""
from __future__ import annotations

import hashlib
import json
import os
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
    "guest_read_only_preflight_accepted",
    "guest_fresh_install",
    "real_installed_browser",
    "guest_agent_recovery",
)


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
    valid_source = (
        isinstance(source_sha, str) and len(source_sha) == 40
        and all(char in "0123456789abcdef" for char in source_sha)
    )
    browser_ok = (
        isinstance(browser, dict)
        and browser.get("kind") == "LIVE local VM; no intercepted APIs"
        and browser.get("candidate", {}).get("source_sha") == source_sha
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
    success = (
        run_completed and valid_source and sequence_ok
        and marks == list(STAGES) and browser_ok and runtime_ok
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
