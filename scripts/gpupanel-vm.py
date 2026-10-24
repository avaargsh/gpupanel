#!/usr/bin/env python3
"""Local non-root libvirt VM lifecycle control; system scope is opt-in.

Only exact-UUID enrolled VMs may be mutated. qemu:///system needs explicit
operator adoption and libvirt/polkit authorization; this script never sudoes,
runs a shell, changes libvirt policy, erases disks, or replays unknown writes.
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
SYSTEM_URI = "qemu:///system"
SYSTEM_CONFIRM = "MANAGE qemu:///system"
READ_COMMANDS = {"uri", "list", "domname", "domstate"}


def scope_connection(system: bool) -> str:
    return SYSTEM_URI if system else URI


def scope_path(root: Path, connection: str) -> Path:
    if connection == URI:
        return root
    if connection == SYSTEM_URI:
        return root / "system"
    raise Refused("Unrecognized libvirt connection")

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


def private_dir(connection: str = URI) -> Path:
    if os.geteuid() == 0:
        raise Refused("Use a normal desktop user, not root or sudo")
    root = Path(os.environ.get("XDG_STATE_HOME") or (Path.home() / ".local/state"))
    base = root / "gpupanel/vms"
    selected = scope_path(base, connection)
    # Session and system keep disjoint UUID records and journals, never use
    # one connection's enrollment as authority on the other connection.
    for part in (root, root / "gpupanel", base, selected):
        if part.is_symlink():
            raise Refused("Refuse symbolic-link state directory")
        part.mkdir(mode=0o700, parents=True, exist_ok=True)
        st = part.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid():
            raise Refused("State directory is not owned by this user")
        if part != root:
            part.chmod(0o700)
    return selected


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
        if (st.st_uid != os.geteuid() or not stat.S_ISREG(st.st_mode)
                or st.st_mode & 0o077):
            raise Refused("VM operation lock not private")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Refused("Another VM operation is in progress") from None
        yield
    finally:
        os.close(fd)


class Virsh:
    def __init__(self, binary: str | None = None, uri: str = URI):
        if uri not in (URI, SYSTEM_URI):
            raise Refused("Unsupported libvirt connection")
        self.uri = uri
        self.binary = binary or shutil.which("virsh")
        if not self.binary:
            raise Refused("libvirt unavailable: install virsh; configure explicit local URI")

    def run(self, *args: str) -> str:
        if not args or args[0] not in READ_COMMANDS | {"start", "shutdown", "reboot", "undefine"}:
            raise Refused("Unsupported libvirt operation")
        if args[0] == "undefine" and (len(args) != 3 or args[2] != "--keep-nvram"):
            raise Refused("Only disk-preserving VM definition removal is supported")
        flags = ["--readonly"] if args[0] in READ_COMMANDS else []
        try:
            p = subprocess.run([self.binary, *flags, "--connect", self.uri, *args], capture_output=True,
                               text=True, timeout=15, check=False,
                               env={**os.environ, "LIBVIRT_DEFAULT_URI": self.uri})
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
        return {"uuid": identity, "name": name, "state": state, "connection": self.uri}

    def list(self) -> list[dict]:
        lines = self.run("list", "--all", "--uuid").splitlines()
        if len(lines) > 128:
            raise Refused("VM list exceeded local safety limit")
        return [self.detail(valid_uuid(v.strip())) for v in lines if v.strip()]


def record(root: Path, identity: str, connection: str = URI) -> dict:
    entry = json_read(root / (identity + ".json"))
    if (not entry or entry.get("uuid") != identity
            or not isinstance(entry.get("name"), str) or not entry["name"]):
        raise Refused("VM is not explicitly enrolled; run enroll first")
    if (entry.get("schema") == "gpupanel.vm.enrollment.v1"
            and connection == URI and entry.get("connection", URI) == URI):
        return entry  # Preserve established session-only records.
    if (entry.get("schema") != "gpupanel.vm.enrollment.v2"
            or entry.get("connection") != connection):
        raise Refused("VM enrollment connection mismatch; refuse mutation")
    return entry


def event(root: Path, payload: dict) -> None:
    fd = os.open(root / "operations.jsonl", os.O_CREAT | os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "a") as file:
        st = os.fstat(file.fileno())
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_mode & 0o077):
            raise Refused("Operation journal is not private")
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
        if (not stat.S_ISREG(st.st_mode) or st.st_uid != os.geteuid()
                or st.st_mode & 0o077 or st.st_size > 2_000_000):
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
    connection = getattr(virsh, "uri", URI)
    if connection not in (URI, SYSTEM_URI):
        raise Refused("Unsupported libvirt connection")
    if connection == SYSTEM_URI and args.command in ("enroll", "delete"):
        if getattr(args, "confirm_system", None) != SYSTEM_CONFIRM:
            raise Refused("Explicit system VM control confirmation required")
    if (connection == SYSTEM_URI and args.command == "reconcile"
            and not getattr(args, "acknowledge_unknown", False)):
        raise Refused("System VM recovery requires --acknowledge-unknown")
    with exclusive(root):
        if args.command == "enroll":
            if unresolved(root, identity):
                raise Refused("Previous operation on this UUID is unresolved")
            observed = virsh.detail(identity)
            if observed["name"] != args.confirm_name:
                raise Refused("Confirmation must exactly match the observed VM name")
            if (root / (identity + ".json")).exists():
                raise Refused("VM already enrolled")
            atomic_json(root / (identity + ".json"), {"schema": "gpupanel.vm.enrollment.v2",
                      "uuid": identity, "name": observed["name"], "connection": connection})
            return {**observed, "enrolled": True}
        entry = record(root, identity, connection)
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
    parser = argparse.ArgumentParser(description="Local libvirt VM control (system scope requires opt-in)")
    parser.add_argument("--system", action="store_true", help="Explicit qemu:///system mode; requires libvirt OS authorization")
    sub = parser.add_subparsers(dest="command", required=True)
    for cmd in ("doctor", "list", "show", "enroll", "start", "shutdown", "reboot", "delete", "reconcile"):
        p = sub.add_parser(cmd)
        if cmd not in ("doctor", "list"):
            p.add_argument("uuid", help="Exact libvirt UUID (names are not authority)")
        if cmd in ("enroll", "delete"):
            p.add_argument("--confirm-name", required=True, help="Exact displayed VM name")
            p.add_argument("--confirm-system", help="Required for system VM adoption/deletion: MANAGE qemu:///system")
        if cmd == "reconcile":
            p.add_argument("--acknowledge-unknown", action="store_true",
                           help="After reviewing the latest VM state, explicitly acknowledge the unresolved operation")
    args = parser.parse_args(argv)
    try:
        connection = scope_connection(args.system)
        root = private_dir(connection)
        v = Virsh(uri=connection)
        if args.command == "doctor":
            if v.run("uri") != connection:
                raise Refused("libvirt returned an unexpected connection")
            answer = {"connection": connection, "status": "available", "root": False,
                      "create": "Use Cockpit Machines or virt-manager first, then enroll by UUID"}
        else:
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
