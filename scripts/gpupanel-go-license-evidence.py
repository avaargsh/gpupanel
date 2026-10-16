#!/usr/bin/env python3
"""Inventory legal files of Go modules actually named by the two preview binaries.

Go resolves effective versions and replace paths; this tool never guesses that a
license filename or a compatible SPDX string grants Apache redistribution rights.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
MAX_OUTPUT = 16 * 1024 * 1024
MAX_LICENSE = 1024 * 1024
LEGAL_FILE = re.compile(r"^(?:LICENSE|LICENCE|COPYING|NOTICE)(?:[._ -].*)?$", re.I)


class EvidenceError(Exception):
    """Go resolution or local source attribution is incomplete/inconsistent."""


def json_documents(data: str) -> list[dict]:
    if len(data) > MAX_OUTPUT:
        raise EvidenceError("Go module graph output exceeds limit")
    decoder = json.JSONDecoder()
    offset = 0
    result = []
    while offset < len(data):
        while offset < len(data) and data[offset].isspace():
            offset += 1
        if offset == len(data):
            break
        try:
            record, offset = decoder.raw_decode(data, offset)
        except ValueError as exc:
            raise EvidenceError("malformed Go module graph") from exc
        if not isinstance(record, dict) or not isinstance(record.get("Path"), str):
            raise EvidenceError("Go module graph entry without Path")
        result.append(record)
    if not result:
        raise EvidenceError("empty Go module graph")
    names = [r["Path"] for r in result]
    if len(names) != len(set(names)):
        raise EvidenceError("duplicate module path in Go graph")
    return result


def go_command(root: Path, scope: str, *args: str) -> str:
    try:
        proc = subprocess.run(["go", *args], cwd=root / scope, capture_output=True,
                              text=True, check=True, timeout=240,
                              env={**os.environ, "GOFLAGS": "-mod=readonly"})
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise EvidenceError(f"{scope}: Go evidence command failed: {args[0]}") from exc
    if len(proc.stdout) > MAX_OUTPUT:
        raise EvidenceError("Go command output exceeds limit")
    return proc.stdout.strip()


def legal_docs(path: Path) -> list[dict]:
    entries = []
    # Single directory level only. Nested legal files may still be unresolved.
    for item in sorted(path.iterdir(), key=lambda p: p.name):
        if not LEGAL_FILE.fullmatch(item.name):
            continue
        if item.is_symlink() or not item.is_file() or item.stat().st_size > MAX_LICENSE:
            entries.append({"filename": item.name, "state": "UNSAFE_OR_OVERSIZE"})
            continue
        data = item.read_bytes()
        entries.append({"filename": item.name, "state": "FILE_HASH_REVIEW",
                        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    return entries[:30]


def classify_source(entry: dict, cache: Path, root: Path) -> tuple[str, list[dict]]:
    source = entry.get("Replace") or entry
    directory = source.get("Dir")
    if not isinstance(directory, str) or not directory:
        return "MODULE_SOURCE_NOT_PRESENT", []
    path = Path(directory)
    if not path.is_absolute() or path.is_symlink() or not path.is_dir():
        return "MODULE_SOURCE_UNSAFE", []
    target = path.resolve()
    if target.is_relative_to(cache.resolve()):
        return _review_docs(target)
    # Go local path replacements are not third-party cache sources.
    if entry.get("Replace") and target.is_relative_to(root.resolve()):
        return "LOCAL_REPLACEMENT_REVIEW", []
    return "MODULE_SOURCE_OUTSIDE_CACHE", []


def _review_docs(path: Path) -> tuple[str, list[dict]]:
    docs = legal_docs(path)
    if any(row["state"] == "FILE_HASH_REVIEW" for row in docs):
        return "LEGAL_FILE_HASH_REVIEW", docs
    if docs:
        return "LEGAL_FILES_UNREADABLE_REVIEW", docs
    return "LEGAL_FILE_MISSING_REVIEW", []


def analyse(scope: str, built: dict, graph: list[dict], cache: Path, root: Path) -> dict:
    index = {item["Path"]: item for item in graph}
    records = []
    deps = built.get("dependencies")
    if not isinstance(deps, list):
        raise EvidenceError("binary build-info dependencies missing")
    for dep in deps:
        name, version = dep.get("module"), dep.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            raise EvidenceError("malformed binary dependency")
        entry = index.get(name)
        if entry is None or entry.get("Version") != version:
            raise EvidenceError(f"{scope}: binary module mismatch: {name}")
        replacement = entry.get("Replace")
        actual = dep.get("replacement")
        if bool(replacement) != bool(actual):
            raise EvidenceError(f"{scope}: inconsistent replacement: {name}")
        if replacement:
            if not isinstance(replacement, dict) or not isinstance(actual, dict):
                raise EvidenceError("malformed replacement")
            if (replacement.get("Path") != actual.get("module_or_path")
                    or replacement.get("Version") != actual.get("version")):
                raise EvidenceError(f"{scope}: replacement version mismatch: {name}")
        state, docs = classify_source(entry, cache, root)
        records.append({"module": name, "version": version,
                        "effective_source": replacement.get("Path", name) if replacement else name,
                        "effective_version": replacement.get("Version", version) if replacement else version,
                        "replaced": bool(replacement), "state": state, "legal_documents": docs})
    return {"main_module": built.get("main_module"),
            "dependency_count": len(records),
            "counts": dict(sorted(Counter(row["state"] for row in records).items())),
            "modules": sorted(records, key=lambda x: (x["module"], x["version"]))}


def inventory(root: Path, buildinfo_path: Path) -> dict:
    root = root.resolve()
    if buildinfo_path.is_symlink() or buildinfo_path.stat().st_size > MAX_OUTPUT:
        raise EvidenceError("unsafe or oversized binary build-info JSON")
    report = json.loads(buildinfo_path.read_text(encoding="utf-8"))
    if (report.get("result") != "GO_BINARY_MODULE_METADATA_MATCHES_SOURCE"
            or not re.fullmatch(r"[0-9a-f]{40,64}", str(report.get("source_commit", "")))):
        raise EvidenceError("missing verified preview binary build-info")
    parts = report.get("binaries")
    if not isinstance(parts, dict) or set(parts) != {"core", "agent"}:
        raise EvidenceError("expected both Core and Agent binaries")
    cache = Path(go_command(root, "core", "env", "GOMODCACHE"))
    if not cache.is_absolute() or cache.is_symlink():
        raise EvidenceError("invalid Go module cache")
    results = {}
    for scope in ("core", "agent"):
        graph = json_documents(go_command(root, scope, "list", "-m", "-json", "all"))
        if not any(row.get("Main") and row["Path"] == parts[scope].get("main_module") for row in graph):
            raise EvidenceError(scope + ": graph main module differs from binary")
        results[scope] = analyse(scope, parts[scope], graph, cache, root)
    return {"schema_version": 1, "source_commit": report["source_commit"],
            "archive_sha256": report.get("archive_sha256"),
            "source_scope": "preview binary build-info + effective Go module graph + local module cache",
            "distribution_license": "GPL-3.0 (fork, unchanged)",
            "rights_clearance": False, "complete_sbom": False, "artifact_reproducible": False,
            "not_proven": ["Apache_eligibility", "copyright_authorship", "nested_vendor_assets",
                           "legal_text_compatibility", "complete_release_attribution",
                           "binary_source_reproducibility"],
            "binaries": results}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--buildinfo", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args(argv)
    try:
        report = inventory(options.repo, options.buildinfo)
        data = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
        if options.output:
            options.output.write_text(data, encoding="utf-8")
            print("Go module legal evidence written: " + str(options.output), file=sys.stderr)
        else:
            sys.stdout.write(data)
        return 0
    except (EvidenceError, OSError, ValueError, TypeError, KeyError) as exc:
        print("Go module license evidence BLOCKED: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
