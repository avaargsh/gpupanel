#!/usr/bin/env python3
"""Explicit non-root, user-local adapter for a GPUPanel Workspace intent.

This is NOT a remote Agent endpoint. Possessing JSON is not authorization:
an interactive OS user must also approve both exact digests. It cannot update
Core state, impersonate users, invoke user code, or provision GPU sessions.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
FORMAT = "uv-python-stdlib-offline-v1"
STATE = "AwaitingHostBinding"
MAX_INPUT = 16384
SHA = re.compile(r"^[0-9a-f]{64}$")

spec = importlib.util.spec_from_file_location(
    "gpupanel_intent_local_uv", ROOT / "scripts/gpupanel-uv-project.py"
)
uv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uv)


class IntentError(Exception):
    pass


def identity_home() -> Path:
    if not sys.platform.startswith("linux") or os.getuid() == 0 or os.geteuid() == 0:
        raise IntentError("a non-root Linux user must run this command")
    if os.getuid() != os.geteuid():
        raise IntentError("setuid or impersonated execution is forbidden")
    home = Path.home().absolute()
    actual = Path(pwd.getpwuid(os.getuid()).pw_dir).absolute()
    if home != actual or home.is_symlink() or not home.is_dir():
        raise IntentError("HOME must be the current OS user's real home")
    return home


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise IntentError("duplicate JSON keys are not allowed")
        result[key] = value
    return result


def read_intent_file(source: Path) -> dict:
    # O_NOFOLLOW and fstat avoid opening attacker-provided symlinks or FIFOs.
    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NONBLOCK | os.O_NOFOLLOW
    try:
        fd = os.open(source, flags)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
                raise IntentError("intent file must be a regular file owned by the current user")
            if info.st_size > MAX_INPUT:
                raise IntentError("intent file is too large")
            raw = os.read(fd, MAX_INPUT + 1)
            if len(raw) > MAX_INPUT:
                raise IntentError("intent file exceeded the read limit")
        finally:
            os.close(fd)
    except OSError as exc:
        raise IntentError("intent file unavailable or unsafe") from exc
    try:
        response = json.loads(raw.decode("utf-8"), object_pairs_hook=no_duplicates)
    except (ValueError, UnicodeError) as exc:
        raise IntentError("invalid intent JSON") from exc
    if isinstance(response, dict) and "data" in response:
        if response.get("code") != 200:
            raise IntentError("Core response is not successful")
        response = response["data"]
    if not isinstance(response, dict):
        raise IntentError("missing Core plan object")
    return validate_plan(response)


def canonical(value) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return str(uuid.UUID(value)) == value
    except ValueError:
        return False


def digest(project: str, workspace: str) -> str:
    data = ("GPUPanel-workspace-intent-v1\n" +
            project + "\n" + workspace + "\n" + FORMAT + "\n")
    return hashlib.sha256(data.encode("ascii")).hexdigest()


def validate_plan(plan: dict) -> dict:
    project, workspace = plan.get("projectId"), plan.get("workspaceId")
    if not canonical(project) or not canonical(workspace):
        raise IntentError("project and workspace must be canonical UUIDs")
    expected = digest(project, workspace)
    if (plan.get("profile") != FORMAT or plan.get("planDigest") != expected or
            plan.get("workspaceState") != "NotProvisioned" or
            plan.get("executionAvailable") is not False or
            plan.get("blocker") != "HostRunnerUnbound"):
        raise IntentError("Core plan contract is incompatible or stale")
    intent = plan.get("intent")
    if not isinstance(intent, dict) or not canonical(intent.get("id")):
        raise IntentError("an approved persisted intent is required")
    if (intent.get("state") != STATE or intent.get("projectId") != project or
            intent.get("workspaceId") != workspace or intent.get("profile") != FORMAT or
            intent.get("planDigest") != expected):
        raise IntentError("Core intent is not bound to the reviewed plan")
    return {"projectId": project, "workspaceId": workspace,
            "intentId": intent["id"], "planDigest": expected}


def workspace_target(home: Path, workspace: str) -> Path:
    # No arbitrary target, user-provided name or relative path is accepted.
    # The workspace ID is the sole deterministic filesystem namespace.
    return uv.safe_target(home / "GPUPanel" / "projects" / ("workspace-" + workspace), home)


def inspect(plan: dict, home: Path, *, uv_path: str | None = None) -> dict:
    target = workspace_target(home, plan["workspaceId"])
    if target.exists() or target.is_symlink():
        observed = uv.status(target, home)
        # An existing uv scaffold is not cryptographically bound to this
        # Core intent. Never adopt or auto-delete it, even when VERIFIED.
        return {"status": "EXISTS_REQUIRES_REVIEW", "localUvState": observed["status"],
                "intentId": plan["intentId"], "executed": False,
                "coreWorkspaceState": "NotProvisioned"}
    preview = uv.options(target, home, uv_path=uv_path)
    return {"status": preview["status"], "target": str(target),
            "planDigest": plan["planDigest"],
            "uvPlanDigest": preview.get("planDigest"),
            "intentId": plan["intentId"], "executed": False,
            "coreWorkspaceState": "NotProvisioned"}


def apply(plan: dict, home: Path, plan_approval: str, uv_approval: str,
          *, uv_path: str | None = None, runner=None) -> dict:
    preview = inspect(plan, home, uv_path=uv_path)
    if preview["status"] != "READY_FOR_APPROVAL":
        return preview
    if (plan_approval != plan["planDigest"] or
            uv_approval != preview["uvPlanDigest"] or
            not SHA.fullmatch(plan_approval) or not SHA.fullmatch(uv_approval)):
        return {"status": "APPROVAL_MISMATCH", "executed": False,
                "coreWorkspaceState": "NotProvisioned"}
    # The reviewed uv generator itself enforces no-root, offline, staging,
    # symlink checks and renameat2(RENAME_NOREPLACE) atomic publication.
    kwargs = {"uv_path": uv_path if uv_path is not None else None}
    if runner is not None:
        kwargs["runner"] = runner
    result = uv.create(workspace_target(home, plan["workspaceId"]), home, True, **kwargs)
    if result["status"] != "VERIFIED":
        return {"status": result["status"], "executed": result.get("executed", False),
                "coreWorkspaceState": "NotProvisioned"}
    checked = uv.status(workspace_target(home, plan["workspaceId"]), home)
    if checked["status"] != "VERIFIED":
        return {"status": "POST_CREATE_UNVERIFIED", "executed": True,
                "coreWorkspaceState": "NotProvisioned"}
    return {"status": "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED",
            "intentId": plan["intentId"], "executed": True,
            "coreWorkspaceState": "NotProvisioned",
            "note": "Independent Core owner/session/runner attestation is still required"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Non-root local runner for an approved Workspace intent")
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "apply", "status"):
        cmd = commands.add_parser(name)
        cmd.add_argument("--intent-file", type=Path, required=True)
        cmd.add_argument("--json", action="store_true")
        if name == "apply":
            cmd.add_argument("--approve-plan", required=True)
            cmd.add_argument("--approve-uv", required=True)
    args = parser.parse_args(argv)
    try:
        home = identity_home()
        plan = read_intent_file(args.intent_file)
        if args.command == "apply":
            result = apply(plan, home, args.approve_plan, args.approve_uv)
        else:
            result = inspect(plan, home)
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            print("GPUPanel · local non-root Workspace runner")
            print("State:", result["status"])
            print("Core Workspace: NotProvisioned (not remotely reconciled)")
            if "target" in result:
                print("Local target:", result["target"])
            if result.get("uvPlanDigest"):
                print("Confirm Core plan:", result["planDigest"])
                print("Confirm local uv plan:", result["uvPlanDigest"])
            if args.command == "plan":
                print("An explicit terminal approval is required; never invoke through Core/root.")
        return 0 if result["status"] in {"READY_FOR_APPROVAL",
                                         "LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED"} else 2
    except (IntentError, uv.ProjectError, OSError, TypeError, KeyError):
        print("GPUPanel: local intent refused; do not force, adopt or overwrite user data",
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
