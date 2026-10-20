#!/usr/bin/env python3
"""Audited, offline-only uv tool distribution for GPUPanel Ubuntu Workstation.

The operator obtains the upstream archive independently, possibly through a
mirror. This code NEVER downloads or runs a remote install script. An archive
must match the SHA-256 recorded from the immutable upstream release.
"""
from __future__ import annotations
import argparse
import ctypes
import errno
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import re
import stat
import sys
import tarfile
import tempfile

VERSION = "0.13.3"
ASSET = "uv-x86_64-unknown-linux-gnu.tar.gz"
EXPECTED_SHA256 = "e4f169ec380f1793b898a6f1fcbacd22db25cf7ca0349a6e96ffb85b69998d04"
OFFICIAL_URL = f"https://releases.astral.sh/github/uv/releases/download/{VERSION}/{ASSET}"
MAX_ARCHIVE = 40 * 1024 * 1024
MAX_BINARY = 90 * 1024 * 1024
SHA = re.compile(r"^[0-9a-f]{64}$")


class ToolError(Exception):
    pass


def canonical(data: dict) -> bytes:
    return (json.dumps(data, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def paths(home: Path) -> tuple[Path, Path]:
    if home.is_symlink() or not home.is_absolute() or not home.is_dir():
        raise ToolError("unsafe HOME")
    archive = home / ".cache/gpupanel/uv" / ASSET
    dest = home / "GPUPanel/tools/uv" / VERSION
    for item in (home / ".cache", home / ".cache/gpupanel",
                 archive.parent, home / "GPUPanel", home / "GPUPanel/tools",
                 dest.parent, dest):
        if item.is_symlink() or (item.exists() and not item.is_dir()):
            raise ToolError("unsafe or linked tool directory")
    return archive, dest


def host_supported() -> bool:
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "AMD64"):
        return False
    try:
        data = dict(line.split("=", 1) for line in
                    Path("/etc/os-release").read_text().splitlines() if "=" in line)
        return data.get("ID", "").strip('"') == "ubuntu" and data.get("VERSION_ID", "").strip('"') == "24.04"
    except OSError:
        return False


def status(home: Path) -> dict:
    _, dest = paths(home)
    if not dest.exists():
        return {"status": "ABSENT", "version": VERSION, "target": str(dest), "executed": False}
    binary, receipt = dest / "bin/uv", dest / "receipt.json"
    if (not dest.is_dir() or binary.is_symlink() or receipt.is_symlink() or
            not binary.is_file() or not receipt.is_file() or
            binary.stat().st_size > MAX_BINARY or receipt.stat().st_size > 2048):
        return {"status": "MODIFIED", "target": str(dest), "executed": False}
    try:
        record = json.loads(receipt.read_text())
        if (set(record) != {"version", "asset", "archiveSHA256", "binarySHA256"} or
                record["version"] != VERSION or record["asset"] != ASSET or
                record["archiveSHA256"] != EXPECTED_SHA256 or
                not SHA.fullmatch(record["binarySHA256"]) or
                digest_file(binary) != record["binarySHA256"]):
            return {"status": "MODIFIED", "target": str(dest), "executed": False}
    except (ValueError, TypeError, OSError):
        return {"status": "MODIFIED", "target": str(dest), "executed": False}
    return {"status": "VERIFIED", "version": VERSION, "target": str(dest),
            "uv": str(binary), "executed": False}


def load_binary(archive: Path, expected_sha: str) -> bytes:
    if (archive.is_symlink() or not archive.is_file() or
            archive.stat().st_size > MAX_ARCHIVE or archive.stat().st_size < 100):
        raise ToolError("archive missing, linked or oversized")
    if digest_file(archive) != expected_sha:
        raise ToolError("archive SHA-256 does not match reviewed upstream release")
    with tarfile.open(archive, "r:gz") as handle:
        members = handle.getmembers()
        if len(members) > 32:
            raise ToolError("too many archive members")
        binary_members = []
        for member in members:
            parts = member.name.split("/")
            if (member.name.startswith("/") or any(x in ("", ".", "..") for x in parts)
                    or member.issym() or member.islnk() or member.isdev()
                    or member.size < 0 or member.size > MAX_BINARY):
                raise ToolError("unsafe archive member")
            if member.name == "uv-x86_64-unknown-linux-gnu/uv":
                if not member.isfile():
                    raise ToolError("uv binary must be a regular file")
                binary_members.append(member)
        if len(binary_members) != 1:
            raise ToolError("expected exactly one upstream uv executable")
        member = binary_members[0]
        stream = handle.extractfile(member)
        if stream is None:
            raise ToolError("uv executable unreadable")
        content = stream.read(MAX_BINARY + 1)
        if len(content) != member.size or len(content) > MAX_BINARY or not content.startswith(b"\x7fELF"):
            raise ToolError("uv executable invalid or oversized")
        return content


def plan(home: Path, *, supported: bool | None = None,
         reviewed_sha: str = EXPECTED_SHA256) -> dict:
    archive, dest = paths(home)
    supported = host_supported() if supported is None else supported
    base = {"version": VERSION, "archive": str(archive), "target": str(dest),
            "expectedSHA256": reviewed_sha, "officialURL": OFFICIAL_URL,
            "executed": False}
    if not supported:
        return {**base, "status": "UNSUPPORTED_OS"}
    if dest.exists():
        return {**base, "status": "ALREADY_PRESENT", "installed": status(home)["status"]}
    if not archive.exists():
        return {**base, "status": "MISSING_ARCHIVE"}
    try:
        binary = load_binary(archive, reviewed_sha)
    except (OSError, tarfile.TarError, ToolError):
        return {**base, "status": "UNTRUSTED_ARCHIVE"}
    receipt = {"version": VERSION, "asset": ASSET, "archiveSHA256": reviewed_sha,
               "binarySHA256": hashlib.sha256(binary).hexdigest()}
    proposed = {"target": str(dest), "version": VERSION,
                "archiveSHA256": reviewed_sha, "binarySHA256": receipt["binarySHA256"]}
    return {**base, "status": "READY_FOR_APPROVAL", "planDigest":
            hashlib.sha256(canonical(proposed)).hexdigest(), "files": ["bin/uv", "receipt.json"]}


def rename_no_replace(source: Path, target: Path) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    if not hasattr(libc, "renameat2"):
        raise ToolError("Linux exclusive rename unavailable")
    rename = libc.renameat2
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                       ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(source), -100, os.fsencode(target), 1) != 0:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise ToolError("tool version already installed; no overwrite")
        raise OSError(code, os.strerror(code))


def install(home: Path, approved: str, *, supported: bool | None = None,
            reviewed_sha: str = EXPECTED_SHA256) -> dict:
    review = plan(home, supported=supported, reviewed_sha=reviewed_sha)
    if (review["status"] != "READY_FOR_APPROVAL" or not SHA.fullmatch(approved)
            or approved != review["planDigest"]):
        return {"status": "REFUSED_PLAN_MISMATCH", "executed": False}
    if os.geteuid() == 0:
        return {"status": "ROOT_REFUSED", "executed": False}
    archive, dest = paths(home)
    binary = load_binary(archive, reviewed_sha)
    dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Revalidate the parent after mkdir, never follow an operator symlink.
    paths(home)
    with tempfile.TemporaryDirectory(prefix=".gpupanel-uv-", dir=dest.parent) as tmp:
        stage = Path(tmp) / "tool"
        (stage / "bin").mkdir(parents=True, mode=0o700)
        with (stage / "bin/uv").open("xb") as output:
            output.write(binary)
            output.flush()
            os.fsync(output.fileno())
        (stage / "bin/uv").chmod(0o700)
        record = {"version": VERSION, "asset": ASSET,
                  "archiveSHA256": reviewed_sha,
                  "binarySHA256": hashlib.sha256(binary).hexdigest()}
        with (stage / "receipt.json").open("xb") as output:
            output.write(canonical(record))
            output.flush()
            os.fsync(output.fileno())
        rename_no_replace(stage, dest)
    observed = status(home) if reviewed_sha == EXPECTED_SHA256 else {
        "status": "VERIFIED" if digest_file(dest / "bin/uv") ==
        hashlib.sha256(binary).hexdigest() else "UNKNOWN", "target": str(dest)}
    return {**observed, "executed": True}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Offline verified uv distribution")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("plan")
    sub.add_parser("status")
    install_cmd = sub.add_parser("install")
    install_cmd.add_argument("--approve-digest", default="")
    args = parser.parse_args(argv)
    try:
        home = Path.home()
        if args.command == "plan":
            result = plan(home)
        elif args.command == "status":
            result = status(home)
        else:
            result = install(home, args.approve_digest)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result["status"] in ("READY_FOR_APPROVAL", "VERIFIED", "ABSENT") else 2
    except (ToolError, OSError, ValueError, tarfile.TarError) as exc:
        print(json.dumps({"status": "REFUSED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
