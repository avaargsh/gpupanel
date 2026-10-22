#!/usr/bin/env python3
"""Explicit, bounded, user-only source-code migration, never a full backup.

No network, shell, follow-symlinks, runtime execution, binary assets or secrets.
The user must inspect an exact manifest digest before exporting; destination
machines inspect the ZIP SHA-256 before a no-replace directory publication.
"""
from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tempfile
import zipfile

PROJECT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
SHA = re.compile(r"^[a-f0-9]{64}$")
SAFE_PART = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$")
VERSION = 2
SCOPE = "bounded-source-no-data-or-secrets"
MAX_FILES = 256
MAX_FILE = 1024 * 1024
MAX_TOTAL = 24 * 1024 * 1024
MAX_ARCHIVE = MAX_TOTAL + 1024 * 1024
SUFFIXES = frozenset({
    ".py", ".go", ".ts", ".tsx", ".js", ".jsx", ".json", ".toml",
    ".md", ".yaml", ".yml", ".html", ".css", ".sh", ".txt",
})
EXACT = frozenset({"go.mod", "go.sum", "uv.lock", "Dockerfile", "Makefile",
                   ".gitignore", ".python-version"})
DENY_DIRS = frozenset({".git", ".venv", "venv", "node_modules", "__pycache__",
                       "dist", "build", "target", ".next", ".tox", ".mypy_cache",
                       ".pytest_cache", "data", "datasets", "models", "weights",
                       "secrets", "private", ".ssh", ".aws", ".config"})
DENY_TOKENS = ("secret", "credential", "password", "token", "private",
               "id_rsa", "id_ed25519", ".env", "apikey", "api-key", ".pem",
               ".key", ".p12", ".pfx", "wallet", "seed")
CONTENT_MARKERS = (
    b"-----BEGIN PRIVATE KEY", b"-----BEGIN OPENSSH PRIVATE KEY",
    b"-----BEGIN RSA PRIVATE KEY", b"-----BEGIN EC PRIVATE KEY",
    b"sk-proj-", b"ghp_", b"gho_", b"AKIA", b"PRIVATE_KEY=",
)

class SnapshotError(Exception):
    pass

def canonical(value: dict) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"),
                       ensure_ascii=False) + "\n").encode("utf-8")

def hash_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def safe_project_path(home: Path, name: str) -> Path:
    if not PROJECT.fullmatch(name) or not home.is_absolute():
        raise SnapshotError("unsafe project name or HOME")
    paths = (home, home / "GPUPanel", home / "GPUPanel" / "projects")
    for path in paths:
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise SnapshotError("unsafe project ancestor")
    project = paths[-1] / name
    if project.is_symlink() or (project.exists() and not project.is_dir()):
        raise SnapshotError("linked or non-directory project")
    return project

def safe_relative(rel: str) -> bool:
    path = PurePosixPath(rel)
    if (not rel or rel.startswith("/") or "\\" in rel or
            len(rel.encode()) > 400 or len(path.parts) > 12 or
            any((not SAFE_PART.fullmatch(part) and
                 not (part == path.name and part in EXACT)) or
                part in (".", "..") for part in path.parts)):
        return False
    for part in path.parts:
        low = part.lower()
        if any(word in low for word in DENY_TOKENS) or low in DENY_DIRS:
            return False
        if part.startswith(".") and part not in EXACT:
            return False
    return path.name in EXACT or path.suffix.lower() in SUFFIXES

def source_bytes(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise SnapshotError("linked or non-regular source file")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > MAX_FILE:
            raise SnapshotError("source file exceeds type/size limit")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            body = handle.read(MAX_FILE + 1)
        after = os.fstat(fd)
        if (len(body) > MAX_FILE or len(body) != info.st_size or
                (info.st_dev, info.st_ino, info.st_mtime_ns) !=
                (after.st_dev, after.st_ino, after.st_mtime_ns)):
            raise SnapshotError("source changed during read")
        if b"\x00" in body or any(marker in body for marker in CONTENT_MARKERS):
            raise SnapshotError("binary or obvious credential detected: refuse export")
        try:
            body.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise SnapshotError("only UTF-8 source text is accepted") from exc
        return body
    finally:
        os.close(fd)

def walk_source(home: Path, project: str) -> tuple[dict, dict[str, bytes], int]:
    root = safe_project_path(home, project)
    if not root.is_dir():
        raise SnapshotError("project not found")
    files: dict[str, bytes] = {}
    excluded = 0
    total = 0
    # Avoid traversing links and giant directory trees; all excluded paths are
    # reported as a COUNT, never silently described as a full backup.
    def visit(directory: Path, depth: int) -> None:
        nonlocal excluded, total
        if depth > 11:
            raise SnapshotError("directory depth limit")
        entries = sorted(directory.iterdir(), key=lambda item: item.name)
        if len(entries) > 1200:
            raise SnapshotError("directory entry count limit")
        for child in entries:
            relative = child.relative_to(root).as_posix()
            if child.is_symlink():
                raise SnapshotError("project contains a symlink; inspect it manually")
            if child.is_dir():
                if child.name.lower() in DENY_DIRS or child.name.startswith("."):
                    excluded += 1
                elif not SAFE_PART.fullmatch(child.name):
                    excluded += 1
                else:
                    visit(child, depth + 1)
            elif child.is_file():
                if not safe_relative(relative):
                    excluded += 1
                    continue
                if len(files) >= MAX_FILES:
                    raise SnapshotError("source file count limit")
                data = source_bytes(child)
                total += len(data)
                if total > MAX_TOTAL:
                    raise SnapshotError("source snapshot total size limit")
                files[relative] = data
            else:
                raise SnapshotError("special project file type refused")
    visit(root, 0)
    if not files:
        raise SnapshotError("no supported source text files found")
    manifest = {"formatVersion": VERSION, "project": project, "scope": SCOPE,
                "files": [{"path": rel, "size": len(data), "sha256": hash_bytes(data)}
                          for rel, data in sorted(files.items())]}
    return manifest, files, excluded

def plan(home: Path, project: str) -> dict:
    manifest, _, excluded = walk_source(home, project)
    return {"status": "READY_FOR_APPROVAL", "project": project,
            "scope": SCOPE, "manifestDigest": hash_bytes(canonical(manifest)),
            "files": manifest["files"], "excludedEntries": excluded,
            "executed": False}

def export(home: Path, project: str, destination: Path, approved: str) -> dict:
    manifest, files, excluded = walk_source(home, project)
    expected = hash_bytes(canonical(manifest))
    if approved != expected or not SHA.fullmatch(approved):
        return {"status": "APPROVAL_REQUIRED", "manifestDigest": expected,
                "executed": False}
    if os.geteuid() == 0:
        return {"status": "ROOT_REFUSED", "executed": False}
    if (destination.is_symlink() or destination.exists() or
            destination.parent.is_symlink() or not destination.parent.is_dir()):
        raise SnapshotError("unsafe or existing output archive")
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        with os.fdopen(fd, "w+b") as stream:
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_STORED) as zipout:
                zipout.writestr("manifest.json", canonical(manifest))
                for rel, data in sorted(files.items()):
                    zipout.writestr("src/" + rel, data)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return {"status": "EXPORTED", "project": project, "bundleDigest": hash_bytes(destination.read_bytes()),
            "files": len(files), "excludedEntries": excluded, "scope": SCOPE}

def inspect(archive_path: Path) -> tuple[dict, dict[str, bytes], str]:
    if (archive_path.is_symlink() or not archive_path.is_file() or
            archive_path.stat().st_size > MAX_ARCHIVE):
        raise SnapshotError("missing, linked or oversized ZIP")
    checksum = hash_bytes(archive_path.read_bytes())
    with zipfile.ZipFile(archive_path) as zin:
        entries = zin.infolist()
        names = [item.filename for item in entries]
        if (not 2 <= len(entries) <= MAX_FILES + 1 or
                len(names) != len(set(names)) or "manifest.json" not in names):
            raise SnapshotError("duplicate/extra entries")
        for entry in entries:
            mode = entry.external_attr >> 16
            if (entry.compress_type != zipfile.ZIP_STORED or
                    entry.flag_bits & 1 or stat.S_IFMT(mode) == stat.S_IFLNK or
                    entry.file_size > MAX_FILE or entry.is_dir()):
                raise SnapshotError("compressed/linked/oversized entry refused")
        meta = zin.getinfo("manifest.json")
        if meta.file_size > 64 * 1024:
            raise SnapshotError("oversized manifest")
        def reject_pairs(items):
            value = {}
            for key, val in items:
                if key in value:
                    raise SnapshotError("duplicate JSON property")
                value[key] = val
            return value
        manifest = json.loads(zin.read(meta), object_pairs_hook=reject_pairs)
        if (not isinstance(manifest, dict) or
                set(manifest) != {"formatVersion", "project", "scope", "files"} or
                manifest["formatVersion"] != VERSION or manifest["scope"] != SCOPE or
                not isinstance(manifest["project"], str) or
                not PROJECT.fullmatch(manifest["project"]) or
                not isinstance(manifest["files"], list)):
            raise SnapshotError("unsupported source manifest")
        expected = {"manifest.json"}
        files = {}
        total = 0
        if not 1 <= len(manifest["files"]) <= MAX_FILES:
            raise SnapshotError("empty or oversized manifest list")
        for item in manifest["files"]:
            if (not isinstance(item, dict) or set(item) != {"path", "size", "sha256"} or
                    not isinstance(item["path"], str) or not safe_relative(item["path"]) or
                    type(item["size"]) is not int or not 0 <= item["size"] <= MAX_FILE or
                    not isinstance(item["sha256"], str) or not SHA.fullmatch(item["sha256"])):
                raise SnapshotError("untrusted manifest path/hash")
            name = "src/" + item["path"]
            if name in expected or name not in names or zin.getinfo(name).file_size != item["size"]:
                raise SnapshotError("file missing or duplicated")
            expected.add(name)
            content = zin.read(name)
            if (hash_bytes(content) != item["sha256"] or b"\x00" in content or
                    any(marker in content for marker in CONTENT_MARKERS)):
                raise SnapshotError("altered or apparently sensitive source")
            try:
                content.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise SnapshotError("non-UTF8 archive source") from exc
            total += len(content)
            if total > MAX_TOTAL:
                raise SnapshotError("archive content exceeds limit")
            files[item["path"]] = content
        if set(names) != expected:
            raise SnapshotError("unreviewed ZIP entry")
    return manifest, files, checksum

def exclusive_rename(stage: Path, destination: Path) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "renameat2", None)
    if function is None:
        raise SnapshotError("Linux exclusive directory rename unavailable")
    function.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                         ctypes.c_char_p, ctypes.c_uint)
    function.restype = ctypes.c_int
    if function(-100, os.fsencode(stage), -100, os.fsencode(destination), 1) != 0:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise SnapshotError("project exists; never overwrite")
        raise OSError(code, os.strerror(code))

def restore(home: Path, archive_path: Path, approved_digest: str) -> dict:
    manifest, files, checksum = inspect(archive_path)
    if approved_digest != checksum or not SHA.fullmatch(approved_digest):
        return {"status": "APPROVAL_REQUIRED", "bundleDigest": checksum, "executed": False}
    if os.geteuid() == 0:
        return {"status": "ROOT_REFUSED", "executed": False}
    target = safe_project_path(home, manifest["project"])
    if target.exists() or target.is_symlink():
        return {"status": "CONFLICT_NO_OVERWRITE", "executed": False}
    parent = target.parent
    parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    safe_project_path(home, manifest["project"])
    with tempfile.TemporaryDirectory(prefix=".gpupanel-source-", dir=parent) as temp:
        stage = Path(temp) / "project"
        stage.mkdir(mode=0o700)
        for relative, content in sorted(files.items()):
            path = stage.joinpath(*PurePosixPath(relative).parts)
            path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
            with path.open("xb") as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
        exclusive_rename(stage, target)
    # Independent filesystem observation: no execution of restored files.
    for relative, content in files.items():
        if source_bytes(target.joinpath(*PurePosixPath(relative).parts)) != content:
            return {"status": "UNKNOWN", "project": manifest["project"],
                    "executed": True, "reconciliationRequired": True}
    return {"status": "VERIFIED", "project": manifest["project"], "files": len(files),
            "scope": SCOPE, "executed": True}

def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Bounded source-only project snapshot")
    sub = p.add_subparsers(dest="operation", required=True)
    a = sub.add_parser("plan")
    a.add_argument("project")
    b = sub.add_parser("export")
    b.add_argument("project")
    b.add_argument("destination", type=Path)
    b.add_argument("--approve-digest", default="")
    d = sub.add_parser("inspect")
    d.add_argument("archive", type=Path)
    e = sub.add_parser("restore")
    e.add_argument("archive", type=Path)
    e.add_argument("--approve-digest", default="")
    args = p.parse_args(argv)
    try:
        home = Path.home()
        if args.operation == "plan":
            result = plan(home, args.project)
        elif args.operation == "export":
            result = export(home, args.project, args.destination, args.approve_digest)
        elif args.operation == "inspect":
            manifest, _, digest = inspect(args.archive)
            result = {"status": "READY_FOR_APPROVAL", "bundleDigest": digest,
                      "project": manifest["project"], "scope": SCOPE,
                      "files": manifest["files"], "executed": False}
        else:
            result = restore(home, args.archive, args.approve_digest)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] in {"READY_FOR_APPROVAL", "EXPORTED", "VERIFIED"} else 2
    except (SnapshotError, OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "REFUSED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
