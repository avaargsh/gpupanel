#!/usr/bin/env python3
"""Read-only ownership and path preflight for GPUPanel service teardown.

This command emits a plan only. The caller must still stop verified services,
re-check stopped state, and report every mutation failure.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

UNIT_NAMES = ("gpupanel-core", "gpupanel-agent")
PRODUCT_FILES = ("pctl", "gpupanel-core", "gpupanel-agent")
CRITICAL_TARGETS = {
    "/", "/etc", "/usr", "/var", "/home", "/root", "/boot", "/proc",
    "/sys", "/dev", "/run", "/bin", "/sbin", "/lib", "/lib64",
}
BASE_RE = re.compile(r"^BASE_DIR=(/[^\r\n]*)$", re.MULTILINE)


class Refusal(RuntimeError):
    pass


def fail(message: str) -> None:
    raise Refusal(message)


def canonical_absolute(raw: str, label: str) -> Path:
    if not raw or not raw.startswith("/") or "\x00" in raw:
        fail(f"{label} must be a non-empty absolute path")
    if raw != os.path.normpath(raw):
        fail(f"{label} must use its normalized absolute spelling")
    return Path(raw)


def check_path_chain(path: Path, *, require_leaf: bool, label: str) -> None:
    if require_leaf and (not path.exists() or path.is_symlink()):
        fail(f"{label} is missing or a symlink")
    chain = [path, *path.parents]
    seen: set[Path] = set()
    for entry in chain:
        if entry in seen:
            continue
        seen.add(entry)
        try:
            info = entry.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode):
            fail(f"symlink in {label} path")
        if not stat.S_ISDIR(info.st_mode):
            fail(f"non-directory ancestor in {label} path")
        allowed_owners = {0, os.getuid()}
        if info.st_uid not in allowed_owners:
            fail(f"untrusted owner in {label} path")
        if info.st_mode & 0o022 and not (
            info.st_uid == 0 and info.st_mode & stat.S_ISVTX
        ):
            fail(f"group/world-writable ancestor in {label} path")


def regular_owned_file(path: Path, label: str) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        fail(f"required {label} is missing")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        fail(f"{label} must be an ordinary, non-symlink file")
    if info.st_uid not in {0, os.getuid()}:
        fail(f"{label} has an unexpected owner")


def verify_unit(path: Path, binary: Path, panel_dir: Path, name: str) -> bool:
    if not path.exists() and not path.is_symlink():
        return False
    regular_owned_file(path, f"{name} unit")
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines.count(f"ExecStart={binary}") != 1:
        fail(f"{name} unit does not uniquely execute the selected installation")
    if lines.count(f"WorkingDirectory={panel_dir}") != 1:
        fail(f"{name} unit working directory does not match selected installation")
    return True


def process_paths(panel_dir: Path) -> list[str]:
    expected = {str(panel_dir / "gpupanel-core"), str(panel_dir / "gpupanel-agent")}
    running: list[str] = []
    proc = Path("/proc")
    if not proc.is_dir():
        fail("cannot independently inspect running process identities")
    for entry in proc.iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            executable = os.readlink(entry / "exe")
        except (FileNotFoundError, PermissionError, ProcessLookupError, OSError):
            continue
        normalized = executable.removesuffix(" (deleted)")
        if normalized in expected:
            running.append(entry.name)
    return sorted(set(running))


def mounted_at(path: Path) -> bool:
    # mountinfo escapes spaces, tabs, newlines and backslashes in field 5.
    decoded = str(path).replace("\\", "\\134").replace(" ", "\\040").replace("\t", "\\011")
    try:
        lines = Path("/proc/self/mountinfo").read_text(encoding="utf-8").splitlines()
    except OSError:
        fail("cannot inspect mount points before purge")
    return any(len(parts := line.split()) > 4 and parts[4] == decoded for line in lines)


def verify_systemd_fragment(unit_dir: Path, name: str) -> None:
    expected = str(unit_dir / f"{name}.service")
    result = subprocess.run(
        ["systemctl", "show", "--property=FragmentPath", "--value", f"{name}.service"],
        capture_output=True, text=True, timeout=8, check=False,
    )
    if result.returncode != 0 or result.stdout.strip() != expected:
        fail(f"systemd {name} fragment does not resolve to the verified unit file")


def verify_systemd_unit_absent(name: str) -> None:
    for action in ("is-active", "is-enabled"):
        result = subprocess.run(
            ["systemctl", action, "--quiet", f"{name}.service"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=False,
        )
        if result.returncode == 0:
            fail(f"systemd {name} is still {action.removeprefix('is-')}")
    result = subprocess.run(
        ["systemctl", "show", "--property=FragmentPath", "--value", f"{name}.service"],
        capture_output=True, text=True, timeout=8, check=False,
    )
    if result.returncode == 0 and result.stdout.strip():
        fail(f"systemd {name} still resolves to another unit fragment")


def build_plan(args: argparse.Namespace) -> dict:
    base = canonical_absolute(args.base_dir, "base-dir")
    panel_dir = base / "gpupanel"
    if str(panel_dir) in CRITICAL_TARGETS:
        fail("refuse to operate on a critical system directory")
    check_path_chain(base, require_leaf=True, label="base-dir")
    if not base.is_dir():
        fail("base-dir is not a directory")
    check_path_chain(panel_dir, require_leaf=True, label="installation")
    if not panel_dir.is_dir():
        fail("installation target is not a directory")
    if panel_dir.is_symlink():
        fail("installation target is a symlink")

    for name in PRODUCT_FILES:
        path = panel_dir / name
        regular_owned_file(path, f"GPUPanel {name}")
        if name != "pctl" and not os.access(path, os.X_OK):
            fail(f"GPUPanel {name} is not executable")

    pctl = panel_dir / "pctl"
    header = pctl.read_text(encoding="utf-8", errors="strict")[:8192]
    assignments = BASE_RE.findall(header)
    if len(assignments) != 1 or assignments[0] != str(base):
        fail("pctl BASE_DIR does not prove ownership of the selected installation")

    unit_dir = canonical_absolute(args.unit_dir, "unit-dir")
    check_path_chain(unit_dir, require_leaf=True, label="unit-dir")
    if not unit_dir.is_dir():
        fail("unit-dir is not a directory")

    unit_files: dict[str, bool] = {}
    for name in UNIT_NAMES:
        unit_files[name] = verify_unit(
            unit_dir / f"{name}.service",
            panel_dir / name,
            panel_dir,
            name,
        )
    if args.units_removed:
        if any(unit_files.values()):
            fail("owned systemd unit files still exist after removal")
        if args.systemd:
            for name in UNIT_NAMES:
                verify_systemd_unit_absent(name)
        running = process_paths(panel_dir)
        if running:
            fail("GPUPanel executable still runs after unit removal")
    elif args.systemd:
        if not all(unit_files.values()):
            fail("systemd uninstall requires both matching owned unit files")
        for name in UNIT_NAMES:
            verify_systemd_fragment(unit_dir, name)
    else:
        running = process_paths(panel_dir)
        if running:
            fail("matching GPUPanel process is running without a verifiable systemd stop path")

    if args.assert_stopped:
        running = process_paths(panel_dir)
        if running:
            fail("GPUPanel executable still runs after the stop request")
    if args.purge:
        if args.confirm_purge != str(panel_dir):
            fail("purge requires --confirm-purge with the exact normalized installation path")
        if mounted_at(panel_dir):
            fail("refuse purge when the installation directory is a mount point")
    elif args.confirm_purge:
        fail("--confirm-purge is valid only together with --purge")

    return {
        "schema": "gpupanel.uninstall-plan.v1",
        "base_dir": str(base),
        "panel_dir": str(panel_dir),
        "verified_unit_names": sorted(name for name, exists in unit_files.items() if exists),
        "systemd_stop_required": bool(args.systemd),
        "data_policy": "DELETE_EXACT_CONFIRMED_PANEL_DIR" if args.purge else "PRESERVE_INSTALLATION_DIRECTORY",
        "ready_to_execute": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-dir", required=True)
    parser.add_argument("--unit-dir", default="/etc/systemd/system")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--systemd", action="store_true")
    modes.add_argument("--no-systemd", action="store_true")
    parser.add_argument("--assert-stopped", action="store_true")
    parser.add_argument("--units-removed", action="store_true")
    parser.add_argument("--purge", action="store_true")
    parser.add_argument("--confirm-purge", default="")
    args = parser.parse_args()
    try:
        plan = build_plan(args)
    except (Refusal, OSError, UnicodeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"schema": "gpupanel.uninstall-plan.v1", "ready_to_execute": False,
                          "reason": str(exc)}, sort_keys=True), file=sys.stderr)
        return 1
    print(json.dumps(plan, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
