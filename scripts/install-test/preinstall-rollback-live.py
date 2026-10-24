#!/usr/bin/env python3
"""Real pre-install snapshot rollback on the task-owned Ubuntu VM.

Proves a manual restore after a bounded synthetic-debris fixture only. It does
not prove installer-internal rollback, A->B->A upgrade rollback, or M0 GO.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import socket
import stat
import subprocess
import sys
import time
from pathlib import Path

import candidate
import checkpoint
import disk_handoff
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
VM = vm.STATE
BASELINE = STATE / "preinstall-baseline.json"
BOUND = STATE / "preinstall-checkpoint.json"
PROOF = STATE / "preinstall-rollback-live.json"
DEBRIS_RECEIPT = STATE / "preinstall-synthetic-debris.json"
RESTORE_INTENT = STATE / "preinstall-rollback-intent.json"
NAME_RE = re.compile(r"^checkpoint-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$")
INVENTORY_KEYS = ("containers", "networks", "volumes", "images")
GUEST_SOURCE = r'''
import hashlib, json, os, socket, subprocess
from pathlib import Path
ACTION = __ACTION__
SOURCE_SHA = __SOURCE_SHA__
EXPECTED_BINARY = json.loads(__BINARY_JSON__)
EXPECTED_BASELINE = json.loads(__BASELINE_JSON__)
MARKER = Path("/opt/gpupanel/conf/.gpupanel-ci-synthetic-install-debris")
FIXTURE_UNIT = Path("/etc/systemd/system/gpupanel-ci-synthetic-install-debris.service")

def run(args, timeout=20):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError("guest observation failed")
    return result.stdout.strip()

def unit(name, command):
    return subprocess.run(command, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, timeout=15).returncode == 0

def present(path):
    return path.exists() or path.is_symlink()

def panel_absent():
    paths = (Path("/opt/gpupanel"),
      Path("/etc/systemd/system/gpupanel-core.service"),
      Path("/etc/systemd/system/gpupanel-agent.service"),
      Path("/etc/systemd/system/multi-user.target.wants/gpupanel-core.service"),
      Path("/etc/systemd/system/multi-user.target.wants/gpupanel-agent.service"),
      Path("/usr/local/bin/pctl"), Path("/usr/local/bin/gpupanel-core"),
      Path("/usr/local/bin/gpupanel-agent"))
    return not any(present(p) for p in paths)

def port_closed(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.settimeout(.5)
        return conn.connect_ex(("127.0.0.1", port)) != 0

def inventory():
    version = run(["docker", "info", "--format", "{{.ServerVersion}}"], timeout=30)
    if not version or len(version) > 64:
        raise RuntimeError("invalid Docker version")
    return version, {
      "containers": run(["docker", "ps", "-aq", "--no-trunc"]).splitlines(),
      "networks": run(["docker", "network", "ls", "--no-trunc", "--format",
                       "{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}"]).splitlines(),
      "volumes": run(["docker", "volume", "ls", "--format", "{{.Name}}"]).splitlines(),
      "images": run(["docker", "image", "ls", "--no-trunc", "--format",
                     "{{.ID}}|{{.Repository}}|{{.Tag}}"]).splitlines(),
    }

def installed_hashes():
    hashes = {}
    for role in ("core", "agent"):
        path = Path("/opt/gpupanel") / ("gpupanel-" + role)
        if path.is_symlink() or not path.is_file():
            raise RuntimeError("installed binary is not a regular file")
        hashes[role] = hashlib.sha256(path.read_bytes()).hexdigest()
    return hashes

def active(name):
    return unit(name, ["systemctl", "is-active", "--quiet", name])

def enabled(name):
    return unit(name, ["systemctl", "is-enabled", "--quiet", name])

machine = Path("/etc/machine-id")
if machine.is_symlink() or not machine.is_file():
    raise RuntimeError("guest identity unavailable")
machine_sha = hashlib.sha256(machine.read_bytes()).hexdigest()

if ACTION == "capture":
    if not panel_absent() or not port_closed(9999):
        raise RuntimeError("pre-install panel state already exists")
    if not active("docker") or not enabled("docker"):
        raise RuntimeError("Docker is not active and enabled")
    version, rows = inventory()
    print(json.dumps({"schema":"gpupanel.vm.preinstall-guest.v1",
      "source_sha":SOURCE_SHA, "guest_machine_id_sha256":machine_sha,
      "docker_server_version":version, "docker_inventory":rows,
      "docker_active":True, "docker_enabled":True,
      "panel_runtime_absent":True, "panel_port_closed":True}, sort_keys=True))
elif ACTION == "inject":
    if EXPECTED_BINARY != installed_hashes():
        raise RuntimeError("installed candidate binaries do not match")
    if machine_sha != EXPECTED_BASELINE.get("guest_machine_id_sha256"):
        raise RuntimeError("guest identity changed")
    if not MARKER.parent.is_dir() or MARKER.parent.is_symlink():
        raise RuntimeError("synthetic-debris fixture parent unsafe")
    if not (active("gpupanel-core") and active("gpupanel-agent")) and not (
        present(MARKER) and present(FIXTURE_UNIT)
    ):
        raise RuntimeError("cannot resume synthetic-debris fixture with services stopped")
    marker_bytes = ("GPUPANEL-CI-SYNTHETIC-DEBRIS:" + SOURCE_SHA).encode("ascii")
    unit_bytes = ("[Unit]\nDescription=GPUPanel CI synthetic debris rollback fixture\n"
                  "[Service]\nType=oneshot\nExecStart=/usr/bin/true\n").encode("utf-8")
    for path, contents, mode in ((MARKER, marker_bytes, 0o600), (FIXTURE_UNIT, unit_bytes, 0o644)):
        if present(path):
            if path.is_symlink() or not path.is_file() or path.read_bytes() != contents:
                raise RuntimeError("synthetic-debris fixture conflicts with existing state")
            continue
        fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, mode)
        with os.fdopen(fd, "wb") as out:
            out.write(contents); out.flush(); os.fsync(out.fileno())
    run(["systemctl", "daemon-reload"])
    run(["systemctl", "stop", "gpupanel-agent", "gpupanel-core"], timeout=45)
    if active("gpupanel-core") or active("gpupanel-agent"):
        raise RuntimeError("panel services remained active")
    version, rows = inventory()
    print(json.dumps({"schema":"gpupanel.vm.preinstall-synthetic-debris.v1",
      "source_sha":SOURCE_SHA, "guest_machine_id_sha256":machine_sha,
      "installed_binary_sha256":installed_hashes(),
      "installed_candidate_matched":True, "synthetic_marker_present":present(MARKER),
      "synthetic_unit_present":present(FIXTURE_UNIT), "panel_services_stopped":True,
      "docker_server_version":version, "docker_inventory":rows}, sort_keys=True))
elif ACTION == "verify":
    if not panel_absent() or not port_closed(9999):
        raise RuntimeError("panel runtime or listener survived rollback")
    if present(MARKER) or present(FIXTURE_UNIT):
        raise RuntimeError("synthetic debris state survived rollback")
    if not active("docker") or not enabled("docker"):
        raise RuntimeError("Docker service state did not recover")
    version, rows = inventory()
    print(json.dumps({"schema":"gpupanel.vm.preinstall-restore.v1",
      "source_sha":SOURCE_SHA, "guest_machine_id_sha256":machine_sha,
      "docker_server_version":version, "docker_inventory":rows,
      "docker_active":True, "docker_enabled":True, "panel_runtime_absent":True,
      "panel_port_closed":True, "synthetic_marker_absent":True,
      "synthetic_unit_absent":True}, sort_keys=True))
else:
    raise RuntimeError("unsupported guest action")
'''


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_network_inventory(records: list[str]) -> list[str]:
    """Permit only default bridge ID regeneration when comparing daemon restart."""
    out, names = [], set()
    for record in records:
        if not isinstance(record, str):
            raise ValueError("malformed network record")
        fields = record.split("|")
        if len(fields) != 4 or any(not field for field in fields):
            raise ValueError("malformed network record")
        network_id, name, driver, scope = fields
        if name in names:
            raise ValueError("duplicate network name")
        names.add(name)
        if name == "bridge":
            network_id = "<docker-managed-bridge-id>"
        out.append("|".join((network_id, name, driver, scope)))
    return sorted(out)


def inventory_digests(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict) or set(raw) != set(INVENTORY_KEYS):
        raise ValueError("incomplete Docker inventory")
    out = {}
    for key in INVENTORY_KEYS:
        rows = raw[key]
        if not isinstance(rows, list) or any(not isinstance(v, str) for v in rows):
            raise ValueError("malformed Docker inventory")
        values = canonical_network_inventory(rows) if key == "networks" else sorted(rows)
        out[key] = _sha(("\n".join(values) + ("\n" if values else "")).encode())
    return out


def _valid_hash(value: object) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _valid_hash_map(value: object, keys: tuple[str, ...]) -> bool:
    return isinstance(value, dict) and set(value) == set(keys) and all(_valid_hash(value.get(k)) for k in keys)


def _write_new(path: Path, value: dict) -> None:
    if path.parent.is_symlink() or not path.parent.is_dir() or path.exists() or path.is_symlink():
        raise RuntimeError("refuse to overwrite or redirect evidence")
    fd = os.open(path, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n"); stream.flush(); os.fsync(stream.fileno())


def _read(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("required evidence unavailable")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError("evidence is not an object")
    return value


def _local() -> dict:
    if (os.environ.get("CI") != "true" or os.environ.get("GITHUB_ACTIONS") != "true"
        or os.environ.get("RUNNER_OS") != "Linux"
        or os.environ.get("GITHUB_REPOSITORY") != "avaargsh/gpupanel"):
        raise RuntimeError("canonical ephemeral CI runner required")
    sha = os.environ.get("GITHUB_SHA", "")
    local = candidate.local_candidate(ROOT)
    if not re.fullmatch(r"[0-9a-f]{40}", sha) or local["source_sha"] != sha:
        raise RuntimeError("checkout differs from exact candidate")
    return local


def _guest(action: str, local: dict, baseline: dict | None = None) -> dict:
    if action not in ("capture", "inject", "verify") or not vm.owned_pid("qemu.pid", str(VM / "disk.qcow2")):
        raise RuntimeError("task-owned live VM required")
    script = GUEST_SOURCE.replace("__ACTION__", repr(action))
    script = script.replace("__SOURCE_SHA__", repr(local["source_sha"]))
    script = script.replace("__BINARY_JSON__", repr(json.dumps(local["binary_sha256"], sort_keys=True)))
    script = script.replace("__BASELINE_JSON__", repr(json.dumps(baseline or {}, sort_keys=True)))
    command = vm.ssh_args() + [shlex.join(["sudo", "python3", "-c", script])]
    raw = subprocess.check_output(command, text=True, timeout=90)
    value = json.loads(raw)
    if not isinstance(value, dict) or value.get("source_sha") != local["source_sha"]:
        raise RuntimeError("guest response does not match candidate")
    return value


def _validate_baseline(value: dict, local: dict) -> None:
    keys = {"schema","source_sha","guest_machine_id_sha256","binary_sha256",
            "docker_server_version","docker_inventory_sha256","docker_active",
            "docker_enabled","panel_runtime_absent","panel_port_closed"}
    if (set(value) != keys or value.get("schema") != "gpupanel.vm.preinstall-baseline.v1"
        or value.get("source_sha") != local["source_sha"]
        or value.get("binary_sha256") != local["binary_sha256"]
        or not _valid_hash(value.get("guest_machine_id_sha256"))
        or not isinstance(value.get("docker_server_version"), str)
        or not _valid_hash_map(value.get("docker_inventory_sha256"), INVENTORY_KEYS)
        or any(value.get(k) is not True for k in ("docker_active","docker_enabled","panel_runtime_absent","panel_port_closed"))):
        raise RuntimeError("pre-install baseline invalid")


def capture() -> None:
    local = _local()
    observed = _guest("capture", local)
    if observed.get("schema") != "gpupanel.vm.preinstall-guest.v1" or any(
        observed.get(k) is not True for k in ("docker_active","docker_enabled","panel_runtime_absent","panel_port_closed")
    ):
        raise RuntimeError("pre-install guest state not proven")
    baseline = {"schema":"gpupanel.vm.preinstall-baseline.v1",
      "source_sha":local["source_sha"], "guest_machine_id_sha256":observed["guest_machine_id_sha256"],
      "binary_sha256":local["binary_sha256"], "docker_server_version":observed["docker_server_version"],
      "docker_inventory_sha256":inventory_digests(observed["docker_inventory"]),
      "docker_active":True, "docker_enabled":True, "panel_runtime_absent":True, "panel_port_closed":True}
    _validate_baseline(baseline, local)
    _write_new(BASELINE, baseline)
    print("G3_PREINSTALL_ROLLBACK_CODE=baseline-captured release=NO_GO")


def bind_checkpoint(name: str) -> None:
    local = _local()
    baseline = _read(BASELINE); _validate_baseline(baseline, local)
    if not NAME_RE.fullmatch(name) or vm.owned_pid("qemu.pid", str(VM / "disk.qcow2")):
        raise RuntimeError("checkpoint name invalid or guest not stopped")
    parent = VM / "checkpoints"
    if parent.is_symlink() or not parent.is_dir():
        raise RuntimeError("checkpoint directory unavailable")
    folders = [p for p in parent.iterdir() if p.is_dir() and not p.is_symlink() and p.name.startswith("checkpoint-")]
    if len(folders) != 1 or folders[0].name != name:
        raise RuntimeError("pre-install checkpoint not unique")
    manifest = checkpoint.verify_checkpoint(folders[0])
    digest = manifest.get("disk_sha256")
    if not _valid_hash(digest):
        raise RuntimeError("checkpoint digest invalid")
    _write_new(BOUND, {"schema":"gpupanel.vm.preinstall-checkpoint.v1",
      "source_sha":local["source_sha"], "checkpoint_name":name, "checkpoint_sha256":digest,
      "guest_machine_id_sha256":baseline["guest_machine_id_sha256"],
      "binary_sha256":local["binary_sha256"], "docker_server_version":baseline["docker_server_version"],
      "docker_inventory_sha256":baseline["docker_inventory_sha256"]})
    print("G3_PREINSTALL_ROLLBACK_CODE=checkpoint-bound release=NO_GO")


def _validate_checkpoint(bound: dict, baseline: dict, local: dict) -> Path:
    keys = {"schema","source_sha","checkpoint_name","checkpoint_sha256","guest_machine_id_sha256",
            "binary_sha256","docker_server_version","docker_inventory_sha256"}
    if (set(bound) != keys or bound.get("schema") != "gpupanel.vm.preinstall-checkpoint.v1"
        or bound.get("source_sha") != local["source_sha"]
        or not isinstance(bound.get("checkpoint_name"), str) or not NAME_RE.fullmatch(bound["checkpoint_name"])
        or not _valid_hash(bound.get("checkpoint_sha256"))
        or bound.get("guest_machine_id_sha256") != baseline["guest_machine_id_sha256"]
        or bound.get("binary_sha256") != local["binary_sha256"]
        or bound.get("docker_server_version") != baseline["docker_server_version"]
        or bound.get("docker_inventory_sha256") != baseline["docker_inventory_sha256"]):
        raise RuntimeError("checkpoint proof mismatch")
    folder = VM / "checkpoints" / bound["checkpoint_name"]
    if checkpoint.verify_checkpoint(folder).get("disk_sha256") != bound["checkpoint_sha256"]:
        raise RuntimeError("checkpoint bytes changed")
    return folder


def _restore_disk(folder: Path, expected_sha: str) -> str:
    def exchange() -> str:
        disk = VM / "disk.qcow2"
        previous = VM / "disk.before-ci-install-rollback.qcow2"
        partial = VM / ".restored-ci-preinstall-disk.partial"
        if vm.owned_pid("qemu.pid", str(disk)):
            raise RuntimeError("refuse restore while guest running")
        if checkpoint.verify_checkpoint(folder).get("disk_sha256") != expected_sha:
            raise RuntimeError("sealed checkpoint changed")
        source = folder / "disk.qcow2"
        if source.is_symlink() or not disk_handoff.is_regular_file(source):
            raise RuntimeError("checkpoint disk invalid")
        if disk_handoff.file_sha256(source) != expected_sha:
            raise RuntimeError("checkpoint disk digest mismatch")
        if previous.exists() and disk.exists() and not previous.is_symlink() and not disk.is_symlink():
            if disk_handoff.file_sha256(disk) == expected_sha and not os.path.samefile(disk, previous):
                disk_handoff.fsync_directory(VM)
                return expected_sha
        if partial.is_symlink():
            raise RuntimeError("restore staging path is a symlink")
        if partial.exists():
            if not disk_handoff.is_regular_file(partial):
                raise RuntimeError("restore staging path is not a regular file")
            if disk_handoff.file_sha256(partial) != expected_sha:
                partial.unlink()
        if not partial.exists():
            fd = os.open(partial, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with source.open("rb") as src, os.fdopen(fd, "wb") as dst:
                shutil.copyfileobj(src, dst, 4 * 1024 * 1024)
                dst.flush()
                os.fsync(dst.fileno())
            if disk_handoff.file_sha256(partial) != expected_sha:
                partial.unlink(missing_ok=True)
                raise RuntimeError("restored disk checksum mismatch")
        return disk_handoff.atomic_disk_handoff(disk, previous, partial, expected_sha)
    return vm.guarded_vm_change(exchange)

def _debris_receipt(local: dict, baseline: dict) -> dict:
    return {
        "schema": "gpupanel.vm.synthetic-debris-receipt.v1",
        "source_sha": local["source_sha"],
        "guest_machine_id_sha256": baseline["guest_machine_id_sha256"],
        "binary_sha256": local["binary_sha256"],
        "synthetic_marker_present": True,
        "synthetic_unit_present": True,
        "panel_services_stopped": True,
    }


def _ensure_record(path: Path, expected: dict) -> dict:
    if path.exists() or path.is_symlink():
        if _read(path) != expected:
            raise RuntimeError("existing recovery intent/evidence does not match this candidate")
    else:
        _write_new(path, expected)
    return expected


def _restore_intent(local: dict, baseline: dict, bound: dict, receipt: dict) -> dict:
    encoded = json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode("utf-8")
    expected = {
        "schema": "gpupanel.vm.preinstall-rollback-intent.v1",
        "source_sha": local["source_sha"],
        "guest_machine_id_sha256": baseline["guest_machine_id_sha256"],
        "binary_sha256": local["binary_sha256"],
        "checkpoint_sha256": bound["checkpoint_sha256"],
        "synthetic_debris_receipt_sha256": _sha(encoded),
    }
    return _ensure_record(RESTORE_INTENT, expected)


def restore() -> None:
    local = _local()
    baseline = _read(BASELINE); _validate_baseline(baseline, local)
    bound = _read(BOUND); folder = _validate_checkpoint(bound, baseline, local)
    if PROOF.exists() or PROOF.is_symlink():
        raise RuntimeError("rollback proof already exists")
    disk = VM / "disk.qcow2"
    previous = VM / "disk.before-ci-install-rollback.qcow2"
    resume_handoff = previous.exists() or previous.is_symlink() or not disk.exists()
    if resume_handoff:
        receipt = _read(DEBRIS_RECEIPT)
        if receipt != _debris_receipt(local, baseline):
            raise RuntimeError("cannot resume without matching synthetic-debris evidence")
    else:
        # An interrupted stop before disk handoff leaves the original disk present.
        if not vm.owned_pid("qemu.pid", str(disk)):
            subprocess.run(["python3", "scripts/install-test/vm.py", "start"], cwd=ROOT,
                           check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        observed = _guest("inject", local, baseline)
        if (observed.get("schema") != "gpupanel.vm.preinstall-synthetic-debris.v1"
            or observed.get("guest_machine_id_sha256") != baseline["guest_machine_id_sha256"]
            or observed.get("installed_candidate_matched") is not True
            or observed.get("installed_binary_sha256") != local["binary_sha256"]
            or observed.get("synthetic_marker_present") is not True
            or observed.get("synthetic_unit_present") is not True
            or observed.get("panel_services_stopped") is not True):
            raise RuntimeError("synthetic debris state was not proven")
        receipt = _ensure_record(DEBRIS_RECEIPT, _debris_receipt(local, baseline))
    _restore_intent(local, baseline, bound, receipt)
    subprocess.run(["python3", "scripts/install-test/vm.py", "stop"], cwd=ROOT, check=True,
                   timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    restored_sha = _restore_disk(folder, bound["checkpoint_sha256"])
    subprocess.run(["python3", "scripts/install-test/vm.py", "start"], cwd=ROOT, check=True,
                   timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    final = None
    for _ in range(35):
        try:
            final = _guest("verify", local, baseline); break
        except Exception:
            time.sleep(1)
    if not isinstance(final, dict):
        raise RuntimeError("restored guest not observable")
    if (final.get("schema") != "gpupanel.vm.preinstall-restore.v1"
        or final.get("guest_machine_id_sha256") != baseline["guest_machine_id_sha256"]
        or final.get("docker_server_version") != baseline["docker_server_version"]
        or inventory_digests(final.get("docker_inventory")) != baseline["docker_inventory_sha256"]
        or any(final.get(k) is not True for k in ("docker_active","docker_enabled","panel_runtime_absent",
                                                   "panel_port_closed","synthetic_marker_absent","synthetic_unit_absent"))):
        raise RuntimeError("restored guest differs from pre-install baseline")
    _write_new(PROOF, {"schema":"gpupanel.vm.preinstall-rollback.v1",
      "kind":"REAL TASK-OWNED UBUNTU PRE-INSTALL CHECKPOINT RESTORE AFTER SYNTHETIC DEBRIS INJECTION",
      "source_sha":local["source_sha"], "guest_machine_id_sha256":baseline["guest_machine_id_sha256"],
      "preinstall_checkpoint_sha256":bound["checkpoint_sha256"], "restored_disk_sha256":restored_sha,
      "installed_candidate_matched_before_rollback":True, "synthetic_debris_marker_injected":receipt["synthetic_marker_present"],
      "synthetic_debris_unit_injected":receipt["synthetic_unit_present"], "panel_services_stopped_before_restore":True,
      "restored_guest_rebooted_and_reobserved":True, "guest_machine_id_matches_preinstall":True,
      "docker_server_version_matches_preinstall":True, "docker_inventory_matches_preinstall":True,
      "docker_service_active_and_enabled":True, "gpupanel_runtime_paths_absent":True,
      "gpupanel_systemd_units_absent":True, "synthetic_debris_state_absent":True, "panel_port_closed":True,
      "full_upgrade_rollback_verified":False, "m0_release_decision":"NO_GO"})
    print("G3_PREINSTALL_ROLLBACK_CODE=restored-and-reobserved release=NO_GO")

def main() -> int:
    parser = argparse.ArgumentParser(description="Real disposable VM pre-install rollback proof")
    parser.add_argument("action", choices=("capture","bind-checkpoint","restore"))
    parser.add_argument("checkpoint_name", nargs="?")
    args = parser.parse_args()
    try:
        if args.action == "capture":
            if args.checkpoint_name is not None: parser.error("capture takes no checkpoint name")
            capture()
        elif args.action == "bind-checkpoint":
            if not args.checkpoint_name: parser.error("bind-checkpoint requires exact checkpoint name")
            bind_checkpoint(args.checkpoint_name)
        else:
            if args.checkpoint_name is not None: parser.error("restore takes no checkpoint name")
            restore()
        return 0
    except Exception:
        label = {"capture":"baseline-failed","bind-checkpoint":"checkpoint-failed","restore":"restore-failed"}[args.action]
        print("G3_PREINSTALL_ROLLBACK_CODE=" + label + " release=NO_GO", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
