#!/usr/bin/env python3
"""Read-only GPUPanel first-run readiness overview.

This command never installs packages, starts services or writes files. An opt-in
Docker info probe is read-only and may contact the active (remote) context.
It deliberately separates usable user-local workflows from unsupported
Core/Agent system installation.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


preflight = module("gpupanel_first_run_preflight", ROOT / "scripts/gpupanel-install-preflight.py")
namespace = module("gpupanel_first_run_namespace", ROOT / "scripts/gpupanel-runtime-namespace.py")
catalog = module("gpupanel_first_run_catalog", ROOT / "scripts/gpupanel-catalog.py")
python_doctor = module("gpupanel_first_run_python", ROOT / "scripts/gpupanel-python-doctor.py")


def docker_health(probe: bool, *, which=shutil.which, runner=subprocess.run) -> dict:
    """Optional bounded daemon probe; never executes container mutations."""
    if not probe:
        return {"status": "NOT_CHECKED", "reason": "enable --probe-docker to inspect the active Docker context",
                "daemonVerified": False}
    docker = which("docker")
    if docker is None:
        return {"status": "MISSING_CLI", "daemonVerified": False}
    try:
        response = runner([docker, "info", "--format", "{{.ServerVersion}}"],
                          capture_output=True, text=True, check=False, timeout=8)
    except subprocess.TimeoutExpired:
        return {"status": "TIMEOUT", "daemonVerified": False}
    except OSError:
        return {"status": "UNAVAILABLE", "daemonVerified": False}
    if response.returncode == 0 and response.stdout.strip():
        version = response.stdout.strip()
        # Avoid dumping arbitrary multiline daemon output, hostnames, or secrets.
        if len(version) <= 80 and "\n" not in version and "\r" not in version:
            return {"status": "READY", "daemonVerified": True, "serverVersion": version,
                    "scope": "current Docker CLI context; may be remote"}
        return {"status": "INVALID_RESPONSE", "daemonVerified": False}
    stderr = response.stderr.lower()
    if "permission denied" in stderr or "access denied" in stderr:
        return {"status": "ACCESS_DENIED", "daemonVerified": False}
    return {"status": "UNAVAILABLE", "daemonVerified": False}


def overview(host_root: Path, repo_root: Path, free_bytes: int | None = None,
             probe_docker: bool = False, probe_torch: bool = False) -> dict:
    host = preflight.inspect_host(host_root, free_bytes=free_bytes)
    docker = docker_health(probe_docker)
    python_environment = python_doctor.inspect(probe_torch=probe_torch)
    runtime = namespace.audit(repo_root)
    index = catalog.load(repo_root / "catalog/index.json")
    enabled = []
    for entry in index["definitions"]:
        revs = [r for r in index["revisions"] if r["definitionId"] == entry["id"]]
        if len(revs) == 1 and revs[0]["recipeId"] == "python-stdlib-scaffold-v1":
            enabled.append({"id": entry["id"], "interface": "offline-user-cli",
                            "action": "python3 scripts/gpupanel-catalog-workspace.py plan",
                            "requiresApprovalForWrites": True, "systemInstall": False})
    host_blockers = [x["code"] for x in host["checks"] if x["state"] == "BLOCKED"]
    return {
        "product": "GPUPanel",
        "mode": "read-only-first-run-overview",
        "host": {"checks": host["checks"], "blockers": host_blockers},
        "docker": docker,
        "developerEnvironment": python_environment,
        "catalog": {"definitions": len(index["definitions"]), "approvedUserWorkflows": enabled},
        "systemRuntime": {"installable": False, "namespaceRisks": runtime["blocked"],
                          "unknownIsolationRisks": runtime["unknown"],
                          "firstLoginVerified": False, "dockerApiLifecycleVerified": False},
        "recommendedNextActions": [
            {"id": "review-host", "title": "Review Ubuntu version, disk and inherited 1Panel paths",
             "command": "python3 scripts/gpupanel-install-preflight.py"},
            {"id": "review-isolation", "title": "Audit Core/Agent isolation blockers",
             "command": "python3 scripts/gpupanel-runtime-namespace.py --strict"},
            {"id": "plan-uv-environment", "title": "Preview offline uv Python environment",
             "command": "python3 scripts/gpupanel-env.py plan"},
            {"id": "try-offline-template", "title": "Preview Python stdlib user-local scaffold",
             "command": "python3 scripts/gpupanel-catalog-workspace.py plan"},
        ],
        "mutationPerformed": False,
        "systemServiceInstalled": False,
        "readyForProduction": False,
        "conclusion": "SYSTEM_INSTALL_BLOCKED",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel Host first-run review (read only)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    parser.add_argument("--probe-torch", action="store_true",
                        help="opt in to importing PyTorch in an isolated timed subprocess (may initialize CUDA)")
    parser.add_argument("--probe-docker", action="store_true",
                        help="opt in to read-only daemon health of current Docker CLI context (may be remote)")
    args = parser.parse_args(argv)
    try:
        report = overview(Path("/"), ROOT, probe_docker=args.probe_docker,
                          probe_torch=args.probe_torch)
    except (OSError, ValueError, TypeError, catalog.CatalogError) as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    if not args.json:
        print("GPUPanel 首次使用检查 | 只读、不安装")
        print(f"Host 阻塞项：{len(report['host']['blockers'])}；运行目录阻塞项："
              f"{report['systemRuntime']['namespaceRisks']}")
        for check in report["host"]["checks"]:
            print(f"  [{check['state']}] {check['code']}: {check['detail']}")
        print(f"Docker daemon: {report['docker']['status']}（当前 CLI context，可能是远端）")
        env = report["developerEnvironment"]
        print(f"Python {env['python']['version']}，PyTorch 安装状态: {env['torch']['status']}，"
              f"GPU 运行时: {env['runtime']['status']}")
        print("PyTorch 可选 --probe-torch；不自动导入第三方包，不代表 CUDA Toolkit 可用。")
        print("Python 开发环境推荐 uv：先运行 gpupanel-env.py plan，明确批准后才能创建。")
        print("当前可用：Python 标准库项目模板（仅本机 CLI，需要明确批准写入）")
        print("完整 GPUPanel Core/Agent 系统安装：未开放；首次登录和 Docker API 闭环未验收。")
        for step in report["recommendedNextActions"]:
            print(f"  {step['title']}: {step['command']}")
    else:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0  # report is informational: see conclusion, never interpret 0 as installable.


if __name__ == "__main__":
    raise SystemExit(main())
