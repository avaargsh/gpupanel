#!/usr/bin/env python3
"""Owner-only, read-only Codex rollout inventory for manual browser import.

This deliberately does NOT claim the native session is live, authorize a Core
identity, copy prompts, or grant a Host operation. Run as the owning Linux user.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys

MAX_FILES = 2000
MAX_RETURNED = 100
MAX_FIRST_LINE = 16 * 1024
UUID = re.compile(r"^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$")
ROLL_OUT = re.compile(r"^rollout-[a-zA-Z0-9_.-]+\.jsonl$")


class InventoryUnavailable(Exception):
    pass


def owned_dir(path: Path, uid: int, *, optional: bool = False) -> bool:
    try:
        item = path.lstat()
    except FileNotFoundError:
        if optional:
            return False
        raise InventoryUnavailable("required account directory unavailable")
    if (not stat.S_ISDIR(item.st_mode) or item.st_uid != uid
            or item.st_mode & 0o022):
        raise InventoryUnavailable("unsafe or foreign-owned directory")
    return True


def first_metadata(path: Path, uid: int) -> dict | None:
    # O_NOFOLLOW + fstat fences a replaced symlink at open time.
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as handle:
            details = os.fstat(handle.fileno())
            if (not stat.S_ISREG(details.st_mode) or details.st_uid != uid
                    or details.st_size > 512 * 1024 * 1024):
                return None
            line = handle.readline(MAX_FIRST_LINE + 1)
    except (OSError, ValueError):
        return None
    if len(line) > MAX_FIRST_LINE:
        return None
    try:
        event = json.loads(line)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(event, dict) or event.get("type") != "session_meta":
        return None
    meta = event.get("payload")
    if not isinstance(meta, dict):
        return None
    session_id = meta.get("id")
    if not isinstance(session_id, str) or not UUID.fullmatch(session_id):
        return None
    when = event.get("timestamp")
    if not isinstance(when, str) or len(when) > 40:
        return None
    try:
        datetime.fromisoformat(when.replace("Z", "+00:00"))
    except ValueError:
        return None
    cwd = meta.get("cwd")
    project = "未标记项目"
    if isinstance(cwd, str) and cwd.startswith("/") and len(cwd) < 4096:
        label = Path(cwd).name
        if label and len(label) <= 80 and all(ch.isprintable() for ch in label):
            project = label
    return {
        "sessionId": session_id.lower(),
        "runtimeKind": "codex",
        "projectLabel": project,
        "startedAt": when,
        "liveness": "unknown",
    }


def scan(home: Path, uid: int) -> dict:
    owned_dir(home, uid)
    codex = home / ".codex"
    root = codex / "sessions"
    if not owned_dir(codex, uid, optional=True):
        return {"schemaVersion": 1, "source": "local-user-codex-rollouts",
                "readOnly": True, "liveStatusVerified": False, "sessions": []}
    if not owned_dir(root, uid, optional=True):
        return {"schemaVersion": 1, "source": "local-user-codex-rollouts",
                "readOnly": True, "liveStatusVerified": False, "sessions": []}

    found: list[dict] = []
    seen: set[str] = set()
    visited = 0

    def children(folder: Path) -> list[Path]:
        nonlocal visited
        result: list[Path] = []
        for child in folder.iterdir():
            visited += 1
            if visited > MAX_FILES:
                raise InventoryUnavailable("too many local rollout entries")
            result.append(child)
        return result

    try:
        for year in children(root):
            if not (year.name.isascii() and year.name.isdecimal()
                    and len(year.name) == 4):
                continue
            owned_dir(year, uid)
            for month in children(year):
                if not (len(month.name) == 2 and month.name.isascii()
                        and month.name.isdecimal() and 1 <= int(month.name) <= 12):
                    continue
                owned_dir(month, uid)
                for day in children(month):
                    if not (len(day.name) == 2 and day.name.isascii()
                            and day.name.isdecimal() and 1 <= int(day.name) <= 31):
                        continue
                    owned_dir(day, uid)
                    for path in children(day):
                        if not ROLL_OUT.fullmatch(path.name):
                            continue
                        meta = first_metadata(path, uid)
                        if not meta or meta["sessionId"] in seen:
                            continue
                        seen.add(meta["sessionId"])
                        found.append(meta)
    except OSError as exc:
        raise InventoryUnavailable("unable to inspect owned session archive") from exc
    # A rollout record never proves that a process is currently executing.
    found.sort(key=lambda item: (item["startedAt"], item["sessionId"]), reverse=True)
    return {"schemaVersion": 1, "source": "local-user-codex-rollouts",
            "readOnly": True, "liveStatusVerified": False,
            "sessions": found[:MAX_RETURNED]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local Codex sessions (read-only, not live status)")
    parser.add_argument("action", choices=["list"])
    args = parser.parse_args(argv)
    try:
        if not sys.platform.startswith("linux") or os.geteuid() == 0:
            raise InventoryUnavailable("requires a non-root Linux user")
        owner = pwd.getpwuid(os.geteuid())
        if not owner.pw_dir.startswith("/home/"):
            raise InventoryUnavailable("no supported Ubuntu account home")
        result = scan(Path(owner.pw_dir), os.geteuid())
    except (InventoryUnavailable, OSError, KeyError):
        print("GPUPanel: Codex inventory unavailable (no data exported)", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
