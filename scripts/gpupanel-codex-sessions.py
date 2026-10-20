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


from contextlib import contextmanager, ExitStack

DIR_FLAGS = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0)
FILE_FLAGS = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_CLOEXEC", 0)


def verify_directory(fd: int, uid: int) -> None:
    details = os.fstat(fd)
    if (not stat.S_ISDIR(details.st_mode) or details.st_uid != uid
            or details.st_mode & 0o022):
        raise InventoryUnavailable("unsafe or foreign-owned directory")


@contextmanager
def owned_directory(path: Path, uid: int):
    """Open the home directory itself without following a final symlink."""
    try:
        fd = os.open(path, DIR_FLAGS)
    except OSError as exc:
        raise InventoryUnavailable("required account directory unavailable") from exc
    try:
        verify_directory(fd, uid)
        yield fd
    finally:
        os.close(fd)


@contextmanager
def child_directory(parent_fd: int, name: str, uid: int, *, optional: bool = False):
    """Open a child relative to an already pinned directory descriptor."""
    try:
        fd = os.open(name, DIR_FLAGS, dir_fd=parent_fd)
    except FileNotFoundError:
        if optional:
            yield None
            return
        raise InventoryUnavailable("required account directory unavailable")
    except OSError as exc:
        raise InventoryUnavailable("unsafe or unavailable account directory") from exc
    try:
        verify_directory(fd, uid)
        yield fd
    finally:
        os.close(fd)


def first_metadata_at(parent_fd: int, name: str, uid: int) -> dict | None:
    # Open relative to a pinned parent directory; O_NOFOLLOW and fstat fence
    # symlinks and file replacement at the final component.
    try:
        fd = os.open(name, FILE_FLAGS, dir_fd=parent_fd)
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
    found: list[dict] = []
    seen: set[str] = set()
    visited = 0

    def children(folder_fd: int) -> list[str]:
        nonlocal visited
        try:
            names = os.listdir(folder_fd)
        except OSError as exc:
            raise InventoryUnavailable("unable to inspect owned session archive") from exc
        visited += len(names)
        if visited > MAX_FILES:
            raise InventoryUnavailable("too many local rollout entries")
        return names

    with ExitStack() as stack:
        home_fd = stack.enter_context(owned_directory(home, uid))
        codex_fd = stack.enter_context(child_directory(home_fd, ".codex", uid, optional=True))
        if codex_fd is None:
            return {"schemaVersion": 1, "source": "local-user-codex-rollouts",
                    "readOnly": True, "liveStatusVerified": False, "sessions": []}
        root_fd = stack.enter_context(child_directory(codex_fd, "sessions", uid, optional=True))
        if root_fd is None:
            return {"schemaVersion": 1, "source": "local-user-codex-rollouts",
                    "readOnly": True, "liveStatusVerified": False, "sessions": []}

        for year_name in children(root_fd):
            if not (year_name.isascii() and year_name.isdecimal() and len(year_name) == 4):
                continue
            with child_directory(root_fd, year_name, uid) as year_fd:
                for month_name in children(year_fd):
                    if not (len(month_name) == 2 and month_name.isascii()
                            and month_name.isdecimal() and 1 <= int(month_name) <= 12):
                        continue
                    with child_directory(year_fd, month_name, uid) as month_fd:
                        for day_name in children(month_fd):
                            if not (len(day_name) == 2 and day_name.isascii()
                                    and day_name.isdecimal() and 1 <= int(day_name) <= 31):
                                continue
                            with child_directory(month_fd, day_name, uid) as day_fd:
                                for name in children(day_fd):
                                    if not ROLL_OUT.fullmatch(name):
                                        continue
                                    meta = first_metadata_at(day_fd, name, uid)
                                    if not meta or meta["sessionId"] in seen:
                                        continue
                                    seen.add(meta["sessionId"])
                                    found.append(meta)

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
