#!/usr/bin/env python3
"""GPUPanel source release: build/pack/verify without installing host services.

The output is a development artifact, NOT an installable or supported release.
Preserves the reviewed local GPUPanel runtime namespace and React frontend.
"""
from __future__ import annotations

import argparse
import gzip
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
# Hard bounds on both compressed and decompressed source-preview payloads.
MAX_BINARY_BYTES = 256 * 1024 ** 2
MAX_TEXT_BYTES = 8 * 1024 ** 2
MAX_MANIFEST_BYTES = 64 * 1024
MAX_MEMBER_TOTAL_BYTES = 600 * 1024 ** 2
MAX_RAW_TAR_BYTES = MAX_MEMBER_TOTAL_BYTES + 4 * 1024 ** 2
REQUIRED = ("bin/gpupanel-core", "bin/gpupanel-agent", "LICENSE", "NOTICE.md")
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
        raise ReleaseError("frontend assets missing: run pnpm install and pnpm build before Go build")
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
    command = ["pnpm", "install", "--frozen-lockfile", "--offline"] if offline else ["pnpm", "install", "--frozen-lockfile"]
    checked_run(command, root / "frontend", env=env)
    checked_run(["pnpm", "build"], root / "frontend", env=env)
    checked_run(["pnpm", "typecheck"], root / "frontend", env=env)
    dist = root / "frontend/apps/panel/dist"
    web = root / "core/cmd/server/web"
    if not (dist / "index.html").is_file() or not (dist / "assets").is_dir():
        raise ReleaseError("fresh React build output missing")
    if (web / "assets").exists():
        shutil.rmtree(web / "assets")
    shutil.copytree(dist / "assets", web / "assets")
    shutil.copyfile(dist / "index.html", web / "index.html")
    web_meta = validate_web(root)
    (staging / "bin").mkdir(parents=True, exist_ok=True)
    for module, executable in (("core", "gpupanel-core"), ("agent", "gpupanel-agent")):
        args = ["go", "build", "-trimpath", "-o", str((staging / "bin" / executable).resolve()), "./cmd/server"]
        go_env = {**env, "CGO_ENABLED": "0", "GOOS": "linux", "GOARCH": "amd64"}
        checked_run(args, root / module, env=go_env)
        output = staging / "bin" / executable
        if not output.is_file() or output.stat().st_size == 0:
            raise ReleaseError(executable + " binary missing or empty")
    for item in ("LICENSE", "NOTICE.md"):
        shutil.copyfile(root / item, staging / item)
    return {"web": web_meta, "source_commit": source_revision(root),
            "offline_dependencies": offline, "production_install_ready": False}


def member_limit(name: str) -> int:
    if name == "gpupanel/manifest.json":
        return MAX_MANIFEST_BYTES
    if name in ("gpupanel/bin/gpupanel-core", "gpupanel/bin/gpupanel-agent"):
        return MAX_BINARY_BYTES
    if name in ("gpupanel/LICENSE", "gpupanel/NOTICE.md"):
        return MAX_TEXT_BYTES
    raise ReleaseError("unexpected member path")


def package(staging: Path, destination: Path, version: str, metadata: dict) -> dict:
    if not NAME_RE.fullmatch(version):
        raise ReleaseError("invalid version (safe characters only)")
    if set(metadata) & {"format_version", "product", "version", "status", "files"}:
        raise ReleaseError("metadata cannot override protected preview manifest fields")
    if destination.resolve().is_relative_to(staging.resolve()) or staging.resolve().is_relative_to(destination.resolve()):
        raise ReleaseError("archive and staging locations must be separate")
    manifest = {"format_version": 1, "product": "GPUPanel", "version": version,
                "status": "source-preview-not-installable", **metadata, "files": {}}
    total = 0
    for name in REQUIRED:
        path = staging / name
        if not path.is_file() or path.is_symlink() or path.stat().st_size == 0:
            raise ReleaseError("missing or invalid staging artifact: " + name)
        size = path.stat().st_size
        if size > member_limit("gpupanel/" + name):
            raise ReleaseError("staging artifact exceeds size limit: " + name)
        total += size
        if total > MAX_MEMBER_TOTAL_BYTES:
            raise ReleaseError("staging payload exceeds total size limit")
        manifest["files"][name] = {"sha256": digest_file(path), "size": size}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=destination.parent, prefix=".gpupanel-release-",
                                     suffix=".tar.gz", delete=False) as temporary:
        tmp = Path(temporary.name)
    try:
        with tarfile.open(tmp, "w:gz", format=tarfile.PAX_FORMAT) as archive:
            for name in REQUIRED:
                archive.add(staging / name, arcname="gpupanel/" + name, recursive=False)
            data = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
            if len(data) > MAX_MANIFEST_BYTES or total + len(data) > MAX_MEMBER_TOTAL_BYTES:
                raise ReleaseError("preview manifest or overall payload exceeds limit")
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
    """Check preview structure and self-contained hashes with strict resource bounds.

    Integrity does not establish publisher identity or authorize an installation.
    """
    if archive_path.is_symlink() or not archive_path.is_file():
        raise ReleaseError("archive is missing or a symlink")
    if not 0 < archive_path.stat().st_size <= MAX_ARCHIVE_BYTES:
        raise ReleaseError("archive exceeds compressed size limit")

    # tarfile may allocate a large PAX extension before yielding a member.
    # First bound the *entire* gzip expansion in small chunks.
    try:
        total_raw = 0
        with gzip.open(archive_path, "rb") as reader:
            while True:
                chunk = reader.read(min(1024 * 1024, MAX_RAW_TAR_BYTES - total_raw + 1))
                if not chunk:
                    break
                total_raw += len(chunk)
                if total_raw > MAX_RAW_TAR_BYTES:
                    raise ReleaseError("archive exceeds expanded tar size limit")
    except (OSError, EOFError) as exc:
        raise ReleaseError("archive gzip stream is invalid") from exc

    expected = {"gpupanel/" + name for name in REQUIRED} | {"gpupanel/manifest.json"}
    with tarfile.open(archive_path, "r:gz") as archive:
        members = {}
        total_members = 0
        # Do not call getmembers(): stop reading an unexpected flood immediately.
        for member in archive:
            if member.name not in expected or member.name in members:
                raise ReleaseError("unexpected or duplicate archive member")
            parts = PurePosixPath(member.name).parts
            if (not member.isfile() or ".." in parts or member.islnk()
                    or member.issym() or not 0 < member.size <= member_limit(member.name)):
                raise ReleaseError("unsafe or oversized archive member: " + member.name)
            total_members += member.size
            if total_members > MAX_MEMBER_TOTAL_BYTES:
                raise ReleaseError("archive member payload exceeds total size limit")
            members[member.name] = member
            if len(members) > len(expected):
                raise ReleaseError("too many archive members")
        if set(members) != expected:
            raise ReleaseError("missing archive members")

        fileobj = archive.extractfile(members["gpupanel/manifest.json"])
        if fileobj is None:
            raise ReleaseError("manifest is unreadable")
        try:
            manifest = json.loads(fileobj.read(MAX_MANIFEST_BYTES + 1))
        except (ValueError, UnicodeError) as exc:
            raise ReleaseError("invalid preview manifest") from exc
        files = manifest.get("files") if isinstance(manifest, dict) else None
        if (not isinstance(manifest, dict) or manifest.get("format_version") != 1
                or manifest.get("product") != "GPUPanel"
                or manifest.get("status") != "source-preview-not-installable"
                or not isinstance(manifest.get("version"), str)
                or not NAME_RE.fullmatch(manifest["version"])
                or not isinstance(files, dict) or set(files) != set(REQUIRED)):
            raise ReleaseError("unsupported manifest contract")
        for name in REQUIRED:
            descriptor = files[name]
            member = members["gpupanel/" + name]
            if (not isinstance(descriptor, dict)
                    or type(descriptor.get("size")) is not int
                    or descriptor["size"] != member.size
                    or not isinstance(descriptor.get("sha256"), str)
                    or not re.fullmatch(r"[0-9a-f]{64}", descriptor["sha256"])):
                raise ReleaseError("invalid file descriptor: " + name)
            stream = archive.extractfile(member)
            if stream is None:
                raise ReleaseError("missing member data: " + name)
            hasher = hashlib.sha256()
            remaining = member.size
            while remaining:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise ReleaseError("truncated archive member: " + name)
                hasher.update(chunk)
                remaining -= len(chunk)
            if hasher.hexdigest() != descriptor["sha256"]:
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
