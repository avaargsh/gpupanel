#!/usr/bin/env python3
"""User-local uv environment: offline plan -> approve -> verify, never overwrite.

uv owns virtualenv creation. We deliberately do NOT call Python venv/ensurepip,
pip, a package index, apt, or a driver installer. No automatic repair/deletion.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGET = Path.home() / "GPUPanel" / "environments" / "python-local"
RECEIPT = ".gpupanel-uv-env.json"
TIMEOUT = 120

spec = importlib.util.spec_from_file_location(
    "gpupanel_uv_workspace", ROOT / "scripts/gpupanel-catalog-workspace.py"
)
workspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workspace)


class EnvironmentError(Exception):
    pass


def target_under_home(target: Path, home: Path) -> Path:
    try:
        return workspace.safe_target(target, home)
    except workspace.WorkspaceError as exc:
        raise EnvironmentError("target must be a safe path inside your user home") from exc


def plan(target: Path, home: Path, *, uv_path: str | None = None,
         python: str | None = None) -> dict:
    dst = target_under_home(target, home)
    if dst.exists() or dst.is_symlink():
        return {"status": "REFUSED_EXISTS", "target": str(dst)}
    uv = uv_path if uv_path is not None else shutil.which("uv")
    if not uv:
        return {"status": "MISSING_UV", "target": str(dst),
                "hint": "Install uv from a trusted source, then retry; no automatic installation"}
    interpreter = Path(python or sys.executable).resolve()
    if not interpreter.is_file() or not os.access(interpreter, os.X_OK):
        return {"status": "PYTHON_UNAVAILABLE", "target": str(dst)}
    recipe = {"formatVersion": 1, "manager": "uv", "target": str(dst),
              "interpreter": str(interpreter), "offline": True,
              "noPythonDownloads": True, "noThirdPartyPackages": True}
    digest = hashlib.sha256(
        json.dumps(recipe, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {"status": "READY_FOR_APPROVAL", "target": str(dst), "uv": uv,
            "interpreter": str(interpreter), "planDigest": digest, "executed": False,
            "steps": ["Create new isolated user directory", "uv venv (offline, no downloads)",
                      "Verify virtualenv Python with a fresh process"],
            "note": "This does not install PyTorch, CUDA, pip, or Jupyter"}


def safe_environment() -> dict[str, str]:
    # Do not inherit arbitrary UV_* options such as UV_VENV_CLEAR / UV_INDEX,
    # PYTHONPATH or site-specific environment modifications.
    allowed = ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "XDG_CACHE_HOME")
    env = {name: os.environ[name] for name in allowed if name in os.environ}
    env.update({"UV_NO_CONFIG": "1", "UV_OFFLINE": "1",
                "UV_PYTHON_DOWNLOADS": "never", "UV_NO_MANAGED_PYTHON": "1",
                "UV_VENV_SEED": "0", "UV_VENV_CLEAR": "0", "UV_NO_PROGRESS": "1",
                "PYTHONDONTWRITEBYTECODE": "1"})
    return env


def verify(directory: Path, *, runner=subprocess.run) -> bool:
    python = directory / "bin" / "python"
    if not python.exists() or not python.is_file():
        return False
    code = ("import json,sys;"
            "print(json.dumps({'prefix':sys.prefix,'base':sys.base_prefix}))")
    try:
        observed = runner(
            [str(python), "-I", "-B", "-c", code], capture_output=True, text=True,
            check=False, timeout=12, env=safe_environment(),
        )
        if observed.returncode != 0 or len(observed.stdout) > 1024:
            return False
        value = json.loads(observed.stdout)
        return (isinstance(value, dict) and set(value) == {"prefix", "base"}
                and value["prefix"] == str(directory)
                and value["base"] != str(directory))
    except (OSError, ValueError, TypeError, subprocess.TimeoutExpired):
        return False


def status(target: Path, home: Path, *, runner=subprocess.run) -> dict:
    dst = target_under_home(target, home)
    if not dst.exists() and not dst.is_symlink():
        return {"status": "ABSENT", "target": str(dst)}
    if dst.is_symlink() or not dst.is_dir():
        return {"status": "UNMANAGED", "target": str(dst)}
    receipt = dst / RECEIPT
    if receipt.is_symlink() or not receipt.is_file():
        return {"status": "UNMANAGED", "target": str(dst)}
    try:
        if receipt.stat().st_size > 2048:
            return {"status": "DRIFT", "target": str(dst)}
        record = json.loads(receipt.read_text(encoding="utf-8"))
        if (not isinstance(record, dict) or set(record) !=
                {"formatVersion", "manager", "planDigest", "target"}
                or record["formatVersion"] != 1 or record["manager"] != "uv"
                or record["target"] != str(dst)
                or not isinstance(record["planDigest"], str)
                or len(record["planDigest"]) != 64):
            return {"status": "DRIFT", "target": str(dst)}
    except (OSError, ValueError, UnicodeError):
        return {"status": "DRIFT", "target": str(dst)}
    return {"status": "VERIFIED" if verify(dst, runner=runner) else "DRIFT",
            "target": str(dst), "manager": "uv"}


def create(target: Path, home: Path, approved: bool, *, uv_path: str | None = None,
           python: str | None = None, runner=subprocess.run) -> dict:
    current = plan(target, home, uv_path=uv_path, python=python)
    if current["status"] != "READY_FOR_APPROVAL":
        return current
    if not approved:
        return {"status": "APPROVAL_REQUIRED", "target": current["target"],
                "planDigest": current["planDigest"], "executed": False}
    if not sys.platform.startswith("linux") or os.geteuid() == 0:
        return {"status": "UNSUPPORTED_USER", "executed": False,
                "hint": "Use a normal user on Linux; do not run as root"}
    dst = Path(current["target"])
    try:
        workspace.prepare_user_parents(dst, home)
    except workspace.WorkspaceError as exc:
        raise EnvironmentError("target parent became unsafe") from exc
    # Create into a private staging directory and atomically publish with
    # RENAME_NOREPLACE; never pass the live destination to uv.
    with tempfile.TemporaryDirectory(dir=dst.parent, prefix=".gpupanel-uv-stage-") as temporary:
        staged = Path(temporary) / "env"
        command = [current["uv"], "venv", "--no-project", "--no-config",
                   "--offline", "--no-python-downloads", "--no-managed-python", "--relocatable",
                   "--python", current["interpreter"], str(staged)]
        try:
            run = runner(command, capture_output=True, text=True, check=False,
                         timeout=TIMEOUT, env=safe_environment())
        except subprocess.TimeoutExpired:
            return {"status": "UV_TIMEOUT", "target": str(dst), "executed": True}
        except OSError:
            return {"status": "UV_UNAVAILABLE", "target": str(dst), "executed": False}
        if run.returncode != 0:
            # Never surface third-party stderr containing private paths/secrets.
            return {"status": "UV_FAILED", "target": str(dst), "executed": True}
        if not verify(staged, runner=runner):
            return {"status": "VERIFICATION_FAILED", "target": str(dst),
                    "executed": True}
        record = {"formatVersion": 1, "manager": "uv", "target": str(dst),
                  "planDigest": current["planDigest"]}
        with (staged / RECEIPT).open("x", encoding="utf-8") as file:
            json.dump(record, file, sort_keys=True)
            file.write("\n")
            file.flush()
            os.fsync(file.fileno())
        try:
            workspace.rename_exclusive(staged, dst)
        except workspace.WorkspaceError as exc:
            raise EnvironmentError("publication refused; existing data remains untouched") from exc
    observed = status(dst, home, runner=runner)
    if observed["status"] != "VERIFIED":
        return {"status": "PUBLISHED_UNVERIFIED", "target": str(dst),
                "hint": "Do not auto-delete or retry; inspect the published environment"}
    return {**observed, "executed": True, "planDigest": current["planDigest"]}


def present(result: dict, *, json_output: bool) -> int:
    if json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("GPUPanel · uv 开发环境")
        print("状态:", result["status"])
        if "target" in result:
            print("目录:", result["target"])
        if "planDigest" in result:
            print("计划摘要:", result["planDigest"][:16])
        for step in result.get("steps", []):
            print("  ·", step)
        if "hint" in result:
            print("说明:", result["hint"])
        if result["status"] in ("READY_FOR_APPROVAL", "APPROVAL_REQUIRED"):
            print("下一步: python3 scripts/gpupanel-env.py create --approve")
        elif result["status"] == "VERIFIED":
            print("下一步: 使用该目录 bin/python；第三方依赖后续交给 uv 管理。")
    return 0 if result["status"] in ("READY_FOR_APPROVAL", "VERIFIED", "ABSENT") else 2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline uv environment for one Ubuntu user")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    sub = parser.add_subparsers(dest="command")
    for name in ("plan", "create", "status"):
        item = sub.add_parser(name)
        item.add_argument("--json", action="store_true", help="machine-readable JSON")
        if name == "create":
            item.add_argument("--approve", action="store_true", help="explicitly allow new files")
    args = parser.parse_args(argv)
    if args.command is None:
        return present(plan(args.target, Path.home()), json_output=False)
    try:
        if args.command == "status":
            result = status(args.target, Path.home())
        elif args.command == "create":
            result = create(args.target, Path.home(), args.approve)
        else:
            result = plan(args.target, Path.home())
        return present(result, json_output=args.json)
    except (EnvironmentError, OSError) as exc:
        # Keep detailed user-controlled paths out of generic errors.
        print("GPUPanel: operation refused or unavailable; no existing environment overwritten",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
