#!/usr/bin/env python3
# Copyright 2026 GPUPanel contributors
# SPDX-License-Identifier: Apache-2.0
# See LICENSES/Apache-2.0.txt for the license terms.
"""Read-only source policy gate for AGENTS.md constraint 1.

Newly *added* Go/Python/TS/TSX source files must stay at or below 500 physical
lines. Existing oversized tracked source is legacy debt: it is reported
informationally with its line count and never fails this gate. Rename or copy
destinations are treated as newly added paths, so moving an oversized legacy
file does not bypass the rule.

Diff layers are explicit and never conflated:
  * ``commit``   : committed diff ``<base>..<head>`` (default head is HEAD).
  * ``index``    : staged-only diff ``HEAD..index`` (``--include-worktree``).
  * ``untracked``: uncommitted working-tree files absent from the index
                   (``--include-worktree``).

``--base`` is mandatory; an unresolvable baseline is a hard error (exit 2) and
never falls back to an empty tree. All git usage is read-only (rev-parse,
diff, ls-tree, ls-files, cat-file). Exclusions are a narrow explicit contract
(lock/vendor/generated); test sources are deliberately *not* exempt.

Exit codes: 0 pass, 1 policy violation, 2 operational/baseline error.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys

LIMIT = 500
SOURCE_SUFFIXES = (".go", ".py", ".ts", ".tsx")
EXCLUDED_DIR_SEGMENTS = frozenset(
    {"vendor", "node_modules", "__pycache__", ".git", ".local"}
)
LOCKED_FILENAMES = frozenset(
    {
        "pnpm-lock.yaml",
        "package-lock.json",
        "yarn.lock",
        "bun.lockb",
        "uv.lock",
        "poetry.lock",
        "Cargo.lock",
    }
)
GENERATED_NAME_SUFFIXES = (".pb.go", "_pb2.py", "_pb2_grpc.py")
GENERATED_HEADER_LINES = 10
ZERO_SHA = "0" * 40


class PolicyError(Exception):
    """Operational failure: bad ref, malformed git output, unreadable content."""


@dataclass(frozen=True)
class Entry:
    """One ``git diff --name-status`` record; ``new`` is set for R/C only."""

    code: str
    old: str
    new: str | None

    @property
    def added_path(self) -> str | None:
        """Destination path when this entry introduces a path, else None."""
        if self.code in ("R", "C"):
            return self.new
        if self.code == "A":
            return self.old
        return None


def run_git(repo: Path, *args: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        raise PolicyError(f"git {' '.join(args)} failed: {detail}")
    return proc.stdout


def resolve_commit(repo: Path, ref: str | None) -> str | None:
    """Return the full commit SHA for *ref*, or None when it does not resolve."""
    if ref is None or not ref.strip():
        return None
    proc = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        return None
    sha = proc.stdout.decode("ascii", "replace").strip()
    return sha or None


def parse_name_status(raw: bytes) -> list[Entry]:
    tokens = raw.split(b"\0")
    if tokens and tokens[-1] == b"":
        tokens.pop()
    entries: list[Entry] = []
    index = 0
    while index < len(tokens):
        status = tokens[index].decode("utf-8", "replace")
        index += 1
        if not status:
            raise PolicyError("empty status token in git diff --name-status output")
        code = status[0]
        if code in ("R", "C"):
            if index + 1 >= len(tokens):
                raise PolicyError("truncated rename/copy entry in git diff output")
            old = tokens[index].decode("utf-8", "surrogateescape")
            new = tokens[index + 1].decode("utf-8", "surrogateescape")
            index += 2
            entries.append(Entry(code, old, new))
        else:
            if index >= len(tokens):
                raise PolicyError("truncated path in git diff output")
            path = tokens[index].decode("utf-8", "surrogateescape")
            index += 1
            entries.append(Entry(code, path, None))
    return entries


def diff_entries(repo: Path, *range_args: str) -> list[Entry]:
    return parse_name_status(
        run_git(repo, "diff", "--name-status", "-z", "-M", *range_args)
    )


def untracked_paths(repo: Path) -> list[str]:
    raw = run_git(repo, "ls-files", "--others", "--exclude-standard", "-z")
    tokens = raw.split(b"\0")
    paths = [
        token.decode("utf-8", "surrogateescape") for token in tokens if token
    ]
    return sorted(paths)


def tracked_at_base(repo: Path, base_sha: str) -> frozenset[str]:
    raw = run_git(repo, "ls-tree", "-r", "-z", "--name-only", base_sha)
    tokens = raw.split(b"\0")
    return frozenset(
        token.decode("utf-8", "surrogateescape") for token in tokens if token
    )


def is_source_path(path: str) -> bool:
    return path.endswith(SOURCE_SUFFIXES)


def exclusion_reason(path: str) -> str | None:
    """Narrow explicit exclusion contract; returns a reason or None."""
    parts = Path(path).parts
    if not parts:
        return "empty-path"
    for segment in parts[:-1]:
        if segment in EXCLUDED_DIR_SEGMENTS:
            return "excluded-directory"
    name = parts[-1]
    if name in LOCKED_FILENAMES or name.endswith(".lock") or name.endswith("-lock.yaml"):
        return "lockfile"
    if name.endswith(GENERATED_NAME_SUFFIXES):
        return "generated-filename"
    return None


def looks_generated(header: bytes) -> bool:
    for line in header.splitlines()[:GENERATED_HEADER_LINES]:
        text = line.decode("utf-8", "replace").lower()
        if "@generated" in text:
            return True
        if "generated" in text and "do not edit" in text:
            return True
    return False


def blob_bytes(repo: Path, spec: str, label: str) -> bytes:
    proc = subprocess.run(
        ["git", "-C", str(repo), "cat-file", "blob", spec],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip()
        raise PolicyError(f"cannot read {label} content for {spec}: {detail}")
    return proc.stdout


def worktree_bytes(repo: Path, path: str) -> bytes:
    target = (repo / path).resolve()
    if not str(target).startswith(str(repo.resolve())):
        raise PolicyError(f"path escapes repository working tree: {path}")
    try:
        return target.read_bytes()
    except OSError as exc:
        raise PolicyError(f"cannot read working-tree file {path}: {exc}") from exc


def physical_lines(data: bytes) -> int:
    return len(data.splitlines())


@dataclass
class Finding:
    kind: str  # "fail" | "info"
    path: str
    layer: str
    detail: str

    def render(self) -> str:
        label = "FAIL" if self.kind == "fail" else "INFO"
        return f"{label} {self.detail}: path={self.path} layer={self.layer}"


def check_added(
    path: str,
    layer: str,
    content: bytes,
    findings: list[Finding],
) -> bool:
    """Classify one candidate added path; returns True when it was checked."""
    if not is_source_path(path):
        return False
    reason = exclusion_reason(path)
    if reason is None and looks_generated(content):
        reason = "generated-header"
    if reason is not None:
        findings.append(
            Finding("info", path, layer, f"excluded by narrow contract ({reason})")
        )
        return False
    lines = physical_lines(content)
    if lines > LIMIT:
        findings.append(
            Finding(
                "fail",
                path,
                layer,
                f"added source exceeds {LIMIT} physical lines (lines={lines})",
            )
        )
    else:
        findings.append(
            Finding(
                "info",
                path,
                layer,
                f"added source within limit (lines={lines})",
            )
        )
    return True


def collect_legacy(
    repo: Path, base_sha: str, findings: list[Finding]
) -> tuple[int, int]:
    """Report existing oversized tracked source informationally.

    Returns ``(legacy_over_limit, legacy_excluded)``. These never fail the gate.
    """
    base_paths = tracked_at_base(repo, base_sha)
    over = 0
    excluded = 0
    for path in sorted(base_paths):
        if not is_source_path(path):
            continue
        target = repo / path
        if not target.is_file():
            continue  # renamed or deleted in the working tree; not current debt
        reason = exclusion_reason(path)
        if reason is not None:
            excluded += 1
            continue
        lines = physical_lines(worktree_bytes(repo, path))
        if lines > LIMIT:
            over += 1
            findings.append(
                Finding(
                    "info",
                    path,
                    "tracked-legacy-working-tree",
                    f"existing tracked source over limit (lines={lines}); "
                    "informational legacy debt, not a failure",
                )
            )
    return over, excluded


def run_policy(repo: Path, base_ref: str, head_ref: str, include_worktree: bool) -> int:
    base_sha = resolve_commit(repo, base_ref)
    if base_sha is None:
        print(
            f"source-policy: error: invalid or missing baseline ref {base_ref!r}; "
            "refusing to compare against an empty tree",
            file=sys.stderr,
        )
        return 2
    head_sha = resolve_commit(repo, head_ref)
    if head_sha is None:
        print(
            f"source-policy: error: invalid head ref {head_ref!r}",
            file=sys.stderr,
        )
        return 2

    layers = ["commit"]
    if include_worktree:
        layers.extend(["index-staged", "worktree-untracked"])
    print(f"source-policy: base={base_sha} head={head_sha} limit={LIMIT}")
    print(f"source-policy: layers={','.join(layers)}")
    print(
        "source-policy: note: 'commit' is the committed diff <base>..<head>; "
        "'index-staged' is staged HEAD..index; 'worktree-untracked' is "
        "uncommitted working-tree files absent from the index. Layers are "
        "reported separately and are not interchangeable claims."
    )

    findings: list[Finding] = []
    checked = {"commit": 0, "index-staged": 0, "worktree-untracked": 0}

    for entry in diff_entries(repo, base_sha, head_sha):
        added = entry.added_path
        if added is None:
            continue
        if not is_source_path(added):
            continue
        content = blob_bytes(repo, f"{head_sha}:{added}", "committed")
        if check_added(added, "commit", content, findings):
            checked["commit"] += 1
        if entry.code in ("R", "C"):
            # Keep the origin visible: oversized legacy files are reported as
            # legacy, while the destination is always subject to the new-path rule.
            if is_source_path(entry.old):
                old_lines = physical_lines(
                    blob_bytes(repo, f"{base_sha}:{entry.old}", "baseline")
                )
                if old_lines > LIMIT and exclusion_reason(entry.old) is None:
                    findings.append(
                        Finding(
                            "info",
                            entry.old,
                            "commit-legacy-origin",
                            f"renamed/copied legacy origin over limit "
                            f"(lines={old_lines}); destination re-checked as new",
                        )
                    )

    if include_worktree:
        for entry in diff_entries(repo, "--cached"):
            added = entry.added_path
            if added is None or not is_source_path(added):
                continue
            content = blob_bytes(repo, f":{added}", "staged")
            if check_added(added, "index-staged", content, findings):
                checked["index-staged"] += 1
        for path in untracked_paths(repo):
            if not is_source_path(path):
                continue
            content = worktree_bytes(repo, path)
            if check_added(path, "worktree-untracked", content, findings):
                checked["worktree-untracked"] += 1

    legacy_over, legacy_excluded = collect_legacy(repo, base_sha, findings)

    order = {"commit": 0, "index-staged": 1, "worktree-untracked": 2}
    findings.sort(key=lambda f: (order.get(f.layer, 3), f.path, f.detail))
    for finding in findings:
        print(finding.render())

    failed = sum(1 for finding in findings if finding.kind == "fail")
    added_info = sum(
        1 for finding in findings if finding.kind == "info" and "added source" in finding.detail
    )
    excluded_info = sum(
        1 for finding in findings if "excluded by narrow contract" in finding.detail
    )
    print(
        f"summary: limit={LIMIT} commit_added={checked['commit']} "
        f"staged_added={checked['index-staged']} "
        f"untracked_added={checked['worktree-untracked']} "
        f"added_within_limit={added_info} failed={failed} "
        f"legacy_oversized={legacy_over} legacy_excluded={legacy_excluded} "
        f"candidates_excluded={excluded_info}"
    )
    if failed:
        print(f"source-policy: FAILED ({failed} violation(s))")
        return 1
    print("source-policy: PASSED")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="gpupanel-source-policy",
        description="Read-only <=500-line policy for newly added source files.",
    )
    parser.add_argument(
        "--base",
        required=True,
        help="baseline Git ref (required; never defaults to an empty tree)",
    )
    parser.add_argument("--head", default="HEAD", help="head Git ref (default: HEAD)")
    parser.add_argument(
        "--repo",
        default=".",
        help="repository worktree path (default: current directory)",
    )
    parser.add_argument(
        "--include-worktree",
        action="store_true",
        help="also scan staged (HEAD..index) and untracked working-tree files; "
        "each layer is labeled separately in the report",
    )
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    if not (repo / ".git").exists():
        print(f"source-policy: error: not a git working tree: {repo}", file=sys.stderr)
        return 2
    try:
        return run_policy(repo, args.base, args.head, args.include_worktree)
    except PolicyError as exc:
        print(f"source-policy: error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
