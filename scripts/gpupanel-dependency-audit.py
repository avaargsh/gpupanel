#!/usr/bin/env python3
"""Read-only manifest dependency evidence; NOT a third-party license clearance."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys


class AuditError(Exception):
    """Malformed or inconsistent dependency evidence."""


def load_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise AuditError(f"cannot read JSON manifest {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise AuditError(f"manifest must be a JSON object: {path}")
    return value


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def npm_inventory(root: Path) -> dict:
    package_path = root / "frontend/package.json"
    lock_path = root / "frontend/package-lock.json"
    manifest, lock = load_json(package_path), load_json(lock_path)
    if lock.get("lockfileVersion") != 3:
        raise AuditError("unsupported npm lockfile version; expected v3")
    packages = lock.get("packages")
    if not isinstance(packages, dict) or not isinstance(packages.get(""), dict):
        raise AuditError("npm lockfile packages/root entry missing")
    for key in ("dependencies", "devDependencies", "optionalDependencies"):
        expected, locked = manifest.get(key, {}), packages[""].get(key, {})
        if expected != locked:
            raise AuditError(f"frontend/package.json and package-lock.json {key} disagree")
    records = []
    for path, entry in sorted(packages.items()):
        if not path:
            continue
        if not isinstance(entry, dict) or "node_modules/" not in path:
            raise AuditError(f"unexpected npm package entry: {path}")
        name = path.rsplit("node_modules/", 1)[-1]
        if not name or name.startswith("/") or name.endswith("/"):
            raise AuditError(f"invalid npm package path: {path}")
        version = entry.get("version")
        linked = entry.get("link") is True
        if not linked and (not isinstance(version, str) or not version):
            raise AuditError(f"npm package without locked version: {path}")
        hint = entry.get("license")
        if hint is not None and not isinstance(hint, str):
            raise AuditError(f"npm license hint is not text: {path}")
        records.append({
            "name": name, "path": path, "version": version if isinstance(version, str) else None,
            "linked": linked, "license_hint": hint,
            "review": "LINK_REVIEW" if linked else "THIRD_PARTY_REVIEW",
        })
    return {
        "manifest_sha256": digest(package_path),
        "lock_sha256": digest(lock_path),
        "lockfile_version": lock["lockfileVersion"],
        "count": len(records),
        "missing_license_hints": sum(not item["license_hint"] for item in records),
        "packages": records,
    }


def go_inventory(path: Path) -> dict:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise AuditError(f"cannot read Go module manifest {path}: {exc}") from exc
    module = None
    section = None
    requires = []
    replaces = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("//"):
            continue
        if line == ")":
            if section is None:
                raise AuditError(f"unexpected close in {path}:{lineno}")
            section = None
            continue
        if line in ("require (", "replace ("):
            if section is not None:
                raise AuditError(f"nested Go module block in {path}:{lineno}")
            section = line.split()[0]
            continue
        if line.startswith("module "):
            module = line.split()[1]
            continue
        kind, body = section, line
        if section is None:
            if line.startswith("require "):
                kind, body = "require", line[len("require "):]
            elif line.startswith("replace "):
                kind, body = "replace", line[len("replace "):]
        if kind == "require":
            indirect = "// indirect" in body
            fields = body.split("//", 1)[0].split()
            if len(fields) != 2:
                raise AuditError(f"malformed require in {path}:{lineno}")
            requires.append({
                "module": fields[0], "version": fields[1],
                "scope": "indirect" if indirect else "direct",
                "review": "THIRD_PARTY_REVIEW",
            })
        elif kind == "replace":
            fields = body.split("//", 1)[0].split("=>")
            if len(fields) != 2:
                raise AuditError(f"malformed replace in {path}:{lineno}")
            source, target = fields[0].split(), fields[1].split()
            if len(source) not in (1, 2) or len(target) not in (1, 2):
                raise AuditError(f"malformed replace target in {path}:{lineno}")
            local = target[0].startswith(("./", "../", "/"))
            replaces.append({
                "from": source[0], "from_version": source[1] if len(source) == 2 else None,
                "to": target[0], "to_version": target[1] if len(target) == 2 else None,
                "review": "LOCAL_REPLACEMENT_REVIEW" if local else "FORK_REPLACEMENT_REVIEW",
            })
    if section is not None or not module:
        raise AuditError(f"incomplete Go module manifest: {path}")
    keys = [item["module"] for item in requires]
    if len(set(keys)) != len(keys):
        raise AuditError(f"duplicate Go module requirements: {path}")
    return {
        "module": module,
        "manifest_sha256": digest(path),
        "require_count": len(requires),
        "replace_count": len(replaces),
        "requirements": sorted(requires, key=lambda item: item["module"]),
        "replacements": sorted(replaces, key=lambda item: (item["from"], item["from_version"] or "")),
    }


def inventory(root: Path) -> dict:
    root = root.resolve()
    npm = npm_inventory(root)
    go = {name: go_inventory(root / name / "go.mod") for name in ("core", "agent")}
    return {
        "schema_version": 1,
        "purpose": "manifest_inventory_not_license_grant_or_sbom",
        "source_scope": "npm v3 lock metadata + Go require/replace; excludes downloadable code, assets and release binaries",
        "overall_review": "THIRD_PARTY_REVIEW",
        "summary": {
            "npm_entries": npm["count"],
            "npm_missing_license_hints": npm["missing_license_hints"],
            "go_require_entries": sum(x["require_count"] for x in go.values()),
            "go_replace_entries": sum(x["replace_count"] for x in go.values()),
            "go_direct_entries": sum(sum(r["scope"] == "direct" for r in x["requirements"]) for x in go.values()),
        },
        "npm": npm, "go": go,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, help="write JSON report; otherwise print to stdout")
    args = parser.parse_args(argv)
    try:
        result = inventory(args.repo)
        data = json.dumps(result, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
        if args.output:
            args.output.write_text(data, encoding="utf-8")
            print("dependency inventory written to " + str(args.output), file=sys.stderr)
        else:
            sys.stdout.write(data)
        return 0
    except (AuditError, OSError) as exc:
        print("dependency inventory blocked: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
