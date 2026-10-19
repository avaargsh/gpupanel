#!/usr/bin/env python3
"""Bind disposable-VM browser and lifecycle observations to ONE installed candidate.

This is a read-only consistency check, NOT an install/upgrade/rollback test,
proof of build provenance, or permission to promote GPUPanel M0 to GO.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import stat
import subprocess


ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
PARTS = ("core", "agent")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


def _regular_sha256(path: Path) -> str:
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("candidate binary must be a regular file: " + str(path))
    with path.open("rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise ValueError("candidate binary changed type")
        return hashlib.file_digest(stream, "sha256").hexdigest()


def local_build_digests(root: Path = ROOT) -> dict[str, str]:
    return {part: _regular_sha256(root / "build" / ("gpupanel-" + part))
            for part in PARTS}


def source_checkout_commit(root: Path = ROOT) -> str:
    result = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "HEAD"],
        check=True, capture_output=True, text=True, timeout=10,
    ).stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}", result):
        raise ValueError("cannot bind source checkout commit")
    return result


def validate_digests(value: object) -> dict[str, str]:
    if not isinstance(value, dict) or set(value) != set(PARTS):
        raise ValueError("candidate must identify core and agent only")
    if any(not isinstance(value[part], str) or not SHA256.fullmatch(value[part])
           for part in PARTS):
        raise ValueError("invalid candidate binary digest")
    return dict(value)


def guest_installed_digests(vm) -> dict[str, str]:
    """Read only two installed binaries in an owner-checked, running guest."""
    if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
        raise RuntimeError("task-owned disposable VM is not running")
    script = (
        "import hashlib,json,os,stat\n"
        "result={}\n"
        "for part in ('core','agent'):\n"
        " p='/opt/gpupanel/gpupanel-'+part\n"
        " s=os.lstat(p)\n"
        " if not stat.S_ISREG(s.st_mode): raise RuntimeError('invalid binary type')\n"
        " with open(p,'rb') as f:\n"
        "  if not stat.S_ISREG(os.fstat(f.fileno()).st_mode): raise RuntimeError('invalid open binary')\n"
        "  result[part]=hashlib.file_digest(f,'sha256').hexdigest()\n"
        "print(json.dumps(result))"
    )
    response = subprocess.run(
        vm.ssh_args() + [shlex.join(["sudo", "python3", "-c", script])],
        check=True, capture_output=True, text=True, timeout=40,
    )
    return validate_digests(json.loads(response.stdout))


def guest_identity_fingerprint(vm) -> str:
    """Pseudonymous stable guest identity; never write the raw machine-id.

    This checks cross-receipt coherence only. It cannot authenticate the guest,
    distinguish clones sharing a machine-id, or replace independent observation.
    """
    if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
        raise RuntimeError("task-owned disposable VM is not running")
    response = subprocess.run(
        vm.ssh_args() + [shlex.join(["cat", "/etc/machine-id"])],
        check=True, capture_output=True, text=True, timeout=20,
    )
    machine_id = response.stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{32}", machine_id) or machine_id == "0" * 32:
        raise ValueError("guest machine-id is missing or malformed")
    return hashlib.sha256(
        b"gpupanel.m0.guest.v1\x00" + machine_id.encode("ascii")
    ).hexdigest()


def assert_installed_candidate(vm, root: Path = ROOT) -> dict[str, str]:
    built = local_build_digests(root)
    installed = guest_installed_digests(vm)
    if installed != built:
        raise ValueError("installed Core/Agent digest differs from local candidate binaries")
    return installed


def _read_receipt(state: Path, name: str) -> dict:
    path = state / name
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError("receipt must be a real file: " + name)
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("receipt must be an object: " + name)
    return data


ATTEMPT_SCHEMA = "gpupanel.m0.acceptance-attempt.v1"
ATTEMPT_FILE = "active-acceptance-attempt.json"


def current_attempt(root: Path = ROOT, state: Path = STATE, *, vm=None) -> dict:
    """Read the operator-selected test round, rejecting stale source or guest."""
    record = _read_receipt(state, ATTEMPT_FILE)
    if set(record) != {"schema", "attempt_id", "candidate_commit",
                       "binary_sha256", "guest_identity_sha256"}:
        raise ValueError("acceptance attempt has unsupported or missing fields")
    if record["schema"] != ATTEMPT_SCHEMA or (
        not isinstance(record["attempt_id"], str)
        or not re.fullmatch(r"[0-9a-f]{32}", record["attempt_id"])
    ):
        raise ValueError("invalid acceptance attempt identity")
    if record["candidate_commit"] != source_checkout_commit(root):
        raise ValueError("acceptance attempt belongs to a different checkout commit")
    if validate_digests(record["binary_sha256"]) != local_build_digests(root):
        raise ValueError("acceptance attempt belongs to different candidate binaries")
    fingerprint = record["guest_identity_sha256"]
    if not isinstance(fingerprint, str) or not SHA256.fullmatch(fingerprint):
        raise ValueError("invalid acceptance attempt guest fingerprint")
    if vm is not None and (
        assert_installed_candidate(vm, root) != record["binary_sha256"]
        or guest_identity_fingerprint(vm) != fingerprint
    ):
        raise ValueError("acceptance attempt belongs to a different guest")
    return record


def begin_attempt(vm, root: Path = ROOT, state: Path = STATE) -> dict:
    """Explicitly rotate the active test round; retain old receipts for audit.

    Local test coordination only: the nonce is NOT authentication or evidence
    authenticity. Run only against the existing owner-checked disposable VM.
    """
    if not stat.S_ISDIR(state.lstat().st_mode) or state.stat().st_uid != os.getuid():
        raise PermissionError("acceptance state must be an owned real directory")
    record = {
        "schema": ATTEMPT_SCHEMA,
        "attempt_id": secrets.token_hex(16),
        "candidate_commit": source_checkout_commit(root),
        "binary_sha256": assert_installed_candidate(vm, root),
        "guest_identity_sha256": guest_identity_fingerprint(vm),
    }
    # Never truncate a previous receipt. The explicit begin operation changes
    # only the active pointer, so stale browser/runtime JSON cannot pass review.
    temporary = state / (".acceptance-attempt-" + secrets.token_hex(16) + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(record, stream, indent=2, sort_keys=True)
            stream.write("\\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, state / ATTEMPT_FILE)
    finally:
        if temporary.exists():
            temporary.unlink()
    return current_attempt(root, state, vm=vm)


def review_candidate(root: Path = ROOT, state: Path = STATE) -> dict:
    """Screen existing receipts without modifying anything.

    A result here proves only artifact consistency; a human must independently
    verify provenance, true VM/browser execution and missing G3/G5/G6 gates.
    """
    expected = local_build_digests(root)
    commit = source_checkout_commit(root)
    attempt = current_attempt(root, state)
    browser = _read_receipt(state, "browser-live.json")
    runtime = _read_receipt(state, "runtime-live.json")
    for name, receipt in (("browser", browser), ("runtime", runtime)):
        if validate_digests(receipt.get("binary_sha256")) != expected:
            raise ValueError(name + " observed a different installed candidate")
        if receipt.get("candidate_commit") != commit:
            raise ValueError(name + " checkout commit does not match candidate")
        if receipt.get("attempt_id") != attempt["attempt_id"]:
            raise ValueError(name + " receipt belongs to a different acceptance attempt")
    fingerprints = []
    for name, receipt in (("browser", browser), ("runtime", runtime)):
        fingerprint = receipt.get("guest_identity_sha256")
        if not isinstance(fingerprint, str) or not SHA256.fullmatch(fingerprint):
            raise ValueError(name + " missing valid guest identity fingerprint")
        fingerprints.append(fingerprint)
    if fingerprints[0] != fingerprints[1] or fingerprints[0] != attempt["guest_identity_sha256"]:
        raise ValueError("browser and runtime belong to different guest identities")
    for required in ("live_login_and_httponly_entrance", "anonymous_core_host_evidence_denied",
                     "invalid_csrf_denied", "live_core_agent_host_api"):
        if browser.get(required) is not True:
            raise ValueError("browser live acceptance is incomplete: " + required)
    for required in ("two_clean_agent_restarts", "fixture_marker_and_login_settings_retained",
                     "repeat_install_refused_without_service_restart"):
        if runtime.get(required) is not True:
            raise ValueError("runtime live acceptance is incomplete: " + required)
    return {
        "candidate_consistent": True,
        "candidate_commit": commit,
        "attempt_id": attempt["attempt_id"],
        "binary_sha256": expected,
        "guest_identity_sha256": fingerprints[0],
        "scope": "G4 browser + limited G6 agent lifecycle receipts only",
        "m0_release_ready": False,
        "g3_install_upgrade_rollback": "NOT_VERIFIED",
        "g5_full_docker_app_lifecycle": "NOT_VERIFIED",
        "g6_full_recovery": "NOT_VERIFIED",
        "independent_review": "REQUIRED",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["begin", "review"])
    args = parser.parse_args()
    try:
        if args.action == "begin":
            import vm
            result = begin_attempt(vm)
            print(json.dumps({"attempt_id": result["attempt_id"],
                              "scope": "disposable VM test coordination only",
                              "m0_release_ready": False}, indent=2))
        elif args.action == "review":
            print(json.dumps(review_candidate(), indent=2, sort_keys=True))
    except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        parser.exit(1, "NOT VERIFIED: " + str(exc) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
