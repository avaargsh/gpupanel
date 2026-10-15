#!/usr/bin/env python3
"""Opt-in, strictly read-only Docker container snapshot for Host diagnostics.

No Docker create/start/stop/exec, network downloads, persistent files, or
GPUPanel API claims. Docker read access itself is privileged; scope to an
operator-authorized disposable host. Never print raw logs or Docker env vars.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import selectors
import shutil
import subprocess
import sys
import time

TIMEOUT_SECONDS = 8
MAX_CAPTURE_BYTES = 2 * 1024 * 1024
TAIL_LINES = 40
CONTAINER_REF = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
CONTAINER_ID = re.compile(r"^[0-9a-f]{64}$")
SAFE_NAME = re.compile(r"^/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
SIGNALS = {"out_of_memory": (b"out of memory", b"oomkilled"),
           "permission_denied": (b"permission denied",),
           "connection_refused": (b"connection refused",),
           "error_word": (b"error",)}
INSPECT_TEMPLATE = '{"id":{{json .Id}},"name":{{json .Name}},"state":{{json .State}}}'


class InvestigationError(Exception):
    """Safe error strings, never include Docker stdout/stderr."""


def bounded_command(executable: str, *args: str) -> bytes:
    """Capture at most 2 MiB across both streams within a hard time budget."""
    process = None
    try:
        # Docker logs may put container stderr on the CLI's stderr stream.
        # Merge streams *only* for logs; failures are still sanitized by exit code.
        merged_logs = bool(args) and args[0] == "logs"
        process = subprocess.Popen([executable, *args], stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT if merged_logs else subprocess.PIPE,
                                   close_fds=True)
        start = time.monotonic()
        outputs = {"stdout": bytearray(), "stderr": bytearray()}
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ, "stdout")
            if process.stderr is not None:
                selector.register(process.stderr, selectors.EVENT_READ, "stderr")
            total = 0
            while selector.get_map():
                remaining = TIMEOUT_SECONDS - (time.monotonic() - start)
                if remaining <= 0:
                    raise InvestigationError("Docker command timed out")
                events = selector.select(remaining)
                if not events:
                    raise InvestigationError("Docker command timed out")
                for key, _ in events:
                    block = os.read(key.fileobj.fileno(), min(65536, MAX_CAPTURE_BYTES - total + 1))
                    if not block:
                        selector.unregister(key.fileobj)
                        continue
                    total += len(block)
                    if total > MAX_CAPTURE_BYTES:
                        raise InvestigationError("Docker output exceeded the 2 MiB capture limit")
                    outputs[key.data].extend(block)
        remaining = max(0.001, TIMEOUT_SECONDS - (time.monotonic() - start))
        if process.wait(timeout=remaining) != 0:
            raise InvestigationError("Docker read-only command failed (permissions, context or resource)")
        return bytes(outputs["stdout"])
    except subprocess.TimeoutExpired as exc:
        raise InvestigationError("Docker command timed out") from exc
    except OSError as exc:
        raise InvestigationError("Docker CLI could not be executed") from exc
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait()
            if process.stdout is not None:
                process.stdout.close()
            if process.stderr is not None:
                process.stderr.close()


def container_ref(value: str) -> str:
    if not CONTAINER_REF.fullmatch(value):
        raise InvestigationError("container must be a plain name or hex ID, not flags or shell text")
    return value


def local_context(executable: str, *, executor=bounded_command, environ=None) -> None:
    """Fail closed on remote Docker CLI endpoint, including environment override."""
    env = os.environ if environ is None else environ
    host = env.get("DOCKER_HOST", "")
    if host and not host.startswith("unix:///"):
        raise InvestigationError("remote Docker endpoint is not supported")
    raw = executor(executable, "context", "inspect", "--format", "{{json .Endpoints.docker.Host}}")
    try:
        endpoint = json.loads(raw.decode("utf-8"))
    except (UnicodeError, ValueError) as exc:
        raise InvestigationError("cannot verify Docker context endpoint") from exc
    if not isinstance(endpoint, str) or not endpoint.startswith("unix:///") or len(endpoint) > 256:
        raise InvestigationError("remote or unknown Docker context is not supported")


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def snapshot(target: str, probe: bool, *, executor=bounded_command,
             which=shutil.which, environ=None, clock=now_utc) -> dict:
    target = container_ref(target)
    if not probe:
        return {"schema": "gpupanel.host.docker-investigation.v0alpha",
                "status": "NOT_CHECKED", "executed": False, "mutations": False,
                "target": target, "nextAction": "review Docker context and use --probe for a read-only snapshot",
                "note": "Docker daemon was not contacted"}
    if os.geteuid() == 0:
        raise InvestigationError("refusing to contact Docker as root")
    executable = which("docker")
    if executable is None:
        raise InvestigationError("Docker CLI not found")
    local_context(executable, executor=executor, environ=environ)
    observed = clock()
    raw = executor(executable, "inspect", "--type", "container", "--format", INSPECT_TEMPLATE, target)
    try:
        item = json.loads(raw.decode("utf-8"))
        identity, name, state = item["id"], item["name"], item["state"]
        if not CONTAINER_ID.fullmatch(identity) or not SAFE_NAME.fullmatch(name) or not isinstance(state, dict):
            raise ValueError("invalid identity")
        if not isinstance(state["Status"], str) or not isinstance(state["Running"], bool):
            raise ValueError("invalid state")
        if not isinstance(state["ExitCode"], int) or isinstance(state["ExitCode"], bool):
            raise ValueError("invalid exit code")
    except (ValueError, TypeError, KeyError, UnicodeError, AttributeError) as exc:
        raise InvestigationError("Docker inspect returned invalid or incomplete metadata") from exc
    def bounded_str(key):
        val = state.get(key)
        return val if isinstance(val, str) and len(val) <= 80 and "\n" not in val else None
    health = state.get("Health")
    health_status = health.get("Status") if isinstance(health, dict) else None
    if health_status not in ("starting", "healthy", "unhealthy", None):
        health_status = None
    report = {"schema": "gpupanel.host.docker-investigation.v0alpha",
              "status": "OBSERVED", "executed": True, "mutations": False,
              "source": {"provider": "docker", "scope": "local-unix-context",
                         "containerId": identity, "containerName": name, "observedAt": observed},
              "state": {"status": bounded_str("Status"), "running": state["Running"],
                        "exitCode": state["ExitCode"],
                        "oomKilled": state.get("OOMKilled") if isinstance(state.get("OOMKilled"), bool) else None,
                        "startedAt": bounded_str("StartedAt"), "finishedAt": bounded_str("FinishedAt"),
                        "health": health_status},
              "logs": {"available": False, "rawContentIncluded": False,
                       "tailRequested": TAIL_LINES},
              "note": "Docker read-only observation only; no Agent/API/RBAC or root-cause verification"}
    try:
        # Resolve logs using exact immutable ID; name reuse cannot redirect evidence.
        log_bytes = executor(executable, "logs", "--timestamps", "--tail", str(TAIL_LINES), identity)
        lower = log_bytes.lower()
        report["logs"] = {"available": True, "rawContentIncluded": False,
                          "tailRequested": TAIL_LINES, "byteCount": len(log_bytes),
                          "sha256": hashlib.sha256(log_bytes).hexdigest(),
                          "signals": [code for code, markers in SIGNALS.items()
                                      if any(marker in lower for marker in markers)],
                          "observedAt": clock()}
    except InvestigationError:
        report["status"] = "PARTIAL"
        report["logs"]["reason"] = "Docker logs unavailable or exceeded read limits"
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only Docker container investigation; no GPUPanel API")
    parser.add_argument("--container", required=True, help="existing container name or hex ID")
    parser.add_argument("--probe", action="store_true", help="opt in to read-only Docker daemon access")
    args = parser.parse_args(argv)
    try:
        report = snapshot(args.container, args.probe)
    except InvestigationError as exc:
        print(json.dumps({"status": "FAILED", "error": str(exc), "mutations": False}), file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["status"] == "OBSERVED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
