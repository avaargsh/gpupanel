#!/usr/bin/env python3
"""Exercise the real package uninstaller on the task-owned Ubuntu VM.

Default uninstall must stop only GPUPanel-owned services, remove the matching
systemd units, and retain the exact binaries/configuration/database/Docker state.
It does not exercise destructive purge, upgrade, or full recovery.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys

import candidate
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
PROOF = STATE / "uninstall-live.json"
RAW_LOG = STATE / "uninstall.raw.log"
PANEL_DIR = Path("/opt/gpupanel")
UNIT_DIR = Path("/etc/systemd/system")
UNIT_NAMES = ("gpupanel-core", "gpupanel-agent")
DATA_PATHS = {
    "pctl": PANEL_DIR / "pctl",
    "core_db": PANEL_DIR / "db/core.db",
    "app_yaml": PANEL_DIR / "conf/app.yaml",
}


GUEST_SOURCE = r'''
import hashlib, json, os, socket, subprocess
from pathlib import Path

ACTION = __ACTION__
SOURCE_SHA = __SOURCE_SHA__
EXPECTED_BINARY = json.loads(__BINARY_JSON__)
EXPECTED_MACHINE = __MACHINE_JSON__
PANEL = Path("/opt/gpupanel")
UNIT_DIR = Path("/etc/systemd/system")


def run(args, check=True, timeout=20):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=timeout)
    if check and result.returncode != 0:
        raise RuntimeError("guest lifecycle observation failed")
    return result.stdout.strip(), result.returncode


def digest(path):
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("required retained file missing or redirected")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def active(name):
    _, code = run(["systemctl", "is-active", "--quiet", name], check=False)
    return code == 0


def enabled(name):
    _, code = run(["systemctl", "is-enabled", "--quiet", name], check=False)
    return code == 0


def process_paths():
    expected = {str(PANEL / "gpupanel-core"), str(PANEL / "gpupanel-agent")}
    found = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            path = os.readlink(entry / "exe").removesuffix(" (deleted)")
        except OSError:
            continue
        if path in expected:
            found.append(entry.name)
    return sorted(set(found))


def verify_running_service_processes():
    expected_pids = []
    for name in ("gpupanel-core", "gpupanel-agent"):
        pid, _ = run(["systemctl", "show", "--property=MainPID", "--value", name + ".service"])
        if not pid.isdecimal() or int(pid) <= 0:
            raise RuntimeError("service has no observable main process before uninstall")
        actual = os.readlink(Path("/proc") / pid / "exe").removesuffix(" (deleted)")
        if actual != str(PANEL / name):
            raise RuntimeError("service main process does not execute the owned binary")
        expected_pids.append(pid)
    if sorted(expected_pids) != process_paths():
        raise RuntimeError("additional or missing GPUPanel executable process before uninstall")
    return sorted(expected_pids)


def docker_inventory():
    version, _ = run(["docker", "info", "--format", "{{.ServerVersion}}"], timeout=30)
    rows = {
        "containers": run(["docker", "ps", "-aq", "--no-trunc"])[0].splitlines(),
        "networks": run(["docker", "network", "ls", "--no-trunc", "--format",
                         "{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}"])[0].splitlines(),
        "volumes": run(["docker", "volume", "ls", "--format", "{{.Name}}"])[0].splitlines(),
        "images": run(["docker", "image", "ls", "--no-trunc", "--format",
                       "{{.ID}}|{{.Repository}}|{{.Tag}}"])[0].splitlines(),
    }
    return version, {key: sorted(value) for key, value in rows.items()}


machine_file = Path("/etc/machine-id")
machine_sha = digest(machine_file)
if EXPECTED_MACHINE and machine_sha != EXPECTED_MACHINE:
    raise RuntimeError("guest identity changed")
unit_hashes = {}
for name in ("gpupanel-core", "gpupanel-agent"):
    unit_path = UNIT_DIR / (name + ".service")
    if ACTION == "capture":
        unit_digest = digest(unit_path)
        lines = unit_path.read_text(encoding="utf-8").splitlines()
        if lines.count("ExecStart=" + str(PANEL / name)) != 1:
            raise RuntimeError("unit ExecStart differs from owned installation")
        if lines.count("WorkingDirectory=" + str(PANEL)) != 1:
            raise RuntimeError("unit WorkingDirectory differs from owned installation")
        if not active(name + ".service") or not enabled(name + ".service"):
            raise RuntimeError("GPUPanel services must be active and enabled before uninstall")
        fragment, code = run(["systemctl", "show", "--property=FragmentPath", "--value",
                              name + ".service"], check=False)
        if code != 0 or fragment != str(unit_path):
            raise RuntimeError("systemd fragment does not match owned unit file")
        unit_hashes[name] = unit_digest
    elif ACTION == "verify":
        if unit_path.exists() or unit_path.is_symlink():
            raise RuntimeError("GPUPanel unit file survived uninstall")
        if active(name + ".service") or enabled(name + ".service"):
            raise RuntimeError("GPUPanel service remained active or enabled")
        unit_hashes[name] = "REMOVED"
    else:
        raise RuntimeError("unsupported action")

binary_hashes = {}
for name in ("core", "agent"):
    binary = PANEL / ("gpupanel-" + name)
    binary_hashes[name] = digest(binary)
if binary_hashes != EXPECTED_BINARY:
    raise RuntimeError("retained Core/Agent binaries do not match the tested candidate")

retained = {
    "pctl": digest(PANEL / "pctl"),
    "core_db": digest(PANEL / "db/core.db"),
    "app_yaml": digest(PANEL / "conf/app.yaml"),
}
if ACTION == "capture":
    verify_running_service_processes()
elif ACTION == "verify":
    if process_paths():
        raise RuntimeError("GPUPanel process survived uninstall")

docker_version, docker_rows = docker_inventory()
print(json.dumps({
    "schema": "gpupanel.vm.system-uninstall-probe.v1",
    "source_sha": SOURCE_SHA,
    "guest_machine_id_sha256": machine_sha,
    "binary_sha256": binary_hashes,
    "retained_file_sha256": retained,
    "unit_file_sha256": unit_hashes,
    "docker_server_version": docker_version,
    "docker_inventory": docker_rows,
    "systemd_units_absent": ACTION == "verify",
    "services_inactive_and_disabled": ACTION == "verify",
    "running_processes_absent": not process_paths(),
    "installation_directory_retained": PANEL.is_dir(),
}, sort_keys=True))
'''


def _digest_rows(rows: dict[str, list[str]]) -> dict[str, str]:
    if not isinstance(rows, dict) or set(rows) != {"containers", "networks", "volumes", "images"}:
        raise RuntimeError("Docker inventory schema invalid")
    result = {}
    for key, items in rows.items():
        if not isinstance(items, list) or any(not isinstance(item, str) for item in items):
            raise RuntimeError("Docker inventory rows invalid")
        encoded = ("\n".join(sorted(items)) + ("\n" if items else "")).encode("utf-8")
        result[key] = hashlib.sha256(encoded).hexdigest()
    return result


def _guest_probe(action: str, local: dict, machine_sha: str) -> dict:
    if action not in ("capture", "verify"):
        raise ValueError("unsupported uninstall probe action")
    if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
        raise RuntimeError("task-owned Ubuntu VM must be running")
    script = GUEST_SOURCE.replace("__ACTION__", repr(action))
    script = script.replace("__SOURCE_SHA__", repr(local["source_sha"]))
    script = script.replace("__BINARY_JSON__", repr(json.dumps(local["binary_sha256"], sort_keys=True)))
    script = script.replace("__MACHINE_JSON__", repr(json.dumps(machine_sha)))
    command = vm.ssh_args() + [shlex.join(["sudo", "python3", "-c", script])]
    raw = subprocess.check_output(command, text=True, stderr=subprocess.DEVNULL, timeout=120)
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("source_sha") != local["source_sha"]:
        raise RuntimeError("guest uninstall observation differs from exact candidate")
    if value.get("guest_machine_id_sha256") != machine_sha:
        raise RuntimeError("guest machine identity changed")
    return value


def _read_record(name: str) -> dict:
    path = STATE / name
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("required same-candidate proof missing")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError("invalid prior proof")
    return value


def _run_uninstaller(local: dict, log_name: str) -> None:
    if log_name not in ("uninstall.raw.log", "uninstall-repeat.raw.log"):
        raise ValueError("unsupported uninstall attempt")
    package = f"gpupanel-ci-{local['source_sha'][:12]}-linux-amd64"
    guest_path = f"/tmp/{package}/uninstall.sh"
    log_path = STATE / log_name
    if log_path.exists() or log_path.is_symlink():
        raise RuntimeError("uninstall attempt already recorded; do not replay it")
    fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as log:
        result = subprocess.run(
            vm.ssh_args() + [shlex.join(["sudo", guest_path, "--base-dir", "/opt"])],
            stdout=log, stderr=subprocess.STDOUT, timeout=120, check=False,
        )
        log.flush()
        os.fsync(log.fileno())
    if result.returncode != 0:
        # Do not print command output or automatically repeat an operation that
        # may have changed systemd state before its final failure.
        raise RuntimeError(f"actual package uninstaller returned exit {result.returncode}")


def main() -> int:
    if os.environ.get("CI") != "true" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("canonical CI runner required")
    local = candidate.local_candidate(ROOT)
    browser = _read_record("browser-live.json")
    candidate.verify_browser_chain(browser, local)
    machine = browser.get("guest_machine_id_sha256")
    if not isinstance(machine, str) or not candidate.SHA256.fullmatch(machine):
        raise RuntimeError("browser guest identity invalid")
    restore = _read_record("restore-live.json")
    if (
        restore.get("source_sha") != local["source_sha"]
        or restore.get("guest_machine_id_sha256") != machine
        or restore.get("binary_sha256") != local["binary_sha256"]
        or restore.get("services_running_exact_binaries") is not True
    ):
        raise RuntimeError("post-install restore proof does not bind this candidate")
    if PROOF.exists() or PROOF.is_symlink():
        raise RuntimeError("system uninstall proof already exists; do not replay")
    before = _guest_probe("capture", local, machine)
    _run_uninstaller(local, "uninstall.raw.log")
    after = _guest_probe("verify", local, machine)
    if (
        before.get("schema") != "gpupanel.vm.system-uninstall-probe.v1"
        or after.get("schema") != "gpupanel.vm.system-uninstall-probe.v1"
        or before.get("binary_sha256") != after.get("binary_sha256")
        or before.get("retained_file_sha256") != after.get("retained_file_sha256")
        or before.get("docker_server_version") != after.get("docker_server_version")
        or before.get("docker_inventory") != after.get("docker_inventory")
        or not isinstance(before.get("unit_file_sha256"), dict)
        or set(before["unit_file_sha256"]) != set(UNIT_NAMES)
        or any(len(value) != 64 for value in before["unit_file_sha256"].values())
        or any(after.get(key) is not True for key in (
            "systemd_units_absent", "services_inactive_and_disabled",
            "running_processes_absent", "installation_directory_retained",
        ))
    ):
        raise RuntimeError("independent post-uninstall state differs from the pre-operation baseline")

    # Only replay after the first command returned success and its post-state
    # independently matched. The second call must converge without side effects.
    _run_uninstaller(local, "uninstall-repeat.raw.log")
    after_repeat = _guest_probe("verify", local, machine)
    if after_repeat != after:
        raise RuntimeError("repeated default uninstall changed the verified post-state")
    proof = {
        "schema": "gpupanel.vm.system-uninstall.v1",
        "kind": "REAL UBUNTU PACKAGE SYSTEMD UNINSTALL; DEFAULT DATA PRESERVATION; NO MOCKS",
        "source_sha": local["source_sha"],
        "guest_machine_id_sha256": machine,
        "binary_sha256": local["binary_sha256"],
        "retained_file_sha256": after["retained_file_sha256"],
        "unit_file_sha256": before["unit_file_sha256"],
        "docker_inventory_sha256": _digest_rows(before["docker_inventory"]),
        "docker_server_version": before["docker_server_version"],
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
    fd = os.open(PROOF, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(proof, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print("PASS actual systemd teardown and retained-data comparison; purge/upgrade M0 remain NOT_RUN/NO_GO")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print("GPUPANEL_SYSTEM_UNINSTALL_CODE=blocked_or_failed; M0=NO_GO; detail="
              + type(exc).__name__ + ":" + str(exc)[:200], file=sys.stderr)
        raise SystemExit(1)
