#!/usr/bin/env python3
"""Real GNOME/Wayland desktop acceptance kit, NO WebKit sandbox bypass.

The kit ships with the unsigned preview archive and needs no repository clone.
Its output is a private LOCAL observation, not an attestation of production
readiness or independent proof. It never runs apt, pkexec or remote Core.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time

MAX_BINARY = 250 * 1024 * 1024
HASH = re.compile(r"^[a-f0-9]{64}$")
TARGET = "GPUPanel · Local Workstation"

def preflight(env: dict[str, str], release: str, *, uid: int,
              runtime_stat, socket_stat) -> dict:
    """Pure validator: injection points are for negative/unit tests only."""
    values = dict(line.split("=", 1) for line in release.splitlines() if "=" in line)
    reasons = []
    if uid == 0:
        reasons.append("ROOT_SESSION")
    if values.get("ID", "").strip('"') != "ubuntu" or values.get("VERSION_ID", "").strip('"') != "24.04":
        reasons.append("UNSUPPORTED_OS")
    if env.get("XDG_SESSION_TYPE", "").lower() != "wayland":
        reasons.append("NOT_WAYLAND_SESSION")
    desktops = env.get("XDG_CURRENT_DESKTOP", "").casefold().split(":")
    if "gnome" not in desktops:
        reasons.append("NOT_GNOME_DESKTOP")
    if env.get("GDK_BACKEND", "").lower() not in ("", "wayland"):
        reasons.append("GTK_NOT_WAYLAND")
    if any(env.get(key) is not None for key in (
        "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS",
        "GPUPANEL_CI_WEBKIT_UNSANDBOXED",
    )):
        reasons.append("WEBKIT_SANDBOX_BYPASS_PRESENT")
    runtime = env.get("XDG_RUNTIME_DIR", "")
    display = env.get("WAYLAND_DISPLAY", "")
    if not runtime.startswith("/") or not display or "/" in display or display in (".", ".."):
        reasons.append("WAYLAND_SOCKET_UNRESOLVED")
    else:
        if (runtime_stat is None or not stat.S_ISDIR(runtime_stat.st_mode)
                or runtime_stat.st_uid != uid or stat.S_ISLNK(runtime_stat.st_mode)
                or (runtime_stat.st_mode & 0o077)):
            # XDG_RUNTIME_DIR must be private to the session user. A shared
            # runtime directory can expose Wayland/DBus sockets to other users.
            reasons.append("UNTRUSTED_RUNTIME_DIR")
        if socket_stat is None or not stat.S_ISSOCK(socket_stat.st_mode):
            reasons.append("WAYLAND_SOCKET_MISSING")
        elif socket_stat.st_uid != uid:
            # The socket lives below the user's private (0700) runtime directory,
            # which prevents other UIDs from traversing to it. Some legitimate
            # Wayland implementations expose permissive socket mode bits; do not
            # mistake those bits for reachability through a private parent path.
            reasons.append("WAYLAND_SOCKET_UNTRUSTED")
    if not env.get("DBUS_SESSION_BUS_ADDRESS", "").startswith("unix:"):
        reasons.append("SESSION_DBUS_UNAVAILABLE")
    return {
        "schema": "gpupanel.gnome-wayland-preflight.v1",
        "status": "ELIGIBLE_FOR_MANUAL_CHECK" if not reasons else "BLOCKED",
        "reasons": reasons,
        "assertions": {
            "ubuntu2404": "UNSUPPORTED_OS" not in reasons,
            "gnome": "NOT_GNOME_DESKTOP" not in reasons,
            "wayland": "NOT_WAYLAND_SESSION" not in reasons and
                       "WAYLAND_SOCKET_MISSING" not in reasons and
                       "WAYLAND_SOCKET_UNRESOLVED" not in reasons,
            "noExplicitSandboxBypass": "WEBKIT_SANDBOX_BYPASS_PRESENT" not in reasons,
        },
        "normalWebkitSandboxVerified": False,
        "realGuiVerified": False,
        "polkitVerified": False,
        "completeRestoreVerified": False,
    }


def current_preflight() -> dict:
    env = dict(os.environ)
    runtime = env.get("XDG_RUNTIME_DIR", "")
    display = env.get("WAYLAND_DISPLAY", "")
    def safe_stat(path: str):
        try:
            return os.lstat(path)
        except OSError:
            return None
    runtime_stat = safe_stat(runtime) if runtime else None
    socket_stat = safe_stat(str(Path(runtime) / display)) if (
        runtime.startswith("/") and display and "/" not in display) else None
    try:
        release = Path("/etc/os-release").read_text(encoding="utf-8")
    except OSError:
        release = ""
    return preflight(env, release, uid=os.geteuid(),
                     runtime_stat=runtime_stat, socket_stat=socket_stat)


def reviewed_binary(binary: Path, expected: str) -> dict:
    if not HASH.fullmatch(expected):
        raise ValueError("invalid reviewed executable SHA-256")
    if binary.is_symlink() or not binary.is_file():
        raise ValueError("missing/symlinked preview binary")
    info = binary.stat()
    if info.st_size < 1 or info.st_size > MAX_BINARY or not (info.st_mode & 0o100):
        raise ValueError("invalid preview executable size/mode")
    digest = hashlib.sha256()
    with binary.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        raise ValueError("installed binary differs from reviewed artifact")
    return {"binaryHashMatched": True, "binarySHA256": expected}


def yes_no(question: str) -> bool:
    while True:
        answer = input(question + " [y/N] ").strip().lower()
        if answer in ("", "n", "no"): return False
        if answer in ("y", "yes"): return True
        print("Enter y or n only.")


def private_report(report: dict, home: Path) -> Path:
    # Never include environment variables, usernames, terminal output, or
    # application logs in the report. Treat even this as user-owned data.
    root = home / "GPUPanel"
    dest = root / "acceptance"
    for path in (root, dest):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError("linked or unsafe acceptance directory")
        path.mkdir(mode=0o700, exist_ok=True)
        # mkdir(mode=...) does not tighten permissions on an existing directory.
        # Fail closed rather than writing evidence into a shared/user-mismatched path.
        info = os.lstat(path)
        if (not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode)
                or info.st_uid != os.geteuid() or (info.st_mode & 0o077)):
            raise ValueError("acceptance directory must be owned by this user and mode 0700")
    filename = "gnome-wayland-" + time.strftime("%Y%m%dT%H%M%S", time.gmtime()) + ".json"
    target = dest / filename
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(report, output, sort_keys=True, ensure_ascii=False, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    return target


def run_manual(binary: Path, pre: dict, *, expected: str) -> int:
    if pre["status"] != "ELIGIBLE_FOR_MANUAL_CHECK":
        print("REFUSED: preflight BLOCKED; do not run a GUI with sandbox bypass.", file=sys.stderr)
        return 3
    metadata = reviewed_binary(binary, expected)
    checks: dict[str, str] = {
        "visibleChineseWebview": "NOT_RUN",
        "menuActivation": "NOT_RUN",
        "terminalCorrectProject": "NOT_RUN",
        "editorCorrectProject": "NOT_RUN",
        "polkitAllowDeny": "NOT_RUN",
        "persistenceAfterReboot": "NOT_RUN",
    }
    # Never propagate CI's deliberate bypass into a real user session.
    env = dict(os.environ)
    if any(k in env for k in ("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS",
                             "GPUPANEL_CI_WEBKIT_UNSANDBOXED")):
        raise ValueError("WebKit sandbox bypass detected")
    print("Opening GPUPanel Desktop directly in the current real GNOME/Wayland session.")
    print("WebKit sandbox bypass is NOT enabled. If it fails, record failure, don't bypass.")
    process = subprocess.Popen([str(binary)], cwd=Path.home(), env=env,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(5)
        alive = process.poll() is None
        if alive:
            checks["visibleChineseWebview"] = (
                "OPERATOR_CONFIRMED" if yes_no(
                    "Can you see and operate the GPUPanel Chinese window?") else "FAILED_OR_DECLINED"
            )
        else:
            checks["visibleChineseWebview"] = "PROCESS_EXITED"
        print("The following are manual observations. No privileged apt/Polkit operation is launched.")
        if checks["visibleChineseWebview"] == "OPERATOR_CONFIRMED":
            print("If you installed the menu entry earlier, test it via GNOME Activities manually.")
            checks["menuActivation"] = (
                "OPERATOR_CONFIRMED" if yes_no("Does the user menu entry launch the reviewed app?")
                else "NOT_CONFIRMED"
            )
            print("Open an existing project through the native Terminal/IDE buttons.")
            for name, prompt in (
                ("terminalCorrectProject", "Did the terminal open at the selected project?"),
                ("editorCorrectProject", "Did the editor open the selected project?"),
            ):
                checks[name] = "OPERATOR_CONFIRMED" if yes_no(prompt) else "NOT_CONFIRMED"
        print("Polkit allow/deny and persistence across reboot require independent test sessions.")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
    report = {
        "schema": "gpupanel.gnome-wayland-manual.v1",
        "preflight": pre,
        "executable": metadata,
        "processAliveAfter5Seconds": alive,
        "operatorObservations": checks,
        "status": "RECORDED_REQUIRES_INDEPENDENT_REVIEW",
        "independentReview": "NOT_PERFORMED",
        "productionAcceptance": "NOT_PROVEN",
    }
    path = private_report(report, Path.home())
    print("Private evidence recorded locally:", path)
    print("No automatic PASS, signed release or independent sandbox proof is claimed.")
    return 0 if alive else 4


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preflight", action="store_true",
                        help="read-only GNOME/Wayland preflight; no files written")
    parser.add_argument("--run", action="store_true",
                        help="interactive local GUI observations, private report")
    parser.add_argument("--binary", type=Path,
                        help="absolute or relative path of preview executable")
    parser.add_argument("--expected-sha256", default="",
                        help="reviewed SHA-256 from the archive's build/binary.sha256")
    args = parser.parse_args()
    if args.preflight == args.run:
        parser.error("select exactly one of --preflight or --run")
    pre = current_preflight()
    if args.preflight:
        print(json.dumps(pre, sort_keys=True, ensure_ascii=False, indent=2))
        return 0 if pre["status"] == "ELIGIBLE_FOR_MANUAL_CHECK" else 3
    if not args.binary or not args.expected_sha256:
        parser.error("--run requires --binary and --expected-sha256")
    try:
        # Keep the final path component intact: resolve() would erase evidence that it is a symlink.
        return run_manual(args.binary.absolute(), pre, expected=args.expected_sha256)
    except (OSError, ValueError) as exc:
        print("GNOME_ACCEPTANCE_REFUSED:", str(exc), file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
