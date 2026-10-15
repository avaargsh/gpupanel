#!/usr/bin/env python3
"""GPUPanel source release: build/pack/verify without installing host services.

The output is a development artifact, NOT an installable or supported release.
Keeps inherited 1Panel runtime paths and API/module contracts unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$")
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
REQUIRED = ("bin/1panel-core", "bin/1panel-agent", "LICENSE", "NOTICE.md")
WEB_REQUIRED = ("index.html", "assets")


class ReleaseError(Exception):
    pass


def digest_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def checked_run(args: list[str], cwd: Path, env: dict | None = None) -> None:
    try:
        subprocess.run(args, cwd=cwd, env=env, check=True, timeout=1800)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ReleaseError("command failed: " + " ".join(args[:3]) + ": " + str(exc)) from exc


def source_revision(root: Path) -> str:
    try:
        value = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root,
                                        timeout=10, stderr=subprocess.DEVNULL, text=True).strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        value = "unknown"
    return value


def validate_web(root: Path) -> dict[str, str]:
    web = root / "core" / "cmd" / "server" / "web"
    html = web / "index.html"
    assets = web / "assets"
    if not html.is_file() or not assets.is_dir():
        raise ReleaseError("frontend assets missing: run npm ci and npm run build:pro before Go build")
    if html.stat().st_size < 100:
        raise ReleaseError("frontend index.html is unexpectedly small")
    if not any(p.is_file() for p in assets.rglob("*")):
        raise ReleaseError("frontend assets/ is empty")
    data = html.read_text(encoding="utf-8")
    if "GPUPanel" not in data:
        raise ReleaseError("built HTML does not include GPUPanel brand; refuse legacy bundle")
    return {"index_sha256": digest_file(html), "asset_files": str(sum(p.is_file() for p in assets.rglob("*")))}


def build(root: Path, staging: Path, offline: bool) -> dict:
    """Build the same open-source core+agent paths Makefile uses, never run sudo."""
    if staging.resolve() == root.resolve() or root.resolve().is_relative_to(staging.resolve()):
        raise ReleaseError("output directory must not contain the repository")
    for folder in ("frontend", "core", "agent"):
        if not (root / folder).is_dir():
            raise ReleaseError("missing checkout directory: " + folder)
    if not (root / "LICENSE").is_file() or not (root / "NOTICE.md").is_file():
        raise ReleaseError("GPL/attribution documents missing")
    env = dict(os.environ)
    if offline:
        env["GOPROXY"] = "off"
    command = ["npm", "ci", "--offline"] if offline else ["npm", "ci"]
    checked_run(command, root / "frontend", env=env)
    checked_run(["npm", "run", "build:pro"], root / "frontend", env=env)
    checked_run(["npm", "run", "type-check"], root / "frontend", env=env)
    web_meta = validate_web(root)
    (staging / "bin").mkdir(parents=True, exist_ok=True)
    for module, executable in (("core", "1panel-core"), ("agent", "1panel-agent")):
        args = ["go", "build", "-trimpath", "-o", str((staging / "bin" / executable).resolve()), "./cmd/server"]
        go_env = {**env, "CGO_ENABLED": "0", "GOOS": "linux"}
        checked_run(args, root / module, env=go_env)
        output = staging / "bin" / executable
        if not output.is_file() or output.stat().st_size == 0:
            raise ReleaseError(executable + " binary missing or empty")
    for item in ("LICENSE", "NOTICE.md"):
        shutil.copyfile(root / item, staging / item)
    return {"web": web_meta, "source_commit": source_revision(root),
            "offline_dependencies": offline, "production_install_ready": False}


def package(staging: Path, destination: Path, version: str, metadata: dict) -> dict:
    if not NAME_RE.fullmatch(version):
        raise ReleaseError("invalid version (safe characters only)")
    if destination.resolve().is_relative_to(staging.resolve()) or staging.resolve().is_relative_to(destination.resolve()):
        raise ReleaseError("archive and staging locations must be separate")
    manifest = {"format_version": 1, "product": "GPUPanel", "version": version,
                "status": "source-preview-not-installable", **metadata, "files": {}}
    for name in REQUIRED:
        path = staging / name
        if not path.is_file() or path.is_symlink() or path.stat().st_size == 0:
            raise ReleaseError("missing or invalid staging artifact: " + name)
        manifest["files"][name] = {"sha256": digest_file(path), "size": path.stat().st_size}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".gpupanel-release-",
                                     suffix=".tar.gz", delete=False) as temporary:
        tmp = Path(temporary.name)
    try:
        with tarfile.open(tmp, "w:gz", format=tarfile.PAX_FORMAT) as archive:
            for name in REQUIRED:
                archive.add(staging / name, arcname="gpupanel/" + name, recursive=False)
            data = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
            import io
            info = tarfile.TarInfo("gpupanel/manifest.json")
            info.size = len(data)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(data))
        os.replace(tmp, destination)
    finally:
        tmp.unlink(missing_ok=True)
    return {"archive": str(destination), "sha256": digest_file(destination), "manifest": manifest}


def verify(archive_path: Path) -> dict:
    if not archive_path.is_file() or archive_path.is_symlink():
        raise ReleaseError("archive is missing or a symlink")
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ReleaseError("archive too large for this verifier")
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        names = [m.name for m in members]
        expected = {"gpupanel/" + n for n in REQUIRED} | {"gpupanel/manifest.json"}
        if len(names) != len(set(names)) or set(names) != expected:
            raise ReleaseError("unexpected, duplicate or missing archive members")
        for member in members:
            parts = PurePosixPath(member.name).parts
            if (not member.isfile() or ".." in parts or member.islnk() or member.issym()
                    or member.size <= 0 or member.size > MAX_ARCHIVE_BYTES):
                raise ReleaseError("unsafe member: " + member.name)
        fileobj = archive.extractfile("gpupanel/manifest.json")
        if fileobj is None:
            raise ReleaseError("manifest is unreadable")
        manifest = json.load(fileobj)
        if (manifest.get("format_version") != 1 or manifest.get("product") != "GPUPanel"
                or manifest.get("status") != "source-preview-not-installable"
                or set(manifest.get("files", {})) != set(REQUIRED)):
            raise ReleaseError("unsupported manifest contract")
        for name in REQUIRED:
            descriptor = manifest["files"][name]
            if archive.getmember("gpupanel/" + name).size != descriptor.get("size"):
                raise ReleaseError("size mismatch: " + name)
            stream = archive.extractfile("gpupanel/" + name)
            if stream is None:
                raise ReleaseError("missing data: " + name)
            hasher = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                hasher.update(chunk)
            if hasher.hexdigest() != descriptor.get("sha256"):
                raise ReleaseError("SHA-256 mismatch: " + name)
    return {"verified": True, "artifact": str(archive_path), "sha256": digest_file(archive_path),
            "version": manifest["version"], "installable": False,
            "source_commit": manifest.get("source_commit", "unknown")}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel source build/package verifier (never installs services)")
    sub = parser.add_subparsers(dest="action", required=True)
    p = sub.add_parser("build", help="npm ci + Vite + Vue types + Core/Agent Go build + verified preview bundle")
    p.add_argument("--root", type=Path, default=ROOT)
    p.add_argument("--output", type=Path, default=ROOT / "dist" / "gpupanel-preview.tar.gz")
    p.add_argument("--version", default="dev")
    p.add_argument("--offline", action="store_true", help="npm offline and GOPROXY=off; requires seeded caches")
    p = sub.add_parser("verify", help="verify a source preview archive without extracting it")
    p.add_argument("archive", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.action == "build":
            if not NAME_RE.fullmatch(args.version):
                raise ReleaseError("invalid version")
            with tempfile.TemporaryDirectory(prefix="gpupanel-stage-") as tmp:
                meta = build(args.root.resolve(), Path(tmp), args.offline)
                result = package(Path(tmp), args.output.resolve(), args.version, meta)
                verify(args.output.resolve())
        else:
            result = verify(args.archive.resolve())
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except (ReleaseError, OSError, ValueError, json.JSONDecodeError, tarfile.TarError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
