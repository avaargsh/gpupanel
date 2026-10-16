#!/usr/bin/env python3
# Copyright 2026 GPUPanel contributors
# SPDX-License-Identifier: Apache-2.0
# See LICENSES/Apache-2.0.txt for the license terms.
"""Evidence from installed pnpm packages, not a license clearance or complete SBOM.

Read-only. Requires a frozen pnpm install; never follows package-directory symlinks.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MAX_MANIFEST = 8 * 1024 * 1024
MAX_LICENSE = 512 * 1024
LICENSE_NAME = re.compile(r"^(license|licence|copying|notice)([._ -].*)?$", re.IGNORECASE)


class EvidenceError(Exception):
    """An installed package cannot be safely attributed to the current lock."""


def _read_json(path: Path) -> dict:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_MANIFEST:
        # Package paths are public dependency names, not credentials.
        raise EvidenceError("unsafe or oversized package metadata: " + str(path))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeError, ValueError) as exc:
        raise EvidenceError("malformed installed package metadata") from exc
    if not isinstance(data, dict):
        raise EvidenceError("installed metadata must be a JSON object")
    return data


def _package_roots(virtual: Path):
    if virtual.is_symlink() or not virtual.is_dir():
        raise EvidenceError("pnpm virtual store missing or symlinked; run frozen pnpm install")
    anchor = virtual.resolve()
    for entry in sorted(virtual.iterdir()):
        if not entry.is_dir() or entry.is_symlink():
            continue
        nm = entry / "node_modules"
        if not nm.is_dir() or nm.is_symlink():
            continue
        for item in sorted(nm.iterdir()):
            if item.is_symlink() or not item.is_dir():
                continue
            children = sorted(item.iterdir()) if item.name.startswith("@") else [item]
            for candidate in children:
                if candidate.is_symlink() or not candidate.is_dir():
                    continue
                if not candidate.resolve().is_relative_to(anchor):
                    raise EvidenceError("package source escapes pnpm virtual store")
                if (candidate / "package.json").exists():
                    yield candidate


def _licenses(pkg: Path) -> list[dict]:
    evidence = []
    for path in sorted(pkg.iterdir()):
        if not LICENSE_NAME.fullmatch(path.name):
            continue
        if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_LICENSE:
            evidence.append({"file": path.name, "state": "UNREADABLE_OR_OVERSIZE"})
            continue
        content = path.read_bytes()
        evidence.append({"file": path.name, "state": "TEXT_PRESENT",
                         "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    return evidence[:20]


def collect(root: Path, locked: list[dict]) -> dict:
    root = root.resolve()
    virtual = root / "frontend/node_modules/.pnpm"
    expected = {(row["name"], row["version"]) for row in locked}
    found: dict[tuple[str, str], list[dict]] = {}
    extras = set()
    for pkg in _package_roots(virtual):
        meta = _read_json(pkg / "package.json")
        name, version = meta.get("name"), meta.get("version")
        if not isinstance(name, str) or not isinstance(version, str) or not name or not version:
            raise EvidenceError("package metadata lacks name or version")
        key = (name, version)
        if key not in expected:
            extras.add(key)
            continue
        hint = meta.get("license")
        if hint is not None and not isinstance(hint, str):
            raise EvidenceError("package license metadata is not text")
        docs = _licenses(pkg)
        found.setdefault(key, []).append({
            "license_hint": hint, "license_documents": docs,
            "review": "SOURCE_TEXT_REVIEW_REQUIRED",
        })
    records = []
    for name, version in sorted(expected):
        variants = found.get((name, version), [])
        # Peer-resolution variants can share a name/version; their evidence must agree.
        fingerprints = {json.dumps(v, sort_keys=True) for v in variants}
        if len(fingerprints) > 1:
            state, selected = "CONFLICTING_INSTALLED_EVIDENCE", None
        elif not variants:
            state, selected = "NOT_INSTALLED_IN_THIS_ENV", None
        else:
            selected = variants[0]
            readable = any(doc["state"] == "TEXT_PRESENT" for doc in selected["license_documents"])
            state = "LICENSE_TEXT_FOUND_REVIEW" if readable else "LICENSE_TEXT_MISSING_REVIEW"
        records.append({"name": name, "version": version, "state": state,
                        "evidence": selected, "variants": len(variants)})
    counts = dict(sorted(Counter(row["state"] for row in records).items()))
    return {"schema_version": 1, "scope": "installed pnpm store in this runner only",
            "rights_clearance": False, "release_bom_verified": False,
            "locked_entries": len(locked), "unique_locked_identities": len(expected),
            "observed_identities": sum(bool(found.get(k)) for k in expected),
            "unlocked_installed_identities": [
                {"name": n, "version": v} for n, v in sorted(extras)],
            "counts": counts, "packages": records}


def inventory(root: Path = ROOT) -> dict:
    spec = importlib.util.spec_from_file_location("gpupanel_pnpm_inventory", Path(__file__).with_name("gpupanel-pnpm-inventory.py"))
    parser = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(parser)
    locked = parser.inventory(root)["packages"]
    return collect(root, locked)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        result = inventory(args.repo)
        output = json.dumps(result, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
        if args.output:
            args.output.write_text(output, encoding="utf-8")
            print("pnpm source-license evidence written to " + str(args.output), file=sys.stderr)
        else:
            sys.stdout.write(output)
        return 0
    except (EvidenceError, OSError, ValueError, KeyError, TypeError) as exc:
        print("pnpm license evidence BLOCKED: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
