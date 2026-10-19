#!/usr/bin/env python3
"""Prove a SECOND install is rejected before altering an owned Ubuntu guest.

Uses the exact previously installed, task-owned CI release. Does not touch
the runner's host services, an arbitrary SSH target, or a user workstation.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shlex
import subprocess

import candidate
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
REPORT = STATE / "reinstall-denial-live.json"
KINDS = ("core", "agent")


def guest(args: list[str], *, max_seconds: int = 40):
    return subprocess.run(
        vm.ssh_args() + [shlex.join(args)],
        text=True, capture_output=True, timeout=max_seconds, check=False,
    )


def fingerprint() -> dict:
    code = """import hashlib,json,os,subprocess
from pathlib import Path
root=Path('/opt/gpupanel')
def binary(name):
    path=root/('gpupanel-'+name)
    pid=subprocess.check_output(
      ['systemctl','show','gpupanel-'+name,'-p','MainPID','--value'],
      text=True,timeout=5).strip()
    if not pid.isdecimal() or int(pid)==0:
        raise RuntimeError('service not running')
    running=os.stat('/proc/'+pid+'/exe')
    installed=os.stat(path)
    if (running.st_dev,running.st_ino)!=(installed.st_dev,installed.st_ino):
        raise RuntimeError('running service executable differs from installed')
    with path.open('rb') as stream:
        digest=hashlib.file_digest(stream,'sha256').hexdigest()
    return {'sha256':digest,'pid':int(pid)}
def file_digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()
print(json.dumps({
  'binary':{name:binary(name) for name in ('core','agent')},
  'pctl_sha256':file_digest('/opt/gpupanel/pctl'),
  'systemd':{name:file_digest('/etc/systemd/system/gpupanel-'+name+'.service')
             for name in ('core','agent')},
  'machine_id_sha256':hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest(),
}))
"""
    outcome = guest(["sudo", "python3", "-c", code])
    if outcome.returncode:
        raise RuntimeError("installed guest service identity unavailable")
    value = json.loads(outcome.stdout)
    for name in KINDS:
        info = value["binary"][name]
        if not candidate.SHA256.fullmatch(info["sha256"]) or (
            type(info["pid"]) is not int or info["pid"] <= 0
        ):
            raise RuntimeError("invalid guest running service identity")
        if not candidate.SHA256.fullmatch(value["systemd"][name]):
            raise RuntimeError("invalid guest unit fingerprint")
    if (
        not candidate.SHA256.fullmatch(value["pctl_sha256"])
        or not candidate.SHA256.fullmatch(value["machine_id_sha256"])
    ):
        raise RuntimeError("invalid guest configuration identity")
    return value


def verify_preflight(raw: str, exit_code: int) -> None:
    if exit_code != 2:
        raise RuntimeError("installed-host preflight did not reject")
    report = json.loads(raw)
    if not isinstance(report, dict) or (
        report.get("product") != "GPUPanel"
        or report.get("phase") != "pre-install-diagnostics-only"
        or report.get("installable") is not False
        or report.get("safe_to_install") is not False
    ):
        raise RuntimeError("unexpected installed-host preflight contract")
    checks = report.get("checks")
    blocked = report.get("blockers")
    if not isinstance(checks, list) or not isinstance(blocked, list):
        raise RuntimeError("malformed collision evidence")
    states = {}
    for entry in checks:
        if not isinstance(entry, dict) or not isinstance(entry.get("code"), str) or (
            entry.get("code") in states
        ):
            raise RuntimeError("duplicate or malformed collision check")
        states[entry["code"]] = entry.get("state")
    if (
        states.get("runtime_collision") != "BLOCKED"
        or "runtime_collision" not in blocked
        or not all(isinstance(x, str) and states.get(x) == "BLOCKED" for x in blocked)
    ):
        raise RuntimeError("runtime collision was not independently confirmed")


def main() -> None:
    if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
        raise RuntimeError("test requires a running task-owned QEMU guest")
    if REPORT.exists() or REPORT.is_symlink():
        raise RuntimeError("reinstall denial has already been recorded")
    local = candidate.local_candidate(ROOT)
    browser_file = STATE / "browser-live.json"
    runtime_file = STATE / "runtime-live.json"
    if (browser_file.is_symlink() or runtime_file.is_symlink()
            or not browser_file.is_file() or not runtime_file.is_file()):
        raise RuntimeError("live first-install browser or recovery proof missing")
    browser = json.loads(browser_file.read_text())
    runtime = json.loads(runtime_file.read_text())
    candidate.verify_browser_chain(browser, local)
    if not (
        runtime.get("candidate") == local
        and runtime.get("guest_machine_id_sha256") == browser.get("guest_machine_id_sha256")
        and runtime.get("same_candidate_live_browser_verified") is True
        and runtime.get("explicit_fixture_operator_recovery") is True
    ):
        raise RuntimeError("prior same-candidate real guest acceptance missing")

    before = fingerprint()
    if before["machine_id_sha256"] != browser["guest_machine_id_sha256"]:
        raise RuntimeError("VM identity differs from first-install browser")
    candidate.verify_installed(local, {
        name: before["binary"][name]["sha256"] for name in KINDS
    })

    package = "gpupanel-ci-" + local["source_sha"][:12] + "-linux-amd64"
    preflight = guest(["python3", "/tmp/" + package + "/gpupanel-install-preflight.py", "--json"])
    verify_preflight(preflight.stdout, preflight.returncode)

    # Intentionally attempt the same operator-gated installer on the same
    # disposable guest; collision logic must refuse before writing anything.
    # Capture stdout/stderr in RAM only; it may contain sensitive setup data.
    attempt = guest([
        "sudo", "/tmp/" + package + "/install.sh",
        "--approve-disposable-vm-install", "--entrance", "itest-ci",
    ], max_seconds=45)
    if attempt.returncode == 0:
        raise RuntimeError("UNSAFE: repeated installation unexpectedly succeeded")
    if "preflight blocked" not in attempt.stdout and (
        "preflight blocked" not in attempt.stderr
    ):
        raise RuntimeError("installer refusal not attributable to its collision gate")

    after = fingerprint()
    if after != before:
        raise RuntimeError("rejected reinstall changed running guest configuration")

    report = {
        "kind": "REAL OWNED UBUNTU GUEST REINSTALL REFUSAL; NO MOCKS",
        "candidate": local,
        "guest_machine_id_sha256": before["machine_id_sha256"],
        "preflight_runtime_collision": "BLOCKED",
        "operator_gated_reinstall": "DENIED",
        "running_binary_and_pid_unchanged": True,
        "pctl_and_systemd_hashes_unchanged": True,
        "credential_values_recorded": False,
        "release_decision": "NO_GO",
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    REPORT.chmod(0o600)
    print("PASS real guest already-installed collision refusal; no installed changes; M0 NO_GO")


if __name__ == "__main__":
    main()
