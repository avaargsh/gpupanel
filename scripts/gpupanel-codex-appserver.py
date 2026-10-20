#!/usr/bin/env python3
"""Read-only *RPC* snapshot from a new same-UID Codex app-server process.

This is a manual, user-operated probe, NOT a remote Host API, live attachment
to an existing Codex process, or authority to act on a native Thread.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import pwd
import re
import select
import shutil
import signal
import stat
import subprocess
import sys
import time

MAX_WIRE_BYTES = 512 * 1024
MAX_THREADS = 25
TIMEOUT_SECONDS = 12
THREAD_ID = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
ALLOWED_STATUSES = {"notLoaded", "idle", "active", "systemError"}


class ProbeUnavailable(Exception):
    pass


def require_local_user() -> None:
    if not sys.platform.startswith("linux") or os.geteuid() == 0 or os.getuid() != os.geteuid():
        raise ProbeUnavailable("requires a normal Linux login user")
    account = pwd.getpwuid(os.geteuid())
    home = Path(account.pw_dir)
    if home != Path("/home") / account.pw_name or os.environ.get("HOME") != str(home):
        raise ProbeUnavailable("unsupported or mismatched user home")
    info = home.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or info.st_mode & 0o022:
        raise ProbeUnavailable("unsafe home directory")
    # A separately configured CODEX_HOME is intentionally not inferred from
    # browser/Core identity; user explicitly owns the invoked Codex process.


class RpcClient:
    def __init__(self, proc: subprocess.Popen[bytes]):
        self.proc = proc
        self.buffer = bytearray()
        self.total_bytes = 0
        self.deadline = time.monotonic() + TIMEOUT_SECONDS

    def send(self, frame: dict) -> None:
        assert self.proc.stdin is not None
        data = json.dumps(frame, separators=(",", ":")).encode("utf-8") + b"\n"
        self.proc.stdin.write(data)
        self.proc.stdin.flush()

    def receive(self, expected_id: int) -> dict:
        assert self.proc.stdout is not None
        while True:
            idx = self.buffer.find(b"\n")
            if idx >= 0:
                raw = bytes(self.buffer[:idx])
                del self.buffer[:idx + 1]
                try:
                    frame = json.loads(raw)
                except (ValueError, UnicodeDecodeError) as exc:
                    raise ProbeUnavailable("bad RPC frame") from exc
                if not isinstance(frame, dict):
                    raise ProbeUnavailable("invalid RPC result")
                if "method" in frame:
                    # Never answer unsolicited server-to-client requests or approvals.
                    continue
                if frame.get("id") != expected_id or "error" in frame:
                    raise ProbeUnavailable("native RPC rejected or mismatched")
                if not isinstance(frame.get("result"), dict):
                    raise ProbeUnavailable("native RPC response unavailable")
                return frame["result"]
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise ProbeUnavailable("native RPC timed out")
            ready, _, _ = select.select([self.proc.stdout], [], [], remaining)
            if not ready:
                raise ProbeUnavailable("native RPC timed out")
            chunk = os.read(self.proc.stdout.fileno(), 8192)
            if not chunk:
                raise ProbeUnavailable("native RPC closed unexpectedly")
            self.total_bytes += len(chunk)
            if self.total_bytes > MAX_WIRE_BYTES:
                raise ProbeUnavailable("native RPC response exceeds bounded budget")
            self.buffer.extend(chunk)


def project_threads(result: dict) -> dict:
    data = result.get("data")
    if not isinstance(data, list) or len(data) > MAX_THREADS:
        raise ProbeUnavailable("unexpected thread page")
    cursor = result.get("nextCursor")
    if cursor is not None and (not isinstance(cursor, str) or not 0 < len(cursor) <= 4096):
        raise ProbeUnavailable("invalid page cursor")
    threads: list[dict] = []
    seen: set[str] = set()
    for item in data:
        if not isinstance(item, dict):
            raise ProbeUnavailable("invalid native thread")
        identifier = item.get("id")
        created = item.get("createdAt")
        status = item.get("status")
        if (not isinstance(identifier, str) or not THREAD_ID.fullmatch(identifier)
                or identifier in seen or isinstance(created, bool)
                or not isinstance(created, (int, float)) or not 946684800 <= created <= 4102444800
                or not isinstance(status, dict)
                or status.get("type") not in ALLOWED_STATUSES):
            raise ProbeUnavailable("invalid native thread identity/status")
        seen.add(identifier)
        label = "未标记项目"
        cwd = item.get("cwd")
        if isinstance(cwd, str) and cwd.startswith("/") and len(cwd) <= 4096:
            candidate = Path(cwd).name
            if (0 < len(candidate) <= 80 and all(ch.isprintable() for ch in candidate)
                    and "/" not in candidate and "\\" not in candidate):
                label = candidate
        threads.append({
            "sessionId": identifier, "runtimeKind": "codex", "projectLabel": label,
            "startedAt": datetime.fromtimestamp(created, timezone.utc).isoformat().replace("+00:00", "Z"),
            "liveness": "unknown",
            "observerStatus": status["type"],
        })
    return {
        "schemaVersion": 2, "source": "local-user-codex-appserver",
        "readOnly": True, "liveStatusVerified": False,
        "observerScope": "new-app-server-process",
        "hasMore": cursor is not None,
        "sessions": threads,
    }


def probe(command: list[str]) -> dict:
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        client = RpcClient(proc)
        client.send({"id": 1, "method": "initialize", "params": {
            "clientInfo": {"name": "gpupanel_local_observer",
                           "title": "GPUPanel Local Observer", "version": "0.1.0"},
        }})
        client.receive(1)
        client.send({"method": "initialized", "params": {}})
        # DB-only refuses instead of falling back to scan-and-repair. No
        # thread/start, thread/resume, turn/start, read-state update or approval.
        client.send({"id": 2, "method": "thread/list", "params": {
            "limit": MAX_THREADS, "sortKey": "created_at", "useStateDbOnly": True,
        }})
        return project_threads(client.receive(2))
    finally:
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=2)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                if proc.poll() is None:
                    os.killpg(proc.pid, signal.SIGKILL)
                    proc.wait(timeout=2)
        for stream in (proc.stdin, proc.stdout):
            if stream:
                stream.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Bounded same-user Codex app-server RPC snapshot")
    parser.add_argument("action", choices=["list"])
    parser.parse_args(argv)
    try:
        require_local_user()
        binary = shutil.which("codex")
        if not binary:
            raise ProbeUnavailable("Codex binary missing")
        result = probe([binary, "app-server", "--listen", "stdio://"])
    except (ProbeUnavailable, OSError, ValueError, subprocess.SubprocessError):
        print("GPUPanel: app-server probe unavailable; no snapshot exported", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
