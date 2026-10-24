"""Emit only allowlisted source line and error class from a private VM log.

Never echo log lines, exception messages, request URLs, cookies or secrets.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
SCRIPTS = {
    "browser": ("browser.raw.log", "browser.py"),
    "runtime": ("runtime.raw.log", "runtime.py"),
    "compose": ("compose.raw.log", "compose-live.py"),
    "restore": ("restore.raw.log", "restore-live.py"),
    "container": ("container.raw.log", "container.py"),
    "app-rejection": ("app-rejection.raw.log", "app-rejection-live.py"),
    "app-install": ("app-install.raw.log", "app-install-live.py"),
}
LINE = re.compile(r'File "[^"\n]*/([^/"]+\.py)", line ([1-9][0-9]{0,5})')
CLASS = re.compile(r"^(AssertionError|AttributeError|FileNotFoundError|"
                   r"RuntimeError|ValueError|TimeoutError|KeyError|"
                   r"ConnectionError|PermissionError|OSError|SystemExit|"
                   r"playwright\._impl\._errors\.[A-Za-z]+Error):")


COMPOSE_STAGE = re.compile(
    r"(?m)^GUEST_COMPOSE_STAGE=(image-build|inspect|ps|image-remove|"
    r"image-list|up|logs|exec|stop|start|restart|down|compose|other|unknown) "
    r"release=NO_GO$"
)


def compose_stage(raw: str) -> str:
    hits = COMPOSE_STAGE.findall(raw)
    return hits[-1] if hits else "unknown"



# Fixed, non-sensitive phases only. Paths, IDs, server messages and user
# content in the private VM log are never permitted into CI summaries.
G5_APP_API_STAGE = re.compile(
    r"(?m)^G5_APP_API_FAILURE_STAGE=(catalog-sync|task-receipt|"
    r"detail-lookup|install-admission|resource-evidence|installed-info|"
    r"uninstall-operation|unknown) release=NO_GO$"
)


def app_api_stage(raw: str) -> str:
    hits = G5_APP_API_STAGE.findall(raw)
    return hits[-1] if hits else "unknown"


# Only fixed categories may leave the private guest log. This is evidence
# debugging, not a permission to retry any possibly executed installation.
G5_APP_EVIDENCE_CODE = re.compile(
    r"(?m)^G5_APP_EVIDENCE_FAILURE_CODE=(malformed|install-id|task-id|"
    r"task-status|app-status|classification|classification-container-malformed|"
    r"classification-container-empty|classification-container-count|"
    r"classification-container-state|classification-other|verification-flag|"
    r"container-count|container-state) release=NO_GO$"
)


G5_APP_DOCKER_STATE = re.compile(
    r"(?m)^G5_APP_DOCKER_STATE=(running|created|exited|restarting|paused|"
    r"removing|dead|missing|other|unavailable) release=NO_GO$"
)


G5_APP_FIXTURE_COUNT = re.compile(
    r"(?m)^G5_APP_FIXTURE_CONTAINER_COUNT=(zero|one|multiple) release=NO_GO$"
)
G5_APP_FIXTURE_STATE = re.compile(
    r"(?m)^G5_APP_FIXTURE_DOCKER_STATE=(running|created|exited|restarting|"
    r"paused|removing|dead|unknown) release=NO_GO$"
)

# The uninstalled AppInstall resource must be observably gone. Only fixed
# failure categories may leave the private guest log; "removed" is never
# emitted by the live script, so a forged "removed" token stays "unknown".
G5_APP_UNINSTALL_REMOVAL = re.compile(
    r"(?m)^G5_APP_UNINSTALL_REMOVAL_CODE=(still-installed|identity-present|"
    r"resource-present|refused|unavailable|malformed) release=NO_GO$"
)


def app_uninstall_removal_code(raw: str) -> str:
    hits = G5_APP_UNINSTALL_REMOVAL.findall(raw)
    return hits[-1] if hits else "unknown"


# Duplicate admission probes must be refused without durable side effects.
# Only fixed categories may leave the private guest log; a forged or dynamic
# value stays "unknown".
G5_APP_DUPLICATE_FENCE = re.compile(
    r"(?m)^G5_APP_DUPLICATE_FENCE_CODE=(replay|same-name)-(accepted|"
    r"inventory-changed|unavailable|malformed) release=NO_GO$"
)


def app_duplicate_fence_code(raw: str) -> str:
    hits = G5_APP_DUPLICATE_FENCE.findall(raw)
    return "-".join(hits[-1]) if hits else "unknown"


# A restarted Agent must still return consistent AppInstall evidence. Only
# fixed categories may leave the private guest log.
G5_APP_RESTART_FENCE = re.compile(
    r"(?m)^G5_APP_RESTART_FENCE_CODE=(unavailable|malformed|evidence-changed) "
    r"release=NO_GO$"
)


def app_restart_fence_code(raw: str) -> str:
    hits = G5_APP_RESTART_FENCE.findall(raw)
    return hits[-1] if hits else "unknown"


# The injected install must be observed Executing before the deliberate crash.
# Only fixed categories may leave the private guest log.
G5_APP_INFLIGHT = re.compile(
    r"(?m)^G5_APP_INFLIGHT_CODE=(absent|terminal|malformed) release=NO_GO$"
)


def app_inflight_code(raw: str) -> str:
    hits = G5_APP_INFLIGHT.findall(raw)
    return hits[-1] if hits else "unknown"


# An installation-time crash must leave a durable UNKNOWN outcome: never
# Success/Failed, never auto-retried, no Docker side effects, and mutations
# refused. Only fixed categories may leave the private guest log.
G5_APP_UNKNOWN_FENCE = re.compile(
    r"(?m)^G5_APP_UNKNOWN_FENCE_CODE=(unavailable|"
    r"agent-(?:evidence|socket-cleanup|start)-unavailable|"
    r"docker-(?:unit-start|api)-unavailable|malformed|not-unknown|"
    r"evidence-changed|side-effects|(?:container|network|volume)-side-effects|"
    r"fixture-network-unavailable|init-barrier-not-reached|"
    r"(?:pre-agent|post-agent)-network-(?:count|identity|membership)-drift|"
    r"(?:pre-agent|post-agent)-(?:builtin|shared|custom|mixed)-network-identity-drift|"
    r"freeze-unavailable) release=NO_GO$"
)


def app_unknown_fence_code(raw: str) -> str:
    hits = G5_APP_UNKNOWN_FENCE.findall(raw)
    return hits[-1] if hits else "unknown"


# The UNKNOWN mutation fence: the read-only sync control must stay available
# while a forced delete is refused with unchanged inventory.
G5_APP_UNKNOWN_OP_FENCE = re.compile(
    r"(?m)^G5_APP_UNKNOWN_OP_FENCE_CODE=(control-unavailable|"
    r"delete-(?:accepted|unavailable|malformed|inventory-changed|"
    r"evidence-changed)) release=NO_GO$"
)


def app_unknown_op_fence_code(raw: str) -> str:
    hits = G5_APP_UNKNOWN_OP_FENCE.findall(raw)
    return hits[-1] if hits else "unknown"


def app_fixture_count(raw: str) -> str:
    hits = G5_APP_FIXTURE_COUNT.findall(raw)
    return hits[-1] if hits else "unknown"


def app_fixture_state(raw: str) -> str:
    hits = G5_APP_FIXTURE_STATE.findall(raw)
    return hits[-1] if hits else "unknown"


def app_docker_state(raw: str) -> str:
    hits = G5_APP_DOCKER_STATE.findall(raw)
    return hits[-1] if hits else "unknown"


def app_evidence_code(raw: str) -> str:
    hits = G5_APP_EVIDENCE_CODE.findall(raw)
    return hits[-1] if hits else "unknown"


def diagnostic(raw: str, basename: str) -> str:
    positions = [
        match.group(2) for match in LINE.finditer(raw)
        if match.group(1) == basename
    ]
    exception_types = [
        match.group(1) for line in raw.splitlines()
        if (match := CLASS.match(line)) is not None
    ]
    source = basename + ":" + positions[-1] if positions else basename + ":UNKNOWN"
    klass = exception_types[-1] if exception_types else "UNCLASSIFIED"
    return f"PRIVATE_VM_FAILURE source={source} exception_class={klass} release=NO_GO"


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] not in SCRIPTS:
        print("Usage: ci-failure.py browser|runtime|compose|restore|container", file=sys.stderr)
        return 2
    file_name, basename = SCRIPTS[sys.argv[1]]
    path = STATE / file_name
    if path.is_symlink() or not path.is_file():
        print(f"PRIVATE_VM_FAILURE source={basename}:UNKNOWN "
              "exception_class=NO_PRIVATE_LOG release=NO_GO")
        return 0
    # Only the synthesized constant tokens are printed.
    raw = path.read_text(encoding="utf-8", errors="replace")[-200_000:]
    if sys.argv[1] == "compose":
        print("GUEST_COMPOSE_FAILURE_STAGE=" + compose_stage(raw) + " release=NO_GO")
    if sys.argv[1] == "app-install":
        print("G5_APP_API_FAILURE_STAGE=" + app_api_stage(raw) + " release=NO_GO")
        print("G5_APP_EVIDENCE_FAILURE_CODE=" + app_evidence_code(raw) + " release=NO_GO")
        print("G5_APP_DOCKER_STATE=" + app_docker_state(raw) + " release=NO_GO")
        print("G5_APP_FIXTURE_CONTAINER_COUNT=" + app_fixture_count(raw) + " release=NO_GO")
        print("G5_APP_FIXTURE_DOCKER_STATE=" + app_fixture_state(raw) + " release=NO_GO")
        print("G5_APP_UNINSTALL_REMOVAL_CODE=" + app_uninstall_removal_code(raw) + " release=NO_GO")
        print("G5_APP_DUPLICATE_FENCE_CODE=" + app_duplicate_fence_code(raw) + " release=NO_GO")
        print("G5_APP_RESTART_FENCE_CODE=" + app_restart_fence_code(raw) + " release=NO_GO")
        print("G5_APP_INFLIGHT_CODE=" + app_inflight_code(raw) + " release=NO_GO")
        print("G5_APP_UNKNOWN_FENCE_CODE=" + app_unknown_fence_code(raw) + " release=NO_GO")
        print("G5_APP_UNKNOWN_OP_FENCE_CODE=" + app_unknown_op_fence_code(raw) + " release=NO_GO")
    print(diagnostic(raw, basename))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
