#!/usr/bin/env python3
"""Check a local uv.lock, optionally prove offline sync in a disposable directory.

No user project or virtual environment is modified. Dry-run is NOT evidence of
available wheels; only the explicitly approved offline sync is such evidence
for the current local Python/platform. This tool never executes a project.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROJECT = Path.home() / "GPUPanel" / "projects" / "uv-python-starter"
MAX_PROJECT = 128 * 1024
MAX_LOCK = 2 * 1024 * 1024
MAX_PACKAGES = 1000
TIMEOUT = 90
SHA = re.compile(r"^sha256:[0-9a-f]{64}$")

spec = importlib.util.spec_from_file_location(
    "gpupanel_lock_workspace", ROOT / "scripts/gpupanel-catalog-workspace.py"
)
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)


class LockCheckError(Exception):
    pass


def project_path(path: Path, home: Path) -> Path:
    # safe_target rejects symlink path components and containment escapes.
    try:
        return workspace.safe_target(path, home)
    except workspace.WorkspaceError as exc:
        raise LockCheckError("project path must be a safe directory beneath your home") from exc


def load_regular(path: Path, maximum: int) -> bytes:
    if path.is_symlink() or not path.is_file():
        raise LockCheckError("project and lock must be regular files")
    try:
        if not 0 < path.stat().st_size <= maximum:
            raise LockCheckError("project or lock file exceeds supported limits")
        return path.read_bytes()
    except OSError as exc:
        raise LockCheckError("cannot read project metadata") from exc


def https_only(url: object) -> bool:
    if not isinstance(url, str) or len(url) > 4096:
        return False
    try:
        parsed = urlsplit(url)
        return (parsed.scheme == "https" and bool(parsed.hostname)
                and parsed.username is None and parsed.password is None
                and not parsed.fragment)
    except ValueError:
        return False


def inspect(path: Path, home: Path) -> dict:
    directory = project_path(path, home)
    if not directory.is_dir() or directory.is_symlink():
        return {"status": "MISSING_PROJECT", "executed": False}
    try:
        manifest = load_regular(directory / "pyproject.toml", MAX_PROJECT)
        lockfile = load_regular(directory / "uv.lock", MAX_LOCK)
        pyproject = tomllib.loads(manifest.decode("utf-8"))
        locked = tomllib.loads(lockfile.decode("utf-8"))
    except (LockCheckError, ValueError, TypeError, UnicodeError):
        return {"status": "INVALID_LOCK", "executed": False}
    metadata = pyproject.get("project")
    packages = locked.get("package")
    if (not isinstance(metadata, dict)
            or not isinstance(metadata.get("name"), str)
            or not isinstance(metadata.get("dependencies"), list)
            or not isinstance(packages, list) or not 1 <= len(packages) <= MAX_PACKAGES
            or not isinstance(locked.get("version"), int)):
        return {"status": "INVALID_LOCK", "executed": False}
    # Keep arbitrary PEP 517/uv workspace/directory sources out of the sandbox.
    tool_settings = pyproject.get("tool", {})
    if (not isinstance(tool_settings, dict) or "build-system" in pyproject
            or "workspace" in pyproject or "uv" in tool_settings):
        return {"status": "UNREVIEWED_SOURCE", "executed": False}
    wheels = 0
    for package in packages:
        if not isinstance(package, dict):
            return {"status": "INVALID_LOCK", "executed": False}
        source = package.get("source")
        if not isinstance(source, dict) or len(source) != 1:
            return {"status": "UNREVIEWED_SOURCE", "executed": False}
        if "virtual" in source:
            if source["virtual"] != "." or package.get("name") != metadata["name"]:
                return {"status": "UNREVIEWED_SOURCE", "executed": False}
        elif "registry" in source and https_only(source["registry"]):
            artifacts = package.get("wheels", [])
            if not isinstance(artifacts, list):
                return {"status": "INVALID_LOCK", "executed": False}
            # Reject sdist-only packages: no offline build of third-party code.
            if not artifacts:
                return {"status": "SOURCE_BUILD_BLOCKED", "executed": False}
            for wheel in artifacts:
                if (not isinstance(wheel, dict) or not https_only(wheel.get("url"))
                        or not isinstance(wheel.get("hash"), str)
                        or not SHA.fullmatch(wheel["hash"])):
                    return {"status": "UNREVIEWED_SOURCE", "executed": False}
            wheels += len(artifacts)
        else:
            # No git, local path, direct URLs, editable or unknown sources.
            return {"status": "UNREVIEWED_SOURCE", "executed": False}
    return {"status": "REVIEWED_LOCK", "project": str(directory),
            "manifestSha256": hashlib.sha256(manifest).hexdigest(),
            "lockSha256": hashlib.sha256(lockfile).hexdigest(),
            "packages": len(packages), "wheels": wheels,
            "offlineCache": "NOT_VERIFIED", "executed": False}


def uv_environment() -> dict[str, str]:
    allowed = ("HOME", "PATH", "LANG", "LC_ALL", "TMPDIR", "XDG_CACHE_HOME")
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    env.update({"UV_OFFLINE": "1", "UV_NO_CONFIG": "1",
                "UV_NO_MANAGED_PYTHON": "1", "UV_PYTHON_DOWNLOADS": "never",
                "UV_NO_PROGRESS": "1", "PYTHONDONTWRITEBYTECODE": "1"})
    return env


def verify_offline(path: Path, home: Path, approved: bool,
                   *, uv_path: str | None = None, runner=subprocess.run) -> dict:
    report = inspect(path, home)
    if report["status"] != "REVIEWED_LOCK":
        return report
    if not approved:
        return {**report, "status": "APPROVAL_REQUIRED",
                "reason": "Offline probe installs wheels in a disposable environment",
                "executed": False}
    if not sys.platform.startswith("linux") or os.geteuid() == 0:
        return {"status": "UNSUPPORTED_USER", "executed": False}
    uv = uv_path if uv_path is not None else shutil.which("uv")
    if not uv:
        return {"status": "MISSING_UV", "executed": False}
    # Reinspect source before copying; distinguish a concurrent metadata change.
    directory = project_path(path, home)
    with tempfile.TemporaryDirectory(prefix="gpupanel-uv-offline-") as temporary:
        tmp = Path(temporary)
        for name in ("pyproject.toml", "uv.lock"):
            raw = load_regular(directory / name, MAX_PROJECT if name == "pyproject.toml" else MAX_LOCK)
            (tmp / name).write_bytes(raw)
        if (hashlib.sha256((tmp / "pyproject.toml").read_bytes()).hexdigest()
                != report["manifestSha256"]
                or hashlib.sha256((tmp / "uv.lock").read_bytes()).hexdigest()
                != report["lockSha256"]):
            return {"status": "CHANGED_DURING_PROBE", "executed": False}
        command = [uv, "sync", "--locked", "--offline", "--no-config",
                   "--no-python-downloads", "--no-managed-python",
                   "--no-default-groups", "--no-install-project", "--no-build"]
        try:
            result = runner(command, cwd=tmp, check=False, timeout=TIMEOUT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            env=uv_environment())
        except subprocess.TimeoutExpired:
            return {**report, "status": "TIMEOUT", "executed": True}
        except OSError:
            return {**report, "status": "UV_UNAVAILABLE", "executed": False}
        if result.returncode != 0:
            return {**report, "status": "OFFLINE_SYNC_FAILED",
                    "reason": "Cache missing, lock incompatible, or uv failed; inspect locally",
                    "executed": True}
        return {**report, "status": "OFFLINE_SYNC_VERIFIED",
                "offlineCache": "VERIFIED_FOR_CURRENT_PYTHON_AND_PLATFORM",
                "runtimeVerified": False, "executed": True}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only uv lock check and optional offline cache proof")
    parser.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    sub = parser.add_subparsers(dest="command")
    for name in ("check", "probe-offline"):
        item = sub.add_parser(name)
        item.add_argument("--project", type=Path, default=argparse.SUPPRESS)
        item.add_argument("--json", action="store_true")
        if name == "probe-offline":
            item.add_argument("--approve", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command == "probe-offline":
            report = verify_offline(args.project, Path.home(), args.approve)
        else:
            report = inspect(args.project, Path.home())
    except (LockCheckError, OSError):
        report = {"status": "INVALID_LOCK", "executed": False}
    if getattr(args, "json", False):
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("GPUPanel · uv 离线依赖检查")
        print("状态:", report["status"])
        if "packages" in report:
            print(f"锁定包: {report['packages']}；wheel 候选: {report['wheels']}")
        print("缓存:", report.get("offlineCache", "未验证"))
        if report["status"] == "REVIEWED_LOCK":
            print("结构检查通过；不能据此断言离线依赖完整。")
            print("可选: python3 scripts/gpupanel-uv-lock-check.py probe-offline --approve")
        elif report["status"] == "OFFLINE_SYNC_VERIFIED":
            print("本地 uv 已在临时目录完成离线同步；未验证包导入或 GPU 算子。")
    return 0 if report["status"] in {"REVIEWED_LOCK", "OFFLINE_SYNC_VERIFIED"} else 2


if __name__ == "__main__":
    raise SystemExit(main())
