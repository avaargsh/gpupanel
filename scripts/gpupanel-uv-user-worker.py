#!/usr/bin/env python3
"""One-shot, same-UID Unix socket for an explicitly approved offline uv intent.

Not Core/Agent RPC. It cannot impersonate another OS user or update Core.
The current desktop user launches the worker, pins two plan digests, and
grants one attempt. A crash is UNKNOWN, never implicit permission to retry.
"""
from __future__ import annotations

import argparse
import hmac
import importlib.util
import json
import os
from pathlib import Path
import secrets
import socket
import stat
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "gpupanel_user_worker_local", ROOT / "scripts/gpupanel-uv-intent-runner.py"
)
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)

SOCKET_NAME = "uv-worker.sock"
MAX_REQUEST = 1024


class WorkerError(Exception):
    pass


def checked_directory(path: Path, uid: int) -> Path:
    try:
        info = path.lstat()
    except OSError as exc:
        raise WorkerError("runtime directory is unavailable") from exc
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise WorkerError("runtime directory must be owned and private")
    return path


def worker_socket(runtime: Path, uid: int) -> Path:
    checked_directory(runtime, uid)
    subdir = runtime / "gpupanel"
    try:
        subdir.mkdir(mode=0o700)
    except FileExistsError:
        pass
    checked_directory(subdir, uid)
    return subdir / SOCKET_NAME


def authorized_peer(conn: socket.socket, uid: int) -> bool:
    try:
        credentials = conn.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12)
        _, peer_uid, _ = struct.unpack("3i", credentials)
        return peer_uid == uid and peer_uid != 0
    except (AttributeError, OSError, struct.error):
        return False


def checked_message(raw: bytes, token: str, intent_id: str) -> str:
    if len(raw) > MAX_REQUEST:
        raise WorkerError("request too large")
    try:
        obj = json.loads(raw.decode("utf-8"), object_pairs_hook=local.no_duplicates)
    except (ValueError, UnicodeError, local.IntentError) as exc:
        raise WorkerError("invalid request") from exc
    if not isinstance(obj, dict) or set(obj) != {"action", "intentId", "token"}:
        raise WorkerError("request fields not permitted")
    if obj["intentId"] != intent_id or not isinstance(obj["token"], str) or (
        not hmac.compare_digest(obj["token"], token)
    ):
        raise WorkerError("request not authorized")
    if obj["action"] not in ("inspect", "execute"):
        raise WorkerError("unsupported operation")
    return obj["action"]


def claim_attempt(home: Path, intent_id: str) -> bool:
    # Called only AFTER the same-UID/token approval gates. The user-local,
    # exclusive, fsynced marker fences replays even after worker restarts.
    journal = home / "GPUPanel" / "workspace-attempts" / (intent_id + ".json")
    try:
        local.uv.workspace.prepare_user_parents(journal, home)
        fd = os.open(journal, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    except FileExistsError:
        return False
    except (OSError, local.uv.workspace.WorkspaceError) as exc:
        raise WorkerError("unsafe attempt journal") from exc
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(json.dumps({"intentId": intent_id, "state": "UNKNOWN_UNTIL_REVIEW"},
                                 sort_keys=True).encode("ascii") + b"\n")
            out.flush()
            os.fsync(out.fileno())
        parent = os.open(journal.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    except OSError as exc:
        # Marker may already exist; NEVER delete and auto-retry an uncertain attempt.
        raise WorkerError("attempt durability uncertain; inspect journal") from exc
    return True


def dispatch(raw: bytes, token: str, plan: dict, home: Path,
             approved_plan: str, approved_uv: str, execute=local.apply) -> dict:
    action = checked_message(raw, token, plan["intentId"])
    if action == "inspect":
        return local.inspect(plan, home)
    if not claim_attempt(home, plan["intentId"]):
        return {"status": "ATTEMPT_UNKNOWN_NO_REPLAY", "coreWorkspaceState": "NotProvisioned"}
    try:
        outcome = execute(plan, home, approved_plan, approved_uv)
    except Exception:
        # The subprocess may have already published. Never reveal stderr or
        # assume no mutation from an exception/lost acknowledgement.
        return {"status": "ATTEMPT_UNKNOWN_NO_REPLAY", "coreWorkspaceState": "NotProvisioned"}
    return outcome


def serve_once(plan: dict, home: Path, runtime: Path, token: str,
               approved_plan: str, approved_uv: str, *, on_ready=None,
               execute=local.apply) -> None:
    uid = os.getuid()
    target = worker_socket(runtime, uid)
    # If the socket already exists, fail closed. Do not unlink unknown files.
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        server.settimeout(60)
        server.bind(str(target))
        os.chmod(target, 0o600)
        inode = target.lstat().st_ino
        server.listen(1)
        if on_ready:
            on_ready(target)
        try:
            conn, _ = server.accept()
        except socket.timeout:
            return
        with conn:
            conn.settimeout(10)
            try:
                if not authorized_peer(conn, uid):
                    raise WorkerError("peer OS UID rejected")
                raw = conn.recv(MAX_REQUEST + 1)
                result = dispatch(raw, token, plan, home, approved_plan, approved_uv, execute)
            except (WorkerError, OSError, local.IntentError, local.uv.ProjectError):
                result = {"status": "DENIED", "coreWorkspaceState": "NotProvisioned"}
            response = json.dumps(result, ensure_ascii=False, sort_keys=True).encode()
            # No user file content or subprocess logs are ever included.
            try:
                conn.sendall(response[:8192] + b"\n")
            except OSError:
                pass
    finally:
        server.close()
        # Only remove the same socket inode; never unlink a substituted path.
        try:
            if target.lstat().st_ino == locals().get("inode") and stat.S_ISSOCK(target.lstat().st_mode):
                target.unlink()
        except OSError:
            pass


def request_local(runtime: Path, token: str, intent_id: str, action: str) -> dict:
    if not local.canonical(intent_id) or len(token) != 64 or any(
        char not in "0123456789abcdef" for char in token
    ):
        raise WorkerError("invalid local capability")
    path = worker_socket(runtime, os.getuid())
    try:
        info = path.lstat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
            raise WorkerError("not a user-owned Unix socket")
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as conn:
            conn.settimeout(15)
            conn.connect(str(path))
            conn.sendall(json.dumps({"action": action, "intentId": intent_id,
                                     "token": token}).encode())
            data = conn.recv(8193)
            if len(data) > 8192:
                raise WorkerError("worker response too large")
            result = json.loads(data)
            if not isinstance(result, dict) or not isinstance(result.get("status"), str):
                raise WorkerError("invalid worker response")
            return result
    except (OSError, ValueError) as exc:
        raise WorkerError("local worker unavailable") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Single-attempt local user uv worker")
    parser.add_argument("--intent-file", type=Path)
    parser.add_argument("--approve-plan")
    parser.add_argument("--approve-uv")
    parser.add_argument("--request", choices=("inspect", "execute"))
    parser.add_argument("--token")
    parser.add_argument("--intent-id")
    args = parser.parse_args(argv)
    try:
        home = local.identity_home()
        if args.request:
            if not args.token or not args.intent_id:
                raise WorkerError("request needs a token and intent ID")
            result = request_local(Path(os.environ["XDG_RUNTIME_DIR"]),
                                   args.token, args.intent_id, args.request)
            print(json.dumps(result, indent=2, ensure_ascii=False))
            return 0 if result["status"] in {
                "READY_FOR_APPROVAL", "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED"
            } else 2
        if not args.intent_file or not args.approve_plan or not args.approve_uv:
            raise WorkerError("serve needs intent file and both approvals")
        plan = local.read_intent_file(args.intent_file)
        preview = local.inspect(plan, home)
        if preview["status"] != "READY_FOR_APPROVAL" or (
            args.approve_plan != plan["planDigest"] or
            args.approve_uv != preview["uvPlanDigest"]
        ):
            raise WorkerError("approval mismatch or workspace already exists")
        runtime = Path(os.environ["XDG_RUNTIME_DIR"])
        token = secrets.token_hex(32)
        # Printed only to this user's terminal. Never persisted in the journal.
        print(json.dumps({"socket": str(worker_socket(runtime, os.getuid())),
                          "token": token, "intentId": plan["intentId"]}), flush=True)
        serve_once(plan, home, runtime, token, args.approve_plan, args.approve_uv)
        return 0
    except (WorkerError, local.IntentError, KeyError, OSError,
            local.uv.ProjectError):
        print("GPUPanel: local worker denied; inspect state before any retry",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
