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
    print(diagnostic(raw, basename))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
