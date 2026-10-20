#!/usr/bin/env python3
"""Ubuntu local workstation: inspect -> approve -> restore/install (no Core/Docker)."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE = ROOT / "profiles/ubuntu24-workstation.v1.json"
CONFIG = Path.home() / ".config/gpupanel/workstation-profile.json"
APT_ALLOWLIST = {"git", "curl", "build-essential", "python3-venv", "pkg-config"}
MIRRORS = {"UV_DEFAULT_INDEX", "npm_config_registry", "GOPROXY"}
MAX_BYTES = 16 * 1024


class WorkstationError(Exception):
    pass


def canonical(profile):
    return (json.dumps(profile, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")) + "\n").encode()


def digest(profile):
    return hashlib.sha256(canonical(profile)).hexdigest()


def load(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise WorkstationError("profile missing, linked or oversized")
    try:
        p = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        raise WorkstationError("invalid profile JSON") from exc
    if (not isinstance(p, dict) or
            set(p) != {"formatVersion", "id", "os", "aptPackages", "tools", "mirrors"} or
            p["formatVersion"] != 1 or p["id"] != "ubuntu24-local-dev" or p["os"] != "ubuntu-24.04"):
        raise WorkstationError("unsupported profile")
    packages = p["aptPackages"]
    if (not isinstance(packages, list) or len(packages) > 10 or
            len(packages) != len(set(map(str, packages))) or
            any(not isinstance(x, str) or x not in APT_ALLOWLIST for x in packages)):
        raise WorkstationError("unreviewed apt packages")
    tools = p["tools"]
    if not isinstance(tools, list) or not 0 < len(tools) <= 32:
        raise WorkstationError("invalid tools")
    seen = set()
    for tool in tools:
        if (not isinstance(tool, dict) or set(tool) != {"name", "command", "required"} or
                not isinstance(tool["name"], str) or not 1 <= len(tool["name"]) <= 50 or
                not isinstance(tool["command"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,35}", tool["command"]) or
                type(tool["required"]) is not bool or tool["command"] in seen):
            raise WorkstationError("invalid tool")
        seen.add(tool["command"])
    if not isinstance(p["mirrors"], dict) or set(p["mirrors"]) != MIRRORS:
        raise WorkstationError("invalid mirrors")
    for value in p["mirrors"].values():
        if (not isinstance(value, str) or len(value) > 200 or
                not value.startswith("https://") or
                any(ch in value for ch in ("@", "#", "'", '"', "\\", "\n", "\r", " ", ";", "\t"))):
            raise WorkstationError("only HTTPS mirrors without credentials are allowed")
        u = urlsplit(value)
        if not u.hostname or u.username or u.password or u.query or u.fragment:
            raise WorkstationError("invalid mirror URL")
    return p


def ubuntu24():
    try:
        lines = dict(line.split("=", 1) for line in
                     Path("/etc/os-release").read_text().splitlines() if "=" in line)
        return lines.get("ID", "").strip('"') == "ubuntu" and lines.get("VERSION_ID", "").strip('"') == "24.04"
    except OSError:
        return False


def installed(package, runner=subprocess.run):
    try:
        result = runner(["dpkg-query", "-W", "-f=" + "$" + "{Status}", package],
                        capture_output=True, text=True, timeout=8, check=False)
        return result.returncode == 0 and result.stdout.strip() == "install ok installed"
    except (OSError, subprocess.TimeoutExpired):
        return False


def inspect(profile, *, which=shutil.which, runner=subprocess.run, os_ok=None):
    os_ok = ubuntu24() if os_ok is None else os_ok
    return {
        "status": "READY" if os_ok else "UNSUPPORTED_OS",
        "requires": {"docker": False, "core": False, "kubernetes": False},
        "profileDigest": digest(profile),
        "tools": [{"name": t["name"], "command": t["command"], "required": t["required"],
                   "available": bool(which(t["command"]))} for t in profile["tools"]],
        "apt": {"manager": "apt", "previewOnly": True,
                "missing": [pkg for pkg in profile["aptPackages"] if not installed(pkg, runner)]},
        "mirrors": profile["mirrors"],
    }


def install_plan(profile, *, runner=subprocess.run, os_ok=None):
    observed = inspect(profile, runner=runner, os_ok=os_ok)
    missing = observed["apt"]["missing"]
    args = ["/usr/bin/apt-get", "install", "--no-install-recommends", "-y", *missing]
    plan = {"profileDigest": digest(profile), "missing": missing, "aptArgs": args}
    state = ("UNSUPPORTED_OS" if observed["status"] != "READY" else
             ("ALREADY_INSTALLED" if not missing else "READY_FOR_APPROVAL"))
    return {"status": state, "planDigest": hashlib.sha256(canonical(plan)).hexdigest(),
            "command": ["pkexec", *args] if missing else [],
            "note": "Uses the operator's configured apt sources; versions are not pinned"}


def install_apt(profile, approved, *, runner=subprocess.run, os_ok=None):
    plan = install_plan(profile, runner=runner, os_ok=os_ok)
    if plan["status"] != "READY_FOR_APPROVAL" or approved != plan["planDigest"]:
        return {"status": "REFUSED_PLAN_MISMATCH", "executed": False}
    if os.geteuid() == 0 or not shutil.which("pkexec"):
        return {"status": "POLKIT_UNAVAILABLE", "executed": False}
    try:
        completed = runner(plan["command"], capture_output=True, text=True,
                           timeout=240, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return {"status": "UNKNOWN", "executed": True, "hint": "Inspect dpkg state before retry"}
    observed = [pkg for pkg in profile["aptPackages"] if installed(pkg, runner)]
    return {"status": "VERIFIED" if completed.returncode == 0 and
            len(observed) == len(profile["aptPackages"]) else "UNKNOWN",
            "executed": True, "installed": observed, "hint": "On UNKNOWN inspect apt logs, no auto-retry"}


def restore(profile, approved, *, config=None, home=None):
    home = home or Path.home()
    config = config or home / ".config/gpupanel/workstation-profile.json"
    if config != home / ".config/gpupanel/workstation-profile.json" or config.is_symlink():
        raise WorkstationError("unsafe profile destination")
    for parent in (home / ".config", home / ".config/gpupanel"):
        if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
            raise WorkstationError("unsafe profile parent")
    if approved != digest(profile):
        return {"status": "APPROVAL_REQUIRED", "profileDigest": digest(profile)}
    data = canonical(profile)
    if config.exists():
        return {"status": "VERIFIED_EXISTING" if config.is_file() and
                config.read_bytes() == data else "CONFLICT_NO_OVERWRITE", "path": str(config)}
    if os.geteuid() == 0:
        return {"status": "ROOT_REFUSED"}
    config.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    if config.parent.is_symlink():
        raise WorkstationError("unsafe destination parent")
    try:
        fd = os.open(config, os.O_CREAT | os.O_EXCL | os.O_WRONLY |
                     getattr(os, "O_NOFOLLOW", 0), 0o600)
    except FileExistsError:
        return {"status": "CONFLICT_NO_OVERWRITE"}
    with os.fdopen(fd, "wb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    return {"status": "VERIFIED" if config.read_bytes() == data else "UNKNOWN",
            "path": str(config)}


def env_lines(profile):
    return "\n".join("export " + key + "='" + val + "'" for key, val
                     in sorted(profile["mirrors"].items()))


def devpod_plan(project, *, which=shutil.which, home=None):
    home = home or Path.home()
    root = home / "GPUPanel/projects"
    if (project.is_symlink() or not project.is_dir() or project == root or
            not project.is_relative_to(root) or
            any(p.is_symlink() for p in project.parents if p != home)):
        return {"status": "INVALID_PROJECT", "command": []}
    missing = [name for name in ("devpod", "docker") if not which(name)]
    if missing:
        return {"status": "OPTIONAL_PROVIDER_MISSING", "missing": missing, "command": []}
    manifest = project / ".devcontainer/devcontainer.json"
    if manifest.is_symlink() or not manifest.is_file():
        return {"status": "NO_DEVCONTAINER", "command": []}
    return {"status": "READY_FOR_PROVIDER_CHECK",
            "command": ["devpod", "up", str(project), "--ide", "openvscode"],
            "note": "Does not execute; provider and runtime require independent verification"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="GPUPanel offline-first Ubuntu workstation")
    parser.add_argument("--profile", type=Path)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("doctor", "plan", "install-plan", "install", "restore", "env", "export", "devpod-plan"):
        action = sub.add_parser(name)
        if name in ("install", "restore"):
            action.add_argument("--approve-digest", default="")
        if name == "export":
            action.add_argument("destination", type=Path)
        if name == "devpod-plan":
            action.add_argument("project", type=Path)
    args = parser.parse_args(argv)
    try:
        p = load(args.profile or (CONFIG if CONFIG.exists() else DEFAULT_PROFILE))
        if args.command in ("doctor", "plan"):
            result = inspect(p)
        elif args.command == "install-plan":
            result = install_plan(p)
        elif args.command == "install":
            result = install_apt(p, args.approve_digest)
        elif args.command == "restore":
            result = restore(p, args.approve_digest)
        elif args.command == "env":
            print(env_lines(p))
            return 0
        elif args.command == "devpod-plan":
            result = devpod_plan(args.project)
        else:
            target = args.destination
            if target.exists() or target.is_symlink() or target.parent.is_symlink():
                raise WorkstationError("export destination exists or is linked")
            with target.open("xb") as file:
                file.write(canonical(p))
            result = {"status": "EXPORTED", "path": str(target), "profileDigest": digest(p)}
        print(json.dumps(result, indent=2, ensure_ascii=False))
        success = {"READY", "READY_FOR_APPROVAL", "VERIFIED", "VERIFIED_EXISTING",
                   "EXPORTED", "ALREADY_INSTALLED", "READY_FOR_PROVIDER_CHECK"}
        return 0 if result["status"] in success else 2
    except (WorkstationError, OSError, ValueError) as exc:
        print(json.dumps({"status": "REFUSED", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
