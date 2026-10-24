#!/usr/bin/env python3
"""Local, unprivileged libvirt VM lifecycle control; no system VM authority.

Only explicitly enrolled qemu:///session domain UUIDs can be mutated.
Commands do not run a shell, escalate privileges, erase disks, or retry writes.
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time
import uuid as uuidlib

URI = "qemu:///session"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
STATES = {"running", "shut off", "paused", "in shutdown", "pmsuspended", "crashed", "idle", "blocked"}
ACTIONS = {"start": ("shut off", "start"), "shutdown": ("running", "shutdown"),
           "reboot": ("running", "reboot")}


class Refused(Exception):
    """An expected safe rejection, never include raw guest or host output."""


def valid_uuid(value: str) -> str:
    try:
        value = str(uuidlib.UUID(value))
    except (ValueError, AttributeError):
        raise Refused("Invalid VM UUID") from None
    if not UUID.fullmatch(value):
        raise Refused("Invalid VM UUID")
    return value


def private_dir() -> Path:
    if os.geteuid() == 0:
        raise Refused("Use a normal desktop user, not root or sudo")
    root = Path(os.environ.get("XDG_STATE_HOME") or (Path.home() / ".local/state"))
    # Do not follow a symlink for the final state or GPUPanel directory.
    for part in (root, root / "gpupanel", root / "gpupanel/vms"):
        if part.is_symlink():
            raise Refused("Refuse symbolic-link state directory")
        part.mkdir(mode=0o700, parents=True, exist_ok=True)
        st = part.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid():
            raise Refused("State directory is not owned by this user")
        if part != root:
            part.chmod(0o700)
    return root / "gpupanel/vms"


def json_read(path: Path) -> dict | None:
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    with os.fdopen(fd) as file:
        st = os.fstat(file.fileno())
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_mode & 0o077 or st.st_size > 4096):
            raise Refused("Invalid VM enrollment record")
        try:
            result = json.load(file)
        except (ValueError, UnicodeError):
            raise Refused("Invalid VM enrollment record") from None
    if not isinstance(result, dict):
        raise Refused("Invalid VM enrollment record")
    return result


def atomic_json(path: Path, data: dict) -> None:
    temp = path.with_name(path.name + "." + uuidlib.uuid4().hex + ".tmp")
    try:
        fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as file:
            json.dump(data, file, separators=(",", ":"))
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp, path)
        dirfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dirfd)
        finally:
            os.close(dirfd)
    finally:
        temp.unlink(missing_ok=True)


@contextlib.contextmanager
def exclusive(root: Path):
    path = root / ".lock"
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        st = os.fstat(fd)
        if st.st_uid != os.geteuid() or not stat.S_ISREG(st.st_mode):
            raise Refused("VM operation lock not owned")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refused("Another VM operation is in progress") from None
        yield
    finally:
        os.close(fd)


class Virsh:
    def __init__(self, binary: str | None = None):
        self.binary = binary or shutil.which("virsh")
        if not self.binary:
            raise Refused("libvirt unavailable: install virsh and configure qemu:///session")

    def run(self, *args: str) -> str:
        try:
            p = subprocess.run([self.binary, "--connect", URI, *args], capture_output=True,
                               text=True, timeout=15, check=False,
                               env={**os.environ, "LIBVIRT_DEFAULT_URI": URI})
        except (OSError, subprocess.TimeoutExpired):
            raise Refused("libvirt unavailable or timed out; do not retry a mutation") from None
        if p.returncode:
            # Do not leak daemon errors, VM XML, filesystem paths or credentials.
            raise Refused("libvirt refused the request; inspect locally before retry")
        return p.stdout.strip()

    def detail(self, identity: str) -> dict:
        identity = valid_uuid(identity)
        name = self.run("domname", identity)
        state = self.run("domstate", identity).lower()
        if not name or state not in STATES:
            raise Refused("Unrecognized VM identity or state")
        return {"uuid": identity, "name": name, "state": state, "connection": URI}

    def list(self) -> list[dict]:
        lines = self.run("list", "--all", "--uuid").splitlines()
        if len(lines) > 128:
            raise Refused("VM list exceeded local safety limit")
        return [self.detail(valid_uuid(v.strip())) for v in lines if v.strip()]


def record(root: Path, identity: str) -> dict:
    entry = json_read(root / (identity + ".json"))
    if (not entry or entry.get("uuid") != identity
            or not isinstance(entry.get("name"), str) or not entry["name"]
            or entry.get("schema") != "gpupanel.vm.enrollment.v1"):
        raise Refused("VM is not explicitly enrolled; run enroll first")
    return entry


def event(root: Path, payload: dict) -> None:
    fd = os.open(root / "operations.jsonl", os.O_CREAT | os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as file:
        st = os.fstat(file.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid():
            raise Refused("Operation journal is not owned")
        file.write(json.dumps(payload, separators=(",", ":")) + "\n")
        file.flush()
        os.fsync(file.fileno())


def latest_event(root: Path, identity: str) -> dict | None:
    path = root / "operations.jsonl"
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    except FileNotFoundError:
        return None
    with os.fdopen(fd) as file:
        st = os.fstat(file.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid() or st.st_size > 2_000_000:
            raise Refused("Operation journal unavailable; do not mutate")
        last = None
        try:
            for line in file:
                item = json.loads(line)
                if not isinstance(item, dict):
                    raise ValueError("bad journal item")
                if item.get("uuid") == identity:
                    last = item
        except (ValueError, AttributeError):
            raise Refused("Operation journal invalid; do not mutate") from None
    return last


def unresolved(root: Path, identity: str) -> bool:
    last = latest_event(root, identity)
    return last is not None and last.get("outcome") in ("pending", "unknown")


def manage(virsh: Virsh, root: Path, args: argparse.Namespace) -> dict:
    identity = valid_uuid(args.uuid)
    with exclusive(root):
        if args.command == "enroll":
            if unresolved(root, identity):
                raise Refused("Previous operation on this UUID is unresolved")
            observed = virsh.detail(identity)
            if observed["name"] != args.confirm_name:
                raise Refused("Confirmation must exactly match the observed VM name")
            if (root / (identity + ".json")).exists():
                raise Refused("VM already enrolled")
            atomic_json(root / (identity + ".json"), {"schema": "gpupanel.vm.enrollment.v1",
                      "uuid": identity, "name": observed["name"]})
            return {**observed, "enrolled": True}
        entry = record(root, identity)
        if args.command == "reconcile":
            if not unresolved(root, identity):
                raise Refused("No ambiguous or pending operation to reconcile")
            last = latest_event(root, identity)
            inventory = {
                valid_uuid(line.strip()) for line in
                virsh.run("list", "--all", "--uuid").splitlines() if line.strip()
            }
            if identity not in inventory:
                if last.get("op") not in ("delete", "undefine"):
                    raise Refused("VM unexpectedly absent; cannot reconcile a non-deletion")
                event(root, {"uuid": identity, "op": "reconcile",
                             "outcome": "reconciled", "at": int(time.time())})
                (root / (identity + ".json")).unlink()
                return {"uuid": identity, "outcome": "OBSERVED",
                        "note": "Definition absent in libvirt; storage preserved."}
            before = virsh.detail(identity)
            if before["name"] != entry["name"]:
                raise Refused("VM identity changed; cannot reconcile")
            event(root, {"uuid": identity, "op": "reconcile", "outcome": "reconciled",
                         "state": before["state"], "at": int(time.time())})
            return {**before, "reconciled": True}
        before = virsh.detail(identity)
        if before["name"] != entry["name"]:
            raise Refused("VM name changed since enrollment; refusing mutation")
        if unresolved(root, identity):
            raise Refused("Prior operation outcome UNKNOWN; inspect and reconcile before retry")
        if args.command == "delete":
            if before["state"] != "shut off" or args.confirm_name != before["name"]:
                raise Refused("Deletion requires a stopped VM and exact name confirmation")
            command = "undefine"
        else:
            expected, command = ACTIONS[args.command]
            if before["state"] != expected:
                raise Refused(f"{args.command} requires VM state '{expected}'")
        opid = uuidlib.uuid4().hex
        event(root, {"uuid": identity, "operation": opid, "op": args.command,
                     "outcome": "pending", "at": int(time.time())})
        try:
            if args.command == "delete":
                # Never pass --remove-all-storage, --storage, or --wipe-storage.
                virsh.run(command, identity, "--keep-nvram")
                # A successful command ACK alone is insufficient. The session
                # inventory must independently stop listing the exact UUID.
                still_present = identity in {
                    valid_uuid(line.strip())
                    for line in virsh.run("list", "--all", "--uuid").splitlines()
                    if line.strip()
                }
                if still_present:
                    event(root, {"uuid": identity, "operation": opid, "op": command,
                                 "outcome": "unknown", "at": int(time.time())})
                    return {"uuid": identity, "operationId": opid, "outcome": "UNKNOWN",
                            "note": "Definition removal unverified; reconcile manually."}
                event(root, {"uuid": identity, "operation": opid, "op": command,
                             "outcome": "observed", "at": int(time.time())})
                (root / (identity + ".json")).unlink()
                return {"uuid": identity, "operationId": opid, "outcome": "OBSERVED",
                        "note": "VM definition removed. All storage volumes were preserved."}
            virsh.run(command, identity)
            after = virsh.detail(identity)
            outcome = "observed" if (args.command != "reboot"
                                     and after["state"] != before["state"]) else "pending"
            event(root, {"uuid": identity, "operation": opid, "op": command,
                         "outcome": outcome, "at": int(time.time())})
            return {**after, "operationId": opid, "outcome": outcome.upper(),
                    "note": "ACK is not guest shutdown/boot completion; refresh status."}
        except (Refused, OSError):
            event(root, {"uuid": identity, "operation": opid, "op": command,
                         "outcome": "unknown", "at": int(time.time())})
            raise Refused("VM mutation outcome UNKNOWN; inspect and reconcile, do not retry") from None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Safe local libvirt VM control (qemu:///session only)")
    sub = parser.add_subparsers(dest="command", required=True)
    for cmd in ("doctor", "list", "show", "enroll", "start", "shutdown", "reboot", "delete", "reconcile"):
        p = sub.add_parser(cmd)
        if cmd not in ("doctor", "list"):
            p.add_argument("uuid", help="Exact libvirt UUID (names are not authority)")
        if cmd in ("enroll", "delete"):
            p.add_argument("--confirm-name", required=True, help="Exact displayed VM name")
    args = parser.parse_args(argv)
    try:
        root = private_dir()
        if args.command == "doctor":
            v = Virsh()
            v.run("uri")
            answer = {"connection": URI, "status": "available", "root": False,
                      "create": "Use Cockpit Machines or virt-manager first, then enroll by UUID"}
        else:
            v = Virsh()
            if args.command == "list":
                answer = [{**v, "enrolled": (root / (v["uuid"] + ".json")).is_file()}
                          for v in v.list()]
            elif args.command == "show":
                answer = v.detail(valid_uuid(args.uuid))
                answer["enrolled"] = (root / (answer["uuid"] + ".json")).is_file()
            else:
                answer = manage(v, root, args)
        print(json.dumps(answer, ensure_ascii=False, sort_keys=True))
        return 0
    except Refused as exc:
        print(json.dumps({"status": "REFUSED_OR_UNKNOWN", "message": str(exc)}), file=sys.stderr)
        return 1
    except OSError:
        print(json.dumps({"status": "REFUSED_OR_UNKNOWN",
                          "message": "Local VM state unavailable; do not retry a mutation"}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
