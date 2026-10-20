#!/usr/bin/env python3
"""Portable, bounded project scaffold snapshot for an Ubuntu user (no shell/runtime).

Only a reviewed allowlist of lock/manifests and one small entrypoint is exported.
Does NOT back up arbitrary source trees, credentials, runtime data or IDE state.
"""
from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import zipfile

PROJECT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
DIGEST = re.compile(r"^[0-9a-f]{64}$")
ALLOWED = (
    "README.md", "main.py", "pyproject.toml", "uv.lock", ".python-version",
    "package.json", "pnpm-lock.yaml", "package-lock.json",
    "go.mod", "go.sum", ".devcontainer/devcontainer.json",
    ".vscode/extensions.json",
)
MAX_FILE = 2 * 1024 * 1024
MAX_TOTAL = 10 * 1024 * 1024
SECRET_TOKENS = (b"-----BEGIN PRIVATE KEY", b"-----BEGIN OPENSSH PRIVATE KEY",
                 b"-----BEGIN RSA PRIVATE KEY", b"sk-proj-", b"ghp_")
VERSION = 1


class BundleError(Exception):
    pass


def sha(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def canonical(obj) -> bytes:
    return (json.dumps(obj, sort_keys=True, ensure_ascii=False,
                       separators=(",", ":")) + "\n").encode("utf-8")


def root_for(home: Path) -> Path:
    if home.is_symlink() or not home.is_dir():
        raise BundleError("unsafe home")
    parent = home / "GPUPanel"
    root = parent / "projects"
    for part in (parent, root):
        if part.is_symlink() or (part.exists() and not part.is_dir()):
            raise BundleError("unsafe project parent")
    return root


def project_dir(home: Path, name: str) -> Path:
    if not PROJECT.fullmatch(name):
        raise BundleError("project name must be a simple basename")
    root = root_for(home)
    path = root / name
    if path.is_symlink():
        raise BundleError("project link refused")
    return path


def checked_file(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise BundleError("linked/non-file input")
    info = path.stat()
    if info.st_size > MAX_FILE:
        raise BundleError("input file too large")
    data = path.read_bytes()
    if len(data) > MAX_FILE or any(marker in data for marker in SECRET_TOKENS):
        raise BundleError("oversized or obviously sensitive file")
    return data


def snapshot(home: Path, name: str) -> tuple[dict, dict[str, bytes]]:
    source = project_dir(home, name)
    if not source.is_dir():
        raise BundleError("project directory not found")
    files = {}
    for relative in ALLOWED:
        path = source / relative
        if path.is_symlink():
            raise BundleError("linked input refused")
        if path.exists():
            for parent in path.parents:
                if parent == source:
                    break
                if parent.is_symlink():
                    raise BundleError("linked parent refused")
            files[relative] = checked_file(path)
    if not files:
        raise BundleError("no allowlisted project files found")
    if sum(map(len, files.values())) > MAX_TOTAL:
        raise BundleError("snapshot exceeds bounded size")
    manifest = {"formatVersion": VERSION, "project": name, "scope": "scaffold-only",
                "files": [{"path": name, "size": len(data), "sha256": sha(data)}
                          for name, data in sorted(files.items())]}
    return manifest, files


def export(home: Path, name: str, destination: Path) -> dict:
    manifest, files = snapshot(home, name)
    if destination.is_symlink() or destination.exists() or destination.parent.is_symlink():
        raise BundleError("bundle destination already exists or is linked")
    if not destination.parent.is_dir():
        raise BundleError("bundle destination parent is absent")
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        with os.fdopen(fd, "w+b") as target:
            with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
                archive.writestr("manifest.json", canonical(manifest))
                for rel, data in sorted(files.items()):
                    archive.writestr("files/" + rel, data)
            target.flush()
            os.fsync(target.fileno())
    except Exception:
        # This file was created by us exclusively. Avoid leaving an ambiguous archive.
        destination.unlink(missing_ok=True)
        raise
    return {"status": "EXPORTED", "bundleDigest": sha(destination.read_bytes()),
            "project": name, "files": len(files), "scope": "scaffold-only"}


def read_bundle(archive_path: Path) -> tuple[dict, dict[str, bytes], str]:
    if archive_path.is_symlink() or not archive_path.is_file() or archive_path.stat().st_size > MAX_TOTAL + 64 * 1024:
        raise BundleError("bundle missing, linked or oversized")
    raw_digest = sha(archive_path.read_bytes())
    with zipfile.ZipFile(archive_path) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries]
        if len(names) != len(set(names)) or not 2 <= len(entries) <= len(ALLOWED) + 1:
            raise BundleError("bundle entries invalid")
        for item in entries:
            mode = (item.external_attr >> 16)
            if stat.S_IFMT(mode) == stat.S_IFLNK or item.file_size > MAX_FILE:
                raise BundleError("linked or oversized bundle file")
        if "manifest.json" not in names or archive.getinfo("manifest.json").file_size > 16 * 1024:
            raise BundleError("bundle manifest unavailable")
        manifest = json.loads(archive.read("manifest.json"))
        if (not isinstance(manifest, dict) or
                set(manifest) != {"formatVersion", "project", "scope", "files"} or
                manifest["formatVersion"] != VERSION or manifest["scope"] != "scaffold-only" or
                not isinstance(manifest["project"], str) or
                not PROJECT.fullmatch(manifest["project"]) or
                not isinstance(manifest["files"], list)):
            raise BundleError("unsupported manifest")
        expected = {"manifest.json"}
        files = {}
        for record in manifest["files"]:
            if (not isinstance(record, dict) or set(record) != {"path", "size", "sha256"} or
                    record["path"] not in ALLOWED or
                    type(record["size"]) is not int or not 0 <= record["size"] <= MAX_FILE or
                    not isinstance(record["sha256"], str) or
                    not DIGEST.fullmatch(record["sha256"])):
                raise BundleError("invalid file record")
            name = "files/" + record["path"]
            if name in expected:
                raise BundleError("duplicate file record")
            expected.add(name)
            if name not in names or archive.getinfo(name).file_size != record["size"]:
                raise BundleError("missing or mismatched file")
            data = archive.read(name)
            if sha(data) != record["sha256"] or any(token in data for token in SECRET_TOKENS):
                raise BundleError("corrupted or sensitive input")
            files[record["path"]] = data
        if not files or expected != set(names) or sum(map(len, files.values())) > MAX_TOTAL:
            raise BundleError("unexpected bundle contents")
    return manifest, files, raw_digest


def exclusive_rename(stage: Path, target: Path) -> None:
    """Linux renameat2 RENAME_NOREPLACE: never replace a pre-existing directory."""
    libc = ctypes.CDLL(None, use_errno=True)
    rename = getattr(libc, "renameat2", None)
    if rename is None:
        raise BundleError("exclusive Linux rename unavailable")
    rename.argtypes = (ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                       ctypes.c_char_p, ctypes.c_uint)
    rename.restype = ctypes.c_int
    if rename(-100, os.fsencode(stage), -100, os.fsencode(target), 1) != 0:
        code = ctypes.get_errno()
        if code in (errno.EEXIST, errno.ENOTEMPTY):
            raise BundleError("target exists; refusing overwrite")
        raise OSError(code, os.strerror(code))


def restore(home: Path, bundle: Path, approval: str) -> dict:
    manifest, files, bundle_digest = read_bundle(bundle)
    if approval != bundle_digest:
        return {"status": "APPROVAL_REQUIRED", "bundleDigest": bundle_digest,
                "project": manifest["project"], "executed": False}
    if os.geteuid() == 0:
        return {"status": "ROOT_REFUSED", "executed": False}
    target = project_dir(home, manifest["project"])
    if target.exists() or target.is_symlink():
        return {"status": "CONFLICT_NO_OVERWRITE", "executed": False}
    root = root_for(home)
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    if root.is_symlink():
        raise BundleError("linked restore root")
    with tempfile.TemporaryDirectory(dir=root, prefix=".gpupanel-restore-") as tmp:
        stage = Path(tmp) / "project"
        stage.mkdir(mode=0o700)
        for rel, content in files.items():
            path = stage / rel
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            with path.open("xb") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
        # Only publish after staging all verified content.
        exclusive_rename(stage, target)
    verified, _ = snapshot(home, manifest["project"])
    return {"status": "VERIFIED" if verified == manifest else "UNKNOWN",
            "project": manifest["project"], "files": len(files), "executed": True}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Offline bounded scaffold bundle")
    sub = parser.add_subparsers(dest="command", required=True)
    ex = sub.add_parser("export")
    ex.add_argument("project")
    ex.add_argument("destination", type=Path)
    inspect = sub.add_parser("inspect")
    inspect.add_argument("bundle", type=Path)
    imp = sub.add_parser("restore")
    imp.add_argument("bundle", type=Path)
    imp.add_argument("--approve-digest", default="")
    args = parser.parse_args(argv)
    try:
        if args.command == "export":
            result = export(Path.home(), args.project, args.destination)
        elif args.command == "inspect":
            manifest, _, digest = read_bundle(args.bundle)
            result = {"status": "READY_FOR_APPROVAL", "bundleDigest": digest,
                      "project": manifest["project"], "scope": manifest["scope"],
                      "files": manifest["files"], "executed": False}
        else:
            result = restore(Path.home(), args.bundle, args.approve_digest)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0 if result["status"] in {"EXPORTED", "READY_FOR_APPROVAL", "VERIFIED"} else 2
    except (BundleError, OSError, ValueError, KeyError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "REFUSED", "reason": str(exc)}, ensure_ascii=False),
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
