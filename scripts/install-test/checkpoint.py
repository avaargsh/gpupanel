#!/usr/bin/env python3
"""Offline-only, individually named checkpoints for the task-owned Ubuntu VM.

Not a backup of a running guest, a restoration test, or install approval.
Never delete or overwrite existing qcow2 disks, checkpoints or evidence.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
from typing import Callable

CHECKPOINT_NAME = re.compile(r"^checkpoint-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$")
SCHEMA = "gpupanel.install-test.offline-checkpoint.v1"
VIRTUAL_SIZE = 12 * 1024**3


def _regular(path: Path) -> None:
    """Use lstat so redirected paths, including dangling symlinks, fail closed."""
    if not stat.S_ISREG(path.lstat().st_mode):
        raise RuntimeError("checkpoint source is not a regular file")


def _directory(path: Path) -> None:
    if not stat.S_ISDIR(path.lstat().st_mode):
        raise RuntimeError("checkpoint directory is redirected or not a directory")


def _hash(path: Path) -> str:
    _regular(path)
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _info(path: Path, command: Callable[..., subprocess.CompletedProcess]) -> dict:
    response = command(
        ["qemu-img", "info", "--output=json", str(path)],
        check=True, capture_output=True, text=True, timeout=30,
    )
    value = json.loads(response.stdout)
    if not isinstance(value, dict) or value.get("format") != "qcow2":
        raise RuntimeError("unexpected qcow2 image format")
    if value.get("virtual-size") != VIRTUAL_SIZE:
        raise RuntimeError("unexpected VM virtual disk capacity")
    return value


def _validate_base(state: Path, cache: Path, image: str,
                   digest: str, source_url: str) -> tuple[Path, Path]:
    _directory(state)
    _directory(cache)
    overlay = state / "disk.qcow2"
    base = cache / image
    _regular(overlay)
    _regular(base)
    manifest = state / "image-provenance.json"
    _regular(manifest)
    meta = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(meta, dict) or meta.get("url") != source_url or (
        meta.get("sha256") != digest or meta.get("purpose") != "disposable-install-test"
        or meta.get("signed_checksum_verified") is not True
    ):
        raise RuntimeError("pinned VM base image provenance unavailable")
    if _hash(base) != digest:
        raise RuntimeError("pinned VM base image digest mismatch")
    return overlay, base


def verify_checkpoint(folder: Path, *, command=subprocess.run) -> dict:
    """Verify a sealed snapshot; it does not restore the guest disk."""
    if not CHECKPOINT_NAME.fullmatch(folder.name):
        raise RuntimeError("unrecognized checkpoint name")
    _directory(folder.parent)
    _directory(folder)
    meta_file = folder / "checkpoint.json"
    disk = folder / "disk.qcow2"
    _regular(meta_file)
    _regular(disk)
    record = json.loads(meta_file.read_text(encoding="utf-8"))
    if not isinstance(record, dict) or record.get("schema") != SCHEMA or (
        record.get("disk_sha256") != _hash(disk)
        or record.get("virtual_size") != VIRTUAL_SIZE
        or record.get("disk") != "disk.qcow2"
        or not isinstance(record.get("created_utc"), str)
        or not isinstance(record.get("source_image_sha256"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", record["source_image_sha256"])
    ):
        raise RuntimeError("checkpoint identity or digest mismatch")
    image_info = _info(disk, command)
    if image_info.get("backing-filename") or image_info.get("full-backing-filename"):
        raise RuntimeError("checkpoint still depends on an external backing image")
    return record


def create_checkpoint(
    state: Path, cache: Path, image: str, digest: str, source_url: str,
    *, is_running: Callable[[], bool], command=subprocess.run,
) -> Path:
    """Create a standalone qcow2 only when the owned QEMU is shut down.

    The caller must serialize this with the task's own start/stop commands.
    An externally launched QEMU is not covered by that cooperative lock.
    """
    if is_running():
        raise RuntimeError("task-owned VM is running; refuse live checkpoint")
    overlay, base = _validate_base(state, cache, image, digest, source_url)
    original = _info(overlay, command)
    backing = original.get("full-backing-filename") or original.get("backing-filename")
    if not isinstance(backing, str) or Path(backing).resolve() != base.resolve():
        raise RuntimeError("VM overlay does not reference the pinned base image")

    parent = state / "checkpoints"
    if parent.exists() or parent.is_symlink():
        _directory(parent)
    else:
        parent.mkdir(mode=0o700)
    name = "checkpoint-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + secrets.token_hex(4)
    folder = parent / name
    folder.mkdir(mode=0o700, exist_ok=False)
    disk = folder / "disk.qcow2"

    # Conversion produces a *standalone* image, unlike unsafe hardlinks or
    # a filesystem copy that could retain dependence on a moving base image.
    # A failed conversion deliberately leaves an unsealed folder for review.
    command(["qemu-img", "convert", "-O", "qcow2", str(overlay), str(disk)],
            check=True, timeout=900)
    _regular(disk)
    independent = _info(disk, command)
    if independent.get("backing-filename") or independent.get("full-backing-filename"):
        raise RuntimeError("conversion did not produce a standalone disk")
    if is_running():
        raise RuntimeError("VM started during checkpoint; refuse to seal")
    record = {
        "schema": SCHEMA,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "disk": "disk.qcow2",
        "disk_sha256": _hash(disk),
        "source_image_sha256": digest,
        "virtual_size": VIRTUAL_SIZE,
        "scope": "task-owned-disposable-ubuntu2404-offline",
        "restoration_tested": False,
        "installation_approved": False,
    }
    meta = folder / "checkpoint.json"
    fd = os.open(meta, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        json.dump(record, out, indent=2)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())
    verify_checkpoint(folder, command=command)
    return folder
