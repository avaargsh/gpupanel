#!/usr/bin/env python3
"""Restore an independently sealed *post-install* disk on a disposable VM.

No production host, remote VM, shared Docker daemon, or user workspace.
Retain the original guest disk for operator review; only the owned VM's
disk.qcow2 is swapped, with QEMU proven stopped and the lock held.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import stat
import subprocess

import candidate
import checkpoint
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
VM = vm.STATE
RESTORE_PROOF = STATE / "restore-live.json"
MARKER_NAME = "/home/ubuntu/.gpupanel-ci-restore-marker"


def controlled(args: list[str], timeout: int = 90) -> None:
    subprocess.run(args, cwd=ROOT, check=True, timeout=timeout,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def guest(script: str) -> dict:
    cmd = vm.ssh_args() + [shlex.join(["sudo", "python3", "-c", script])]
    output = subprocess.check_output(cmd, text=True, timeout=45)
    value = json.loads(output)
    if not isinstance(value, dict):
        raise RuntimeError("unexpected guest proof")
    return value


def marker_probe(action: str, source: str) -> dict:
    if action not in ("create", "damage", "inspect"):
        raise ValueError("unsupported fixture phase")
    # The only mutated path is this fixed, guest-local disposable marker.
    # Settings and binary files are read-only.
    script = """import hashlib,json,os,sqlite3,stat,subprocess
from pathlib import Path
p=Path('/home/ubuntu/.gpupanel-ci-restore-marker')
action=ACTION
source=SOURCE
expected=('GPUPANEL-CI-RESTORE:'+source).encode('ascii')
if action=='create':
    fd=os.open(p,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb') as stream:
        stream.write(expected)
elif action=='damage':
    if not p.is_file() or p.is_symlink() or p.read_bytes()!=expected:
        raise RuntimeError('marker unexpectedly altered before damage')
    p.write_bytes(b'CORRUPTED-CI-FIXTURE-ONLY')
if not p.is_file() or p.is_symlink():
    raise RuntimeError('guest restore marker missing')
settings=sqlite3.connect('file:/opt/gpupanel/db/core.db?mode=ro',uri=True)
rows=settings.execute("SELECT key,value FROM settings WHERE key IN ('UserName','SecurityEntrance') ORDER BY key").fetchall()
settings.close()
hashes={}
for name in ('core','agent'):
    path=Path('/opt/gpupanel')/('gpupanel-'+name)
    service=subprocess.check_output(['systemctl','show','gpupanel-'+name,
       '-p','MainPID','--value'],text=True,timeout=5).strip()
    if not service.isdecimal() or int(service)==0:
        raise RuntimeError('service not running after guest restore')
    running=os.stat('/proc/'+service+'/exe'); disk=os.stat(path)
    if (running.st_dev,running.st_ino)!=(disk.st_dev,disk.st_ino):
        raise RuntimeError('running service binary mismatch after restore')
    with path.open('rb') as stream:
        hashes[name]=hashlib.file_digest(stream,'sha256').hexdigest()
print(json.dumps({
  'marker_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
  'settings_sha256':hashlib.sha256(json.dumps(rows).encode()).hexdigest(),
  'guest_machine_id_sha256':hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest(),
  'binary_sha256':hashes,
}))
"""
    script = script.replace("ACTION", repr(action)).replace("SOURCE", repr(source))
    return guest(script)


def read_record(name: str) -> dict:
    path = STATE / name
    if path.is_symlink() or not path.is_file():
        raise RuntimeError("required same-candidate proof missing")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError("invalid prior acceptance proof")
    return value


def require_source() -> tuple[dict, str]:
    local = candidate.local_candidate(ROOT)
    browser = read_record("browser-live.json")
    runtime = read_record("runtime-live.json")
    compose = read_record("compose-live.json")
    candidate.verify_browser_chain(browser, local)
    machine = browser.get("guest_machine_id_sha256")
    if (
        not candidate.SHA256.fullmatch(machine if isinstance(machine, str) else "")
        or runtime.get("candidate") != local
        or runtime.get("guest_machine_id_sha256") != machine
        or runtime.get("same_candidate_live_browser_verified") is not True
        or runtime.get("explicit_fixture_operator_recovery") is not True
        or compose.get("source_sha") != local["source_sha"]
        or compose.get("guest_machine_id_sha256") != machine
        or compose.get("container_removed") is not True
        or compose.get("local_image_removed") is not True
    ):
        raise RuntimeError("prior G4/G6/offline Docker proof does not match this guest")
    if RESTORE_PROOF.exists() or RESTORE_PROOF.is_symlink():
        raise RuntimeError("restore already attempted; never overwrite its proof")
    return local, machine


def _normal(path: Path) -> bool:
    return path.exists() and stat.S_ISREG(path.lstat().st_mode) and not path.is_symlink()


def restore_sealed_disk(folder: Path) -> str:
    """Own-VM stopped, copy verified standalone checkpoint, preserve old disk."""
    def exchange() -> str:
        disk = VM / "disk.qcow2"
        original = VM / "disk.before-ci-restore.qcow2"
        partial = VM / ".restored-ci-disk.partial"
        if vm.owned_pid("qemu.pid", str(disk)):
            raise RuntimeError("refuse disk restore while QEMU is running")
        if not _normal(disk) or original.exists() or original.is_symlink() or (
            partial.exists() or partial.is_symlink()
        ):
            raise RuntimeError("disk ownership, source or destination inconsistent")
        proof = checkpoint.verify_checkpoint(folder)
        snapshot = folder / "disk.qcow2"
        expected = proof["disk_sha256"]
        with snapshot.open("rb") as incoming, partial.open("xb") as outgoing:
            shutil.copyfileobj(incoming, outgoing, 4 * 1024 * 1024)
            outgoing.flush()
            os.fsync(outgoing.fileno())
        with partial.open("rb") as restored:
            actual = hashlib.file_digest(restored, "sha256").hexdigest()
        if actual != expected or vm.owned_pid("qemu.pid", str(disk)):
            raise RuntimeError("sealed offline backup drift or QEMU restarted")
        disk.rename(original)
        partial.rename(disk)
        if not _normal(disk) or not _normal(original):
            raise RuntimeError("restoration disk lost file identity")
        return expected
    return vm.guarded_vm_change(exchange)


def wait_services() -> None:
    """Bounded real systemd readiness after reboot; never fake a PASS."""
    import time
    for _ in range(40):
        results = []
        for name in ("gpupanel-core", "gpupanel-agent"):
            cmd = vm.ssh_args() + [shlex.join(
                ["sudo", "systemctl", "is-active", "--quiet", name]
            )]
            try:
                res = subprocess.run(cmd, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL, timeout=5)
                results.append(res.returncode == 0)
            except subprocess.TimeoutExpired:
                results.append(False)
        if all(results):
            return
        time.sleep(0.5)
    raise RuntimeError("guest did not start both restored systemd services")


def main() -> None:
    if not vm.owned_pid("qemu.pid", str(VM / "disk.qcow2")):
        raise RuntimeError("task-owned real Ubuntu VM required")
    local, machine = require_source()
    before = marker_probe("create", local["source_sha"])
    if (
        before.get("binary_sha256") != local["binary_sha256"]
        or before.get("guest_machine_id_sha256") != machine
    ):
        raise RuntimeError("pre-backup running binary or guest mismatch")

    # Quiesce before snapshot, and independently verify sealed checksums.
    controlled(["python3", "scripts/install-test/vm.py", "stop"], 45)
    existing = set((VM / "checkpoints").iterdir())
    controlled(["python3", "scripts/install-test/vm.py", "checkpoint"], 900)
    added = set((VM / "checkpoints").iterdir()) - existing
    if len(added) != 1:
        raise RuntimeError("expected one unique post-install checkpoint")
    folder = added.pop()
    manifest = checkpoint.verify_checkpoint(folder)
    controlled(["python3", "scripts/install-test/vm.py", "start"], 160)
    altered = marker_probe("damage", local["source_sha"])
    if altered["marker_sha256"] == before["marker_sha256"]:
        raise RuntimeError("damage fault injection did not alter the guest marker")
    controlled(["python3", "scripts/install-test/vm.py", "stop"], 45)

    restored_sha = restore_sealed_disk(folder)
    controlled(["python3", "scripts/install-test/vm.py", "start"], 160)
    wait_services()
    after = marker_probe("inspect", local["source_sha"])
    if after != before:
        raise RuntimeError("restored guest marker, login settings or binaries differ")

    result = {
        "kind": "REAL GUEST POST-INSTALL OFFLINE SNAPSHOT RESTORE; PARTIAL G3/G6",
        "source_sha": local["source_sha"],
        "guest_machine_id_sha256": machine,
        "binary_sha256": local["binary_sha256"],
        "offline_checkpoint_sha256": manifest["disk_sha256"],
        "restored_disk_sha256": restored_sha,
        "fault_injected_marker_changed": True,
        "marker_reverted_by_disk_restore": True,
        "login_settings_digest_equal": True,
        "services_running_exact_binaries": True,
        "full_data_restore_verified": False,
        "m0_release_decision": "NO_GO",
    }
    if result["offline_checkpoint_sha256"] != result["restored_disk_sha256"]:
        raise RuntimeError("recovered disk not identical to sealed checkpoint")
    with RESTORE_PROOF.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    print("PASS real task-owned post-install disk restore and re-observation; M0 NO_GO")


if __name__ == "__main__":
    main()
