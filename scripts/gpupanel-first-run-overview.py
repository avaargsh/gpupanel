#!/usr/bin/env python3
"""Read-only GPUPanel first-run readiness overview.

This command never installs packages, starts services, writes files or invokes
Docker. It deliberately separates usable user-local workflows from unsupported
Core/Agent system installation.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
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


def overview(host_root: Path, repo_root: Path, free_bytes: int | None = None) -> dict:
    host = preflight.inspect_host(host_root, free_bytes=free_bytes)
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
        "catalog": {"definitions": len(index["definitions"]), "approvedUserWorkflows": enabled},
        "systemRuntime": {"installable": False, "namespaceRisks": runtime["blocked"],
                          "unknownIsolationRisks": runtime["unknown"],
                          "firstLoginVerified": False, "dockerApiLifecycleVerified": False},
        "recommendedNextActions": [
            {"id": "review-host", "title": "Review Ubuntu version, disk and inherited 1Panel paths",
             "command": "python3 scripts/gpupanel-install-preflight.py --human"},
            {"id": "review-isolation", "title": "Audit Core/Agent isolation blockers",
             "command": "python3 scripts/gpupanel-runtime-namespace.py --strict --human"},
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
    parser.add_argument("--human", action="store_true", help="print concise Chinese operator guidance")
    args = parser.parse_args(argv)
    try:
        report = overview(Path("/"), ROOT)
    except (OSError, ValueError, TypeError, catalog.CatalogError) as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    if args.human:
        print("GPUPanel 首次使用检查 | 只读、不安装")
        print(f"Host 阻塞项：{len(report['host']['blockers'])}；运行目录阻塞项："
              f"{report['systemRuntime']['namespaceRisks']}")
        for check in report["host"]["checks"]:
            print(f"  [{check['state']}] {check['code']}: {check['detail']}")
        print("当前可用：Python 标准库项目模板（仅本机 CLI，需要明确批准写入）")
        print("完整 GPUPanel Core/Agent 系统安装：未开放；首次登录和 Docker API 闭环未验收。")
        for step in report["recommendedNextActions"]:
            print(f"  {step['title']}: {step['command']}")
    else:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0  # report is informational: see conclusion, never interpret 0 as installable.


if __name__ == "__main__":
    raise SystemExit(main())
