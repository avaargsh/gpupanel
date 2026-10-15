#!/usr/bin/env python3
"""Explicit, isolated Docker lifecycle smoke on a disposable container.

No image pulls, privileged containers, mounts or network access. This is a
Docker-engine integration probe, not GPUPanel HTTP/API acceptance.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import uuid

IMAGE = re.compile(r"^[a-z0-9][a-z0-9./:_-]{0,250}@sha256:[0-9a-f]{64}$")
LOCAL_IMAGE_ID = re.compile(r"^sha256:[0-9a-f]{64}$")
MARKER = "gpupanel-disposable-smoke-ok"
TIMEOUT = 25


class SmokeError(Exception):
    pass


def command(executable: str, *args: str, runner=subprocess.run) -> str:
    try:
        result = runner([executable, *args], text=True, capture_output=True,
                        timeout=TIMEOUT, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SmokeError("Docker CLI command failed or timed out") from exc
    if result.returncode != 0:
        # Docker stderr can contain host paths, registry auth and server details.
        raise SmokeError(f"Docker command {args[0]} failed (exit {result.returncode})")
    return result.stdout.strip()


def validate_image(value: str) -> str:
    if not IMAGE.fullmatch(value) and not LOCAL_IMAGE_ID.fullmatch(value):
        raise SmokeError("provide a local sha256:image-id or image@sha256 digest, never a mutable tag")
    return value


def smoke(image: str, approved: bool, executor=command, fixture_entrypoint: bool = False) -> dict:
    image = validate_image(image)
    if fixture_entrypoint and not LOCAL_IMAGE_ID.fullmatch(image):
        raise SmokeError("fixture entrypoint requires a locally built immutable image ID")
    checks = ["docker info", "docker image inspect (local only)",
              "docker create --pull=never --network=none --read-only --cap-drop=ALL",
              "docker start", "docker logs", "docker inspect exit code", "docker rm"]
    if not approved:
        return {"status": "APPROVAL_REQUIRED", "image": image, "checks": checks,
                "networkDisabled": True, "hostMounts": False, "executed": False}
    if os.geteuid() == 0:
        raise SmokeError("refuse to run Docker acceptance as root")
    binary = shutil.which("docker")
    if not binary:
        raise SmokeError("Docker CLI not found")
    # Docker context is operator-configured. This never installs or starts a daemon.
    executor(binary, "info", "--format", "{{.ServerVersion}}")
    resolved_id = executor(binary, "image", "inspect", "--format", "{{.Id}}", image)
    if LOCAL_IMAGE_ID.fullmatch(image) and resolved_id.strip() != image:
        raise SmokeError("local image ID changed or did not match requested digest")
    name = "gpupanel-accept-" + uuid.uuid4().hex[:16]
    created = False
    cleanup_error = False
    error = None
    try:
        args = ("create", "--pull=never", "--name", name, "--network=none",
                "--read-only", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
                "--pids-limit", "32", "--memory", "128m", "--cpus", "0.5")
        if fixture_entrypoint:
            args += ("--entrypoint", "/gpupanel-smoke", image)
        else:
            args += ("--entrypoint", "/bin/sh", image, "-c", "printf " + MARKER)
        executor(binary, *args)
        created = True
        executor(binary, "start", name)
        logs = executor(binary, "logs", name)
        exit_code = executor(binary, "inspect", "--format", "{{.State.ExitCode}}", name)
        if MARKER not in logs or exit_code.strip() != "0":
            raise SmokeError("container output or exit code did not match smoke contract")
    except SmokeError as exc:
        error = exc
    finally:
        if created:
            try:
                executor(binary, "rm", "-f", name)
            except SmokeError:
                cleanup_error = True
    if cleanup_error:
        raise SmokeError("disposable container cleanup failed; inspect Docker resources")
    if error is not None:
        raise error
    return {"status": "PASSED", "checks": checks, "containerRemoved": True,
            "image": image, "networkDisabled": True, "executed": True,
            "scope": "Docker engine only; GPUPanel API not tested"}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel Docker engine disposable lifecycle smoke")
    parser.add_argument("--image", required=True, help="locally available immutable image@sha256 digest")
    parser.add_argument("--approve", action="store_true", help="explicitly create and remove disposable container")
    parser.add_argument("--fixture-entrypoint", action="store_true",
                        help="CI only: run /gpupanel-smoke in locally built immutable image")
    args = parser.parse_args(argv)
    try:
        result = smoke(args.image, args.approve, fixture_entrypoint=args.fixture_entrypoint)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] == "PASSED" else 2
    except SmokeError as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
