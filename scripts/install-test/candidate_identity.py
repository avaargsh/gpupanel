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


def review_candidate(root: Path = ROOT, state: Path = STATE) -> dict:
    """Screen existing receipts without modifying anything.

    A result here proves only artifact consistency; a human must independently
    verify provenance, true VM/browser execution and missing G3/G5/G6 gates.
    """
    expected = local_build_digests(root)
    commit = source_checkout_commit(root)
    browser = _read_receipt(state, "browser-live.json")
    runtime = _read_receipt(state, "runtime-live.json")
    for name, receipt in (("browser", browser), ("runtime", runtime)):
        if validate_digests(receipt.get("binary_sha256")) != expected:
            raise ValueError(name + " observed a different installed candidate")
        if receipt.get("candidate_commit") != commit:
            raise ValueError(name + " checkout commit does not match candidate")
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
        "binary_sha256": expected,
        "scope": "G4 browser + limited G6 agent lifecycle receipts only",
        "m0_release_ready": False,
        "g3_install_upgrade_rollback": "NOT_VERIFIED",
        "g5_full_docker_app_lifecycle": "NOT_VERIFIED",
        "g6_full_recovery": "NOT_VERIFIED",
        "independent_review": "REQUIRED",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["review"])
    args = parser.parse_args()
    try:
        if args.action == "review":
            print(json.dumps(review_candidate(), indent=2, sort_keys=True))
    except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        parser.exit(1, "NOT VERIFIED: " + str(exc) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
