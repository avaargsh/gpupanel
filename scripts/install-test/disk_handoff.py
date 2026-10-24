"""Crash-safe atomic handoff for a task-owned disposable VM disk."""
from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path


def is_regular_file(path: Path) -> bool:
    return not path.is_symlink() and path.is_file() and stat.S_ISREG(path.lstat().st_mode)


def file_sha256(path: Path) -> str:
    if not is_regular_file(path):
        raise RuntimeError("expected an ordinary disk file")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _same_inode(left: Path, right: Path) -> bool:
    if not left.exists() or not right.exists():
        return False
    a = os.stat(left, follow_symlinks=False)
    b = os.stat(right, follow_symlinks=False)
    return (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino)


def atomic_disk_handoff(disk: Path, previous: Path, partial: Path, expected_sha: str) -> str:
    """Idempotently replace disk without ever renaming the active path away.

    The prior disk is hard-linked before the single atomic replace. Re-entry
    handles the linked-but-not-replaced state, a verified missing active path
    left by the old two-rename implementation, and a completed replace.
    """
    if len(expected_sha) != 64 or any(c not in "0123456789abcdef" for c in expected_sha):
        raise RuntimeError("restored disk digest invalid")
    if any(p.is_symlink() for p in (disk, previous, partial)):
        raise RuntimeError("refuse symlink in disk handoff")
    if previous.exists() and not is_regular_file(previous):
        raise RuntimeError("retained disk is not a regular file")
    if disk.exists() and not is_regular_file(disk):
        raise RuntimeError("active disk is not a regular file")

    linked = previous.exists() and _same_inode(disk, previous)
    if previous.exists() and disk.exists() and not linked:
        if file_sha256(disk) == expected_sha and not partial.exists():
            fsync_directory(disk.parent)
            return expected_sha
        raise RuntimeError("ambiguous disk handoff state; refuse to overwrite")

    if not is_regular_file(partial) or file_sha256(partial) != expected_sha:
        raise RuntimeError("restore image missing or digest mismatch")
    if previous.exists() and not disk.exists():
        # Recover the old two-rename intermediate state without losing the backup.
        os.replace(partial, disk)
        fsync_directory(disk.parent)
        if file_sha256(disk) != expected_sha:
            raise RuntimeError("recovered active disk digest mismatch")
        return expected_sha
    if not previous.exists():
        if not is_regular_file(disk):
            raise RuntimeError("active disk missing before disk handoff")
        os.link(disk, previous, follow_symlinks=False)
        fsync_directory(disk.parent)
    if not disk.exists() or not _same_inode(disk, previous):
        raise RuntimeError("active and retained disk identities do not match")
    os.replace(partial, disk)
    fsync_directory(disk.parent)
    if file_sha256(disk) != expected_sha or _same_inode(disk, previous):
        raise RuntimeError("atomic disk handoff failed postcondition")
    return expected_sha
