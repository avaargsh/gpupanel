#!/usr/bin/env python3
"""Read-only collision preflight for future GPUPanel Ubuntu single-host installer.

This checker does not install or modify any services. Even a PASS is not a
production installer approval: runtime namespace isolation is not yet done.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import stat
import sys

MIN_FREE_BYTES = 5 * 1024 ** 3
OLD_PATHS = ("usr/local/bin/1pctl", "etc/1panel", "opt/1panel",
             "usr/local/bin/1panel", "usr/local/bin/1panel-agent",
             "etc/systemd/system/1panel.service", "etc/systemd/system/1panel-agent.service")


def read_os_release(root: Path) -> tuple[str, str]:
    path = root / "etc/os-release"
    try:
        rows = {}
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                rows[k] = v.strip('" ')
        return rows.get("ID", "unknown"), rows.get("VERSION_ID", "unknown")
    except OSError:
        return "unknown", "unknown"


def inspect_host(root: Path, free_bytes: int | None = None) -> dict:
    """Only reads metadata; injectable hostroot/space make CI hermetic."""
    os_id, version = read_os_release(root)
    checks = []
    def add(code: str, state: str, detail: str, action: str) -> None:
        checks.append({"code": code, "state": state, "detail": detail, "next_action": action})
    if (os_id, version) == ("ubuntu", "24.04"):
        add("operating_system", "PASS", "Ubuntu 24.04", "No action")
    else:
        add("operating_system", "BLOCKED", f"Detected {os_id} {version}",
            "Use a disposable Ubuntu 24.04 VM; other OS versions are not validated")
    collisions = ["/" + name for name in OLD_PATHS if (root / name).exists() or (root / name).is_symlink()]
    if collisions:
        add("runtime_collision", "BLOCKED", "Legacy 1Panel runtime paths exist: " + ", ".join(collisions),
            "Do not overwrite existing 1Panel; require backup, namespace isolation and a migration/rollback plan")
    else:
        add("runtime_collision", "PASS", "No known legacy 1Panel paths detected",
            "This does not prove GPUPanel services can safely start")
    if free_bytes is None:
        try:
            free_bytes = shutil.disk_usage(root).free
        except OSError:
            free_bytes = None
    if free_bytes is None:
        add("disk_space", "UNKNOWN", "Cannot determine free disk space",
            "Inspect disk capacity manually")
    elif free_bytes < MIN_FREE_BYTES:
        add("disk_space", "BLOCKED", f"Free bytes {free_bytes}, minimum {MIN_FREE_BYTES}",
            "Free space or choose another test disk before building or installing")
    else:
        add("disk_space", "PASS", f"Free bytes {free_bytes}",
            "Keep sufficient capacity for data, images and rollback")
    if root == Path("/"):
        service_manager = shutil.which("systemctl") is not None
        docker_cli = shutil.which("docker") is not None
        try:
            pid1 = Path("/proc/1/comm").read_text().strip()
        except OSError:
            pid1 = "unknown"
        if service_manager and pid1 == "systemd":
            add("service_manager", "PASS", "systemd detected", "Service install still requires a separately reviewed unit file")
        else:
            add("service_manager", "UNKNOWN", f"systemctl={service_manager}, pid1={pid1}",
                "Use a systemd-managed host; containers and WSL need separate validation")
        socket_path = root / "var/run/docker.sock"
        socket_exists = socket_path.exists()
        if docker_cli and socket_exists:
            add("docker", "UNKNOWN", "Docker CLI and socket are present; daemon health is NOT verified",
                "Confirm Docker engine health and access permissions after explicit setup")
        elif docker_cli:
            add("docker", "UNKNOWN", "Docker CLI found but daemon socket absent",
                "Install or start Docker explicitly and check permissions")
        else:
            add("docker", "UNKNOWN", "Docker CLI is not found",
                "Docker is optional for preflight; needed for the future Host→Docker Golden Path")
    else:
        add("service_manager", "UNKNOWN", "Fixture root; host services not inspected", "Inspect the actual host")
        add("docker", "UNKNOWN", "Fixture root; Docker not inspected", "Inspect the actual host")
    blockers = [x["code"] for x in checks if x["state"] == "BLOCKED"]
    return {"product": "GPUPanel", "phase": "pre-install-diagnostics-only",
            "installable": False, "safe_to_install": False, "blockers": blockers, "checks": checks,
            "note": "Read-only checks do not establish first-login or Docker lifecycle readiness"}


def present(result: dict, json_output: bool) -> None:
    if json_output:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    print("GPUPanel | Single-host installation preflight (READ ONLY)")
    for check in result["checks"]:
        print(f"[{check['state']}] {check['code']}: {check['detail']}")
        if check["state"] != "PASS":
            print(f"         Next: {check['next_action']}")
    print("No host configuration was modified.")
    print("This is NOT a GPUPanel installer; a passing report is not production readiness.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel collision/OS/disk preflight (never installs)")
    parser.add_argument("--json", action="store_true", help="machine-readable output")
    args = parser.parse_args(argv)
    result = inspect_host(Path("/"))
    present(result, args.json)
    return 2 if result["blockers"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
