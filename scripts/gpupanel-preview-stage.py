#!/usr/bin/env python3
"""Verified, unprivileged GPUPanel source-preview staging: NOT a service installer.

Only publishes the known preview archive files in a reserved user-home folder.
No Core/Agent start, systemd registration, root, Docker, network or 1Panel writes.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import stat
from pathlib import Path
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SLOT = "GPUPanel/previews"
RECEIPT = ".gpupanel-preview.json"
MEMBERS = ("bin/1panel-core", "bin/1panel-agent", "LICENSE", "NOTICE.md", "manifest.json")

def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

release = load_module("gpupanel_preview_release", ROOT / "scripts/gpupanel-release.py")
workspace = load_module("gpupanel_preview_workspace", ROOT / "scripts/gpupanel-catalog-workspace.py")


class PreviewError(Exception):
    pass


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def target_for(version: str, home: Path) -> Path:
    if not isinstance(version, str) or not release.NAME_RE.fullmatch(version):
        raise PreviewError("invalid preview version")
    base = home / SLOT
    dst = base / ("source-" + version)
    try:
        return workspace.safe_target(dst, home)
    except workspace.WorkspaceError as exc:
        raise PreviewError(str(exc)) from exc


def preview_plan(archive: Path, home: Path) -> dict:
    # Verifies self-contained archive integrity only, not publisher provenance.
    report = release.verify(archive)
    dst = target_for(report["version"], home)
    return {"status": "APPROVAL_REQUIRED", "version": report["version"],
            "archiveSha256": report["sha256"], "target": str(dst),
            "sourceArchiveIntegrity": True, "publisherSignatureVerified": False,
            "systemServiceInstalled": False, "startupAllowed": False,
            "steps": ["Verify preview archive", "Explicit approval", "Stage files only", "Observe receipt"],
            "executed": False}


def inspect(version: str, home: Path) -> dict:
    target = target_for(version, home)
    base = {"version": version, "target": str(target), "systemServiceInstalled": False}
    if not target.exists() and not target.is_symlink():
        return {**base, "status": "ABSENT"}
    if target.is_symlink() or not target.is_dir():
        return {**base, "status": "DRIFT", "reason": "unsafe target"}
    receipt_file = target / RECEIPT
    if receipt_file.is_symlink() or not receipt_file.is_file():
        return {**base, "status": "UNMANAGED", "reason": "missing owned receipt"}
    try:
        if receipt_file.stat().st_mode & 0o777 != 0o600:
            return {**base, "status": "DRIFT", "reason": "receipt permission changed"}
        record = json.loads(receipt_file.read_text(encoding="utf-8"))
        expected = record["files"]
        if (record.get("formatVersion") != 1 or record.get("version") != version
                or record.get("serviceInstalled") is not False
                or not isinstance(expected, dict) or set(expected) != set(MEMBERS)
                or any(not isinstance(value, str) or len(value) != 64 for value in expected.values())):
            raise ValueError("invalid receipt")
        if not all(isinstance(x, str) for x in expected):
            raise ValueError("invalid paths")
        present = {str(p.relative_to(target)) for p in target.rglob("*")}
        if present != set(MEMBERS) | {"bin", RECEIPT}:
            return {**base, "status": "DRIFT", "reason": "unexpected or missing files"}
        for name in MEMBERS:
            path = target / name
            if path.is_symlink() or not path.is_file():
                return {**base, "status": "DRIFT", "reason": "file changed: " + name}
            if path.stat().st_mode & 0o777 != 0o600:
                return {**base, "status": "DRIFT", "reason": "unsafe file permission: " + name}
            if digest(path.read_bytes()) != expected[name]:
                return {**base, "status": "DRIFT", "reason": "file changed: " + name}
        manifest = json.loads((target / "manifest.json").read_bytes())
        if (manifest.get("product") != "GPUPanel"
                or manifest.get("version") != version
                or manifest.get("status") != "source-preview-not-installable"):
            raise ValueError("manifest differs from preview contract")
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        return {**base, "status": "DRIFT", "reason": "invalid receipt or manifest"}
    return {**base, "status": "STAGED", "verified": True,
            "sourceArchiveSha256": record.get("archiveSha256"),
            "publisherSignatureVerified": False}


def stage(archive: Path, home: Path, approved: bool) -> dict:
    plan = preview_plan(archive, home)
    if not approved:
        return plan
    if os.geteuid() == 0:
        raise PreviewError("refuse root: source preview staging must run as a normal user")
    dst = target_for(plan["version"], home)
    if dst.exists() or dst.is_symlink():
        raise PreviewError("destination already exists: never overwrite a staged preview")
    try:
        workspace.prepare_user_parents(dst, home)
        with tempfile.TemporaryDirectory(prefix=".gpupanel-preview-stage-", dir=dst.parent) as tmp:
            pending = Path(tmp)
            # Snapshot the source into a private staging dir. Verification of the
            # source path is NOT authority to later re-open that mutable path.
            snapshot = pending / ".source-snapshot.tar.gz"
            fd = os.open(archive, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            with os.fdopen(fd, "rb") as source, snapshot.open("xb") as frozen:
                if not stat.S_ISREG(os.fstat(source.fileno()).st_mode):
                    raise PreviewError("source archive must be a regular file")
                count = 0
                while True:
                    chunk = source.read(1024 * 1024)
                    if not chunk:
                        break
                    count += len(chunk)
                    if count > release.MAX_ARCHIVE_BYTES:
                        raise PreviewError("source snapshot exceeds archive size limit")
                    frozen.write(chunk)
                frozen.flush()
                os.fsync(frozen.fileno())
            snapshot_report = release.verify(snapshot)
            if (snapshot_report["sha256"] != plan["archiveSha256"]
                    or snapshot_report["version"] != plan["version"]):
                raise PreviewError("source archive changed between plan and staging")
            (pending / "bin").mkdir(mode=0o700)
            contents = {}
            with tarfile.open(snapshot, "r:gz") as tar:
                for name in MEMBERS:
                    stream = tar.extractfile("gpupanel/" + name)
                    if stream is None:
                        raise PreviewError("verified archive member became unreadable")
                    data = stream.read()
                    contents[name] = data
                    path = pending / name
                    with path.open("xb") as output:
                        output.write(data)
                        output.flush()
                        os.fsync(output.fileno())
                    # Source-preview binaries are deliberately non-executable.
                    path.chmod(0o600)
            snapshot.unlink()
            record = {"formatVersion": 1, "version": plan["version"],
                      "archiveSha256": plan["archiveSha256"], "serviceInstalled": False,
                      "files": {name: digest(data) for name, data in contents.items()}}
            receipt_path = pending / RECEIPT
            receipt_path.write_text(json.dumps(record, sort_keys=True, indent=2) + "\n", encoding="utf-8")
            receipt_path.chmod(0o600)
            workspace.rename_exclusive(pending, dst)
    except (workspace.WorkspaceError, OSError, tarfile.TarError) as exc:
        raise PreviewError("preview staging failed without overwriting existing installation: " + str(exc)) from exc
    result = inspect(plan["version"], home)
    if result["status"] != "STAGED":
        raise PreviewError("files were staged but outcome verification failed; inspect without deleting")
    return result


def remove(version: str, home: Path, approved: bool) -> dict:
    result = inspect(version, home)
    if result["status"] != "STAGED":
        raise PreviewError("removal refused: preview does not match its managed receipt")
    if not approved:
        return {**result, "status": "APPROVAL_REQUIRED", "executed": False}
    if os.geteuid() == 0:
        raise PreviewError("refuse root")
    dst = target_for(version, home)
    # Do not recursively delete arbitrary user data. Revalidate known files.
    for name in MEMBERS:
        path = dst / name
        if path.is_symlink() or not path.is_file():
            raise PreviewError("removal refused: unexpected filesystem mutation")
    if {str(p.relative_to(dst)) for p in dst.rglob("*")} != set(MEMBERS) | {"bin", RECEIPT}:
        raise PreviewError("removal refused: unexpected files")
    for name in MEMBERS:
        (dst / name).unlink()
    (dst / RECEIPT).unlink()
    (dst / "bin").rmdir()
    dst.rmdir()
    return {"status": "ABSENT", "version": version, "target": str(dst),
            "systemServiceInstalled": False, "removed": True}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel source preview staging (never installs services)")
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("plan", "stage"):
        cmd = sub.add_parser(name)
        cmd.add_argument("archive", type=Path)
        if name == "stage":
            cmd.add_argument("--approve", action="store_true")
    sub.add_parser("status").add_argument("version")
    cmd = sub.add_parser("remove")
    cmd.add_argument("version")
    cmd.add_argument("--approve", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not sys.platform.startswith("linux"):
            raise PreviewError("preview staging supports Linux only")
        if os.geteuid() == 0:
            raise PreviewError("do not run preview staging as root")
        home = Path.home()
        if args.action == "plan":
            result = preview_plan(args.archive, home)
        elif args.action == "stage":
            result = stage(args.archive, home, args.approve)
        elif args.action == "status":
            result = inspect(args.version, home)
        else:
            result = remove(args.version, home, args.approve)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] in {"STAGED", "ABSENT"} else 2
    except (PreviewError, workspace.WorkspaceError, release.ReleaseError, OSError, ValueError,
            tarfile.TarError) as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
