#!/usr/bin/env python3
"""Offline uv Python starter: preview -> approve -> create -> verify.

A separate user-local project, not a package manager or a GPUPanel installer.
uv generates its native pyproject.toml, main.py, README.md and uv.lock. We never
overwrite or delete a user's project and never execute its arbitrary source.
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

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = Path.home() / "GPUPanel" / "projects" / "uv-python-starter"
NAME = "gpupanel-starter"
RECEIPT = ".gpupanel-uv-project.json"
FILES = ("README.md", "main.py", "pyproject.toml", "uv.lock")
TIMEOUT = 60
DIGEST = re.compile(r"^[0-9a-f]{64}$")

spec = importlib.util.spec_from_file_location(
    "gpupanel_uv_project_workspace", ROOT / "scripts/gpupanel-catalog-workspace.py"
)
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)


class ProjectError(Exception):
    pass


def safe_target(target: Path, home: Path) -> Path:
    try:
        return workspace.safe_target(target, home)
    except workspace.WorkspaceError as exc:
        raise ProjectError("unsafe project directory") from exc


def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def options(target: Path, home: Path, *, uv_path: str | None = None) -> dict:
    dst = safe_target(target, home)
    if dst.exists() or dst.is_symlink():
        return {"status": "REFUSED_EXISTS", "target": str(dst), "executed": False}
    uv = uv_path if uv_path is not None else shutil.which("uv")
    if not uv:
        return {"status": "MISSING_UV", "target": str(dst), "executed": False}
    python = Path(sys.executable).resolve()
    if not python.is_file() or not os.access(python, os.X_OK):
        return {"status": "PYTHON_UNAVAILABLE", "target": str(dst), "executed": False}
    recipe = {"formatVersion": 1, "target": str(dst), "projectName": NAME,
              "python": str(python), "generator": "uv init", "lock": "uv lock",
              "offline": True, "dependencies": []}
    return {"status": "READY_FOR_APPROVAL", "target": str(dst),
            "uv": uv, "python": str(python),
            "planDigest": sha(json.dumps(recipe, sort_keys=True).encode()),
            "changes": list(FILES) + [RECEIPT], "executed": False,
            "note": "Uses installed uv+Python; no downloads or third-party packages"}


def env_for_uv() -> dict[str, str]:
    # Avoid inherited UV_INDEX_URL / project paths / Python user-site hooks.
    allow = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR")
    result = {key: os.environ[key] for key in allow if key in os.environ}
    result.update({"UV_OFFLINE": "1", "UV_NO_CONFIG": "1",
                   "UV_PYTHON_DOWNLOADS": "never", "UV_NO_MANAGED_PYTHON": "1",
                   "UV_NO_PROGRESS": "1", "PYTHONDONTWRITEBYTECODE": "1"})
    return result


def valid_project(directory: Path) -> bool:
    try:
        if any((directory / name).is_symlink() for name in FILES):
            return False
        pyproject = tomllib.loads((directory / "pyproject.toml").read_text())
        lock = tomllib.loads((directory / "uv.lock").read_text())
        project = pyproject.get("project")
        return (isinstance(project, dict) and project.get("name") == NAME
                and project.get("dependencies") == []
                and "build-system" not in pyproject
                and isinstance(lock.get("package"), list)
                and any(x.get("name") == NAME for x in lock["package"]))
    except (OSError, TypeError, ValueError, UnicodeError):
        return False


def status(target: Path, home: Path) -> dict:
    dst = safe_target(target, home)
    if not dst.exists() and not dst.is_symlink():
        return {"status": "ABSENT", "target": str(dst)}
    if dst.is_symlink() or not dst.is_dir():
        return {"status": "UNMANAGED", "target": str(dst)}
    receipt = dst / RECEIPT
    if receipt.is_symlink() or not receipt.is_file():
        return {"status": "UNMANAGED", "target": str(dst)}
    try:
        if receipt.stat().st_size > 2048:
            return {"status": "MODIFIED", "target": str(dst)}
        record = json.loads(receipt.read_text())
        if (not isinstance(record, dict) or set(record) !=
                {"formatVersion", "target", "planDigest", "files"}
                or record["formatVersion"] != 1 or record["target"] != str(dst)
                or not isinstance(record["planDigest"], str)
                or not DIGEST.fullmatch(record["planDigest"])
                or not isinstance(record["files"], dict)
                or set(record["files"]) != set(FILES)):
            return {"status": "MODIFIED", "target": str(dst)}
        for name in FILES:
            path = dst / name
            if path.is_symlink() or not path.is_file() or path.stat().st_size > 64 * 1024:
                return {"status": "MODIFIED", "target": str(dst)}
            if not isinstance(record["files"][name], str) or sha(path.read_bytes()) != record["files"][name]:
                return {"status": "MODIFIED", "target": str(dst)}
    except (OSError, ValueError, UnicodeError, TypeError):
        return {"status": "MODIFIED", "target": str(dst)}
    return {"status": "VERIFIED" if valid_project(dst) else "MODIFIED",
            "target": str(dst), "manager": "uv"}


def create(target: Path, home: Path, approved: bool, *, uv_path: str | None = None,
           runner=subprocess.run) -> dict:
    preview = options(target, home, uv_path=uv_path)
    if preview["status"] != "READY_FOR_APPROVAL":
        return preview
    if not approved:
        return {"status": "APPROVAL_REQUIRED", "target": preview["target"],
                "planDigest": preview["planDigest"], "executed": False}
    if not sys.platform.startswith("linux") or os.geteuid() == 0:
        return {"status": "UNSUPPORTED_USER", "executed": False}
    dst = Path(preview["target"])
    try:
        workspace.prepare_user_parents(dst, home)
    except workspace.WorkspaceError as exc:
        raise ProjectError("unsafe project parent") from exc
    with tempfile.TemporaryDirectory(prefix=".gpupanel-uv-project-", dir=dst.parent) as tmp:
        stage = Path(tmp) / "starter"
        commands = [
            [preview["uv"], "init", "--app", "--no-package", "--no-workspace", "--vcs", "none",
             "--no-pin-python", "--no-config", "--offline",
             "--no-python-downloads", "--no-managed-python",
             "--name", NAME, "--python", preview["python"], str(stage)],
            [preview["uv"], "lock", "--no-config", "--offline",
             "--no-python-downloads", "--no-managed-python"],
        ]
        for command in commands:
            try:
                completed = runner(command, cwd=stage if command[1] == "lock" else tmp,
                                   capture_output=True, text=True, timeout=TIMEOUT,
                                   check=False, env=env_for_uv())
            except subprocess.TimeoutExpired:
                return {"status": "UV_TIMEOUT", "executed": True}
            except OSError:
                return {"status": "UV_UNAVAILABLE", "executed": False}
            if completed.returncode != 0:
                return {"status": "UV_FAILED", "executed": True}
        if (not stage.is_dir()
                or {x.name for x in stage.iterdir()} != set(FILES)
                or not valid_project(stage)):
            return {"status": "INVALID_TEMPLATE", "executed": True}
        digests = {name: sha((stage / name).read_bytes()) for name in FILES}
        receipt = {"formatVersion": 1, "target": str(dst),
                   "planDigest": preview["planDigest"], "files": digests}
        with (stage / RECEIPT).open("x", encoding="utf-8") as out:
            json.dump(receipt, out, sort_keys=True)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        try:
            workspace.rename_exclusive(stage, dst)
        except workspace.WorkspaceError as exc:
            raise ProjectError("project already exists; no files overwritten") from exc
    observed = status(dst, home)
    if observed["status"] != "VERIFIED":
        return {"status": "PUBLISHED_UNVERIFIED", "target": str(dst), "executed": True}
    return {**observed, "executed": True}


def display(value: dict, *, json_output: bool) -> int:
    if json_output:
        print(json.dumps(value, indent=2, ensure_ascii=False))
    else:
        print("GPUPanel · uv Python 项目")
        print("状态:", value["status"])
        if "target" in value:
            print("目录:", value["target"])
        if "planDigest" in value:
            print("计划摘要:", value["planDigest"][:16])
        if "note" in value:
            print("说明:", value["note"])
        if value["status"] == "READY_FOR_APPROVAL":
            print("下一步: python3 scripts/gpupanel-uv-project.py create --approve")
        if value["status"] == "VERIFIED":
            print("可进入项目目录并执行：uv run --locked --offline python main.py")
    return 0 if value["status"] in {"READY_FOR_APPROVAL", "VERIFIED", "ABSENT"} else 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline uv Python project starter")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    sub = parser.add_subparsers(dest="command")
    for name in ("plan", "create", "status"):
        item = sub.add_parser(name)
        item.add_argument("--target", type=Path, default=argparse.SUPPRESS)
        item.add_argument("--json", action="store_true")
        if name == "create":
            item.add_argument("--approve", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command == "status":
            value = status(args.target, Path.home())
        elif args.command == "create":
            value = create(args.target, Path.home(), args.approve)
        else:
            value = options(args.target, Path.home())
        return display(value, json_output=getattr(args, "json", False))
    except (ProjectError, OSError):
        print("GPUPanel: project creation refused; existing data unchanged",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
