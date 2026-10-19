"""Fail-closed exact-source and installed-binary identity for disposable VM tests.

Does not install, change services, or claim that runtime operations succeeded.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import stat
import subprocess

SCHEMA = "gpupanel.vm.candidate.v1"
SHA256 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
KINDS = ("core", "agent")


def _regular_hash(path: Path) -> str:
    mode = path.lstat().st_mode
    if not stat.S_ISREG(mode):
        raise RuntimeError("candidate binary is missing, symlinked or not regular")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def local_candidate(root: Path, *, run=subprocess.run) -> dict:
    """Require a clean checkout, then hash the *built binaries* (not filenames)."""
    def git(*args):
        result = run(
            ["git", *args], cwd=root, text=True, capture_output=True,
            check=True, timeout=10,
        )
        return result.stdout.strip()

    sha = git("rev-parse", "HEAD")
    if not SHA40.fullmatch(sha):
        raise RuntimeError("invalid checkout revision")
    # Includes untracked source files but excludes ignored private VM state.
    if git("status", "--porcelain", "--untracked-files=all"):
        raise RuntimeError("checkout has uncommitted or untracked changes")
    return {
        "schema": SCHEMA,
        "source_sha": sha,
        "binary_sha256": {
            name: _regular_hash(root / "build" / ("gpupanel-" + name))
            for name in KINDS
        },
    }


def verify_installed(candidate: dict, installed: dict) -> dict:
    """Do not accept fixture booleans or one matching binary as full identity."""
    if (
        not isinstance(candidate, dict)
        or set(candidate) != {"schema", "source_sha", "binary_sha256"}
        or candidate["schema"] != SCHEMA
        or not isinstance(candidate["source_sha"], str)
        or not SHA40.fullmatch(candidate["source_sha"])
    ):
        raise RuntimeError("invalid immutable candidate identity")
    built = candidate["binary_sha256"]
    if not isinstance(built, dict) or set(built) != set(KINDS):
        raise RuntimeError("missing candidate binary digest")
    if not isinstance(installed, dict) or set(installed) != set(KINDS):
        raise RuntimeError("installed binary identity is incomplete")
    for name in KINDS:
        if (
            not isinstance(built[name], str)
            or not SHA256.fullmatch(built[name])
            or not isinstance(installed[name], str)
            or not SHA256.fullmatch(installed[name])
            or installed[name] != built[name]
        ):
            raise RuntimeError("VM installed binary differs from tested candidate")
    return candidate


def verify_browser_chain(browser: dict, candidate: dict) -> None:
    """Runtime recovery must consume a successful *same-candidate* browser run."""
    required = (
        "anonymous_core_host_evidence_denied",
        "live_login_and_httponly_entrance",
        "live_core_agent_host_api",
        "authenticated_installed_list_read",
        "invalid_csrf_denied",
        "live_operations_center_read_only",
    )
    if (
        not isinstance(browser, dict)
        or browser.get("kind") != "LIVE local VM; no intercepted APIs"
        or browser.get("candidate") != candidate
        or not all(browser.get(flag) is True for flag in required)
        or browser.get("browser_page_errors") != []
    ):
        raise RuntimeError("same-candidate live VM browser acceptance unavailable")
