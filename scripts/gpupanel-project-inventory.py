#!/usr/bin/env python3
"""Bounded, read-only project discovery across GPUPanel's two local starters.

Receipt discovery is not Core authorization or proof that an environment is
running. Never open arbitrary user project files without a known receipt.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROJECTS = Path.home() / "GPUPanel" / "projects"
LIMIT = 1000
MAX_SOURCE_FILE = 1024 * 1024


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("unavailable reviewed project adapter")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


catalog = load_module("gpupanel_inventory_catalog", ROOT / "scripts/gpupanel-catalog-workspace.py")
uv = load_module("gpupanel_inventory_uv", ROOT / "scripts/gpupanel-uv-project.py")


class InventoryError(Exception):
    pass


def safe_projects_dir(directory: Path, home: Path) -> Path:
    try:
        # The existing user-home containment contract rejects symlink components
        # without creating any parent directories or following project links.
        return catalog.safe_target(directory / ".gpupanel-inventory-check", home).parent
    except catalog.WorkspaceError as exc:
        raise InventoryError("unsafe project inventory root") from exc


def catalog_file_sizes_ok(target: Path) -> bool:
    # Unlike uv's adapter, the older bundled scaffold hashes entire files.
    # Bound every hash input before asking it to check the retained receipt.
    for name in catalog.FILES:
        path = target / name
        try:
            if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_SOURCE_FILE:
                return False
        except OSError:
            return False
    return True


def inventory(directory: Path, home: Path) -> dict:
    folder = safe_projects_dir(directory, home)
    if not folder.exists():
        return {"status": "OK", "readOnly": True, "projects": [],
                "verified": 0, "needsReview": 0}
    if folder.is_symlink() or not folder.is_dir():
        raise InventoryError("project inventory root is not a real directory")
    try:
        children = sorted(folder.iterdir(), key=lambda item: item.name)
    except OSError as exc:
        raise InventoryError("project inventory directory unavailable") from exc
    if len(children) > LIMIT:
        raise InventoryError("project inventory limit exceeded; refusing incomplete listing")

    records = []
    for child in children:
        if child.is_symlink() or not child.is_dir():
            continue
        uv_receipt = child / uv.RECEIPT
        catalog_receipt = child / catalog.RECEIPT
        try:
            has_uv = uv_receipt.exists() or uv_receipt.is_symlink()
            has_catalog = catalog_receipt.exists() or catalog_receipt.is_symlink()
        except OSError:
            continue
        if not (has_uv or has_catalog):
            # Do not read, report, or enumerate files inside unmanaged dirs.
            continue
        if has_uv and has_catalog:
            kind, state = "conflict", "CONFLICT"
        elif has_uv:
            kind = "uv"
            try:
                state = uv.status(child, home)["status"]
            except (OSError, uv.ProjectError):
                state = "UNVERIFIED"
        else:
            kind = "catalog"
            if not catalog_file_sizes_ok(child):
                state = "DRIFT"
            else:
                try:
                    state = catalog.status(child, home)["status"]
                except (OSError, catalog.WorkspaceError, catalog.catalog.CatalogError):
                    state = "UNVERIFIED"
        # A marker in a user-writable directory is a DISCOVERY HINT, not an
        # authenticated identity or permission to start/stop/delete anything.
        records.append({"directory": child.name, "source": kind, "state": state})

    verified = sum(item["state"] in {"VERIFIED", "INSTALLED"} for item in records)
    return {"status": "OK", "readOnly": True, "projects": records,
            "verified": verified, "needsReview": len(records) - verified}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only user-local GPUPanel project inventory")
    parser.add_argument("action", choices=["list"])
    parser.add_argument("--projects-dir", type=Path, default=DEFAULT_PROJECTS)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not sys.platform.startswith("linux") or os.geteuid() == 0:
            raise InventoryError("run as a regular Ubuntu/Linux user")
        result = inventory(args.projects_dir, Path.home())
    except (InventoryError, OSError):
        print("GPUPanel: project inventory unavailable; no changes were made", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("GPUPanel · 我的本地项目（只读）")
        if not result["projects"]:
            print("未找到可识别的 GPUPanel 项目回执")
        for item in result["projects"]:
            print(json.dumps(item["directory"], ensure_ascii=False),
                  "·", item["source"], "·", item["state"])
        print(f"已验证 {result['verified']}；需复核 {result['needsReview']}")
        print("回执不表示项目已运行，也不授予 Core/Agent 写入权限")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
