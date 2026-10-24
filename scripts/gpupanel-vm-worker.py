#!/usr/bin/env python3
"""Same-UID Unix broker for the existing VM lifecycle CLI, never a Core grant."""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import socket
import stat
import struct
import sys
from types import SimpleNamespace

SESSION = "qemu:///session"
SYSTEM = "qemu:///system"
READ_OPS = frozenset(("list", "show"))
MUTATION_OPS = frozenset(("start", "shutdown", "reboot"))
MAX_REQUEST = 1024
MAX_RESPONSE = 65536


class Denied(Exception):
    """Expected request refusal, with no host/guest diagnostic output."""


def load_vm():
    path = Path(__file__).resolve().with_name("gpupanel-vm.py")
    spec = importlib.util.spec_from_file_location("gpupanel_vm_worker_cli", path)
    if spec is None or spec.loader is None:
        raise Denied("VM lifecycle CLI unavailable")
    vm = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vm)
    return vm


def runtime_dir(uid: int, env=None) -> Path:
    if uid == 0:
        raise Denied("Root cannot run the VM user worker")
    env = os.environ if env is None else env
    parent = Path(f"/run/user/{uid}")
    if env.get("XDG_RUNTIME_DIR") != str(parent):
        raise Denied("A trusted per-user runtime directory is required")
    try:
        info = parent.lstat()
    except OSError:
        raise Denied("User runtime directory unavailable") from None
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise Denied("Unsafe user runtime directory")
    root = parent / "gpupanel-vm"
    try:
        root.mkdir(mode=0o700)
    except FileExistsError:
        pass
    except OSError:
        raise Denied("Cannot create private VM worker directory") from None
    info = root.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise Denied("Unsafe VM worker directory")
    return root


def socket_path(root: Path, connection: str) -> Path:
    if connection == SYSTEM:
        return root / "system.sock"
    if connection == SESSION:
        return root / "session.sock"
    raise Denied("Unsupported libvirt connection")


def decode(data: bytes) -> dict:
    if len(data) > MAX_REQUEST or data.count(b"\n") != 1 or not data.endswith(b"\n"):
        raise Denied("Invalid VM request framing")
    def unique(pairs):
        obj = {}
        for key, value in pairs:
            if key in obj:
                raise ValueError("duplicate key")
            obj[key] = value
        return obj
    try:
        msg = json.loads(data[:-1].decode("utf-8"), object_pairs_hook=unique)
    except (ValueError, UnicodeError):
        raise Denied("Invalid VM JSON request") from None
    if not isinstance(msg, dict) or set(msg) != {"connection", "op", "uuid"}:
        raise Denied("Unexpected VM request fields")
    if not isinstance(msg["connection"], str) or not isinstance(msg["op"], str):
        raise Denied("Invalid VM request types")
    return msg


def dispatch(vm, connection: str, request: dict, enabled: bool):
    if request["connection"] != connection:
        raise Denied("Connection scope mismatch")
    op, vmid = request["op"], request["uuid"]
    if op not in READ_OPS | MUTATION_OPS:
        raise Denied("Operation forbidden")
    if op == "list":
        if vmid is not None:
            raise Denied("List requires no UUID")
    else:
        if not isinstance(vmid, str):
            raise Denied("VM UUID required")
        vmid = vm.valid_uuid(vmid)
    if op in MUTATION_OPS and not enabled:
        raise Denied("Worker is read-only")
    client = vm.Virsh(uri=connection)
    if op == "list":
        return client.list()
    if op == "show":
        return client.detail(vmid)
    # Existing CLI owns enrollment, UUID/URI isolation, operation locking,
    # UNKNOWN replay fencing, observed target states and libvirt policy.
    return vm.manage(client, vm.private_dir(connection),
                     SimpleNamespace(command=op, uuid=vmid,
                                     confirm_name=None, confirm_system=None,
                                     acknowledge_unknown=False))


def peer_uid(conn) -> int:
    if not hasattr(socket, "SO_PEERCRED"):
        raise Denied("Linux SO_PEERCRED unavailable")
    credentials = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i"))
    return struct.unpack("3i", credentials)[1]


def read_one(conn) -> bytes:
    conn.settimeout(5)
    data = bytearray()
    while True:
        part = conn.recv(MAX_REQUEST + 1 - len(data))
        if not part:
            raise Denied("Incomplete VM request")
        data.extend(part)
        if len(data) > MAX_REQUEST:
            raise Denied("VM request too large")
        if b"\n" in part:
            return bytes(data)


def handle(conn, uid: int, vm, connection: str, enabled: bool):
    try:
        if uid == 0 or peer_uid(conn) != uid:
            raise Denied("VM peer UID denied")
        result = dispatch(vm, connection, decode(read_one(conn)), enabled)
        payload = {"status": "OK", "data": result}
    except (Denied, vm.Refused, OSError, ValueError) as exc:
        payload = {"status": "DENIED_OR_UNKNOWN", "message":
                   str(exc) if isinstance(exc, Denied)
                   else "VM operation uncertain; inspect locally before retry"}
    encoded = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
    if len(encoded) > MAX_RESPONSE:
        encoded = b'{"status":"DENIED_OR_UNKNOWN","message":"Response too large"}\n'
    try:
        conn.sendall(encoded)
    except (OSError, socket.timeout):
        # A lost response does not mean the VM action was rolled back.
        pass


def serve(vm, connection: str, enabled: bool):
    uid = os.geteuid()
    root = runtime_dir(uid)
    path = socket_path(root, connection)
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    owned_inode = None
    try:
        # An existing socket may belong to another live worker: never steal it.
        listener.bind(str(path))
        owned_inode = path.lstat().st_ino
        os.chmod(path, 0o600)
        listener.listen(4)
        print(json.dumps({"status": "READY", "connection": connection,
                          "lifecycleEnabled": enabled}), flush=True)
        while True:
            peer, _ = listener.accept()
            with peer:
                handle(peer, uid, vm, connection, enabled)
    finally:
        listener.close()
        if owned_inode is not None:
            try:
                info = path.lstat()
                if (stat.S_ISSOCK(info.st_mode) and info.st_uid == uid
                        and info.st_ino == owned_inode):
                    path.unlink()
            except FileNotFoundError:
                pass


def call(connection: str, op: str, vmid: str | None) -> int:
    root = runtime_dir(os.geteuid())
    request = (json.dumps({"connection": connection, "op": op,
                           "uuid": vmid}, separators=(",", ":")) + "\n").encode()
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
            conn.settimeout(25)
            conn.connect(str(socket_path(root, connection)))
            conn.sendall(request)
            data = bytearray()
            while b"\n" not in data:
                block = conn.recv(MAX_RESPONSE + 1 - len(data))
                if not block or len(data) + len(block) > MAX_RESPONSE:
                    raise Denied("Incomplete VM worker response")
                data.extend(block)
            if not data.endswith(b"\n") or data.count(b"\n") != 1:
                raise Denied("Invalid VM worker response")
            result = json.loads(data)
            if not isinstance(result, dict) or result.get("status") not in ("OK", "DENIED_OR_UNKNOWN"):
                raise Denied("Invalid VM worker response")
    except (OSError, socket.timeout, ValueError):
        raise Denied("Worker unavailable or result unknown; inspect CLI journal") from None
    print(json.dumps(result, ensure_ascii=False))
    # status=OK means a command response, not confirmed guest readiness.
    return 0 if result["status"] == "OK" else 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Opt-in same-UID local VM worker; never use root")
    parser.add_argument("--system", action="store_true")
    modes = parser.add_subparsers(dest="mode", required=True)
    run = modes.add_parser("serve")
    run.add_argument("--allow-lifecycle", action="store_true")
    request = modes.add_parser("call")
    request.add_argument("op", choices=sorted(READ_OPS | MUTATION_OPS))
    request.add_argument("uuid", nargs="?")
    args = parser.parse_args(argv)
    connection = SYSTEM if args.system else SESSION
    try:
        if args.mode == "serve":
            serve(load_vm(), connection, args.allow_lifecycle)
            return 0
        if (args.op == "list") != (args.uuid is None):
            raise Denied("List requires no UUID; other operations require one UUID")
        return call(connection, args.op, args.uuid)
    except (Denied, OSError) as exc:
        print(json.dumps({"status": "DENIED_OR_UNKNOWN", "message": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
