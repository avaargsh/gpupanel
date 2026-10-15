#!/usr/bin/env python3
"""Read-only versioned GPUPanel Catalog contract. No installers, shell or downloads."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "catalog" / "index.json"
ID = re.compile(r"^[a-z][a-z0-9]*(?:[.-][a-z0-9]+){1,8}$")
REV = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,64}$")
SHA = re.compile(r"^[0-9a-f]{64}$")
KINDS = {"application", "devtool", "workspace", "model", "workflow"}
TARGETS = {"linux-host", "docker-compose", "kubernetes"}
ADAPTERS = {"host-package", "docker-compose", "verified-asset"}
SOURCES = {"official", "mirror", "modelscope", "acr", "bundled"}

# Reviewed recipes must be added here with separate implementation/tests.
# Catalog files can never self-authorize a new command or executor.
APPROVED_RECIPES: frozenset[str] = frozenset({"python-stdlib-scaffold-v1"})
BUNDLED_RECIPES = {"python-stdlib-scaffold-v1": "catalog/templates/python-stdlib/manifest.json"}


class CatalogError(Exception):
    pass


def no_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise CatalogError("duplicate JSON key: " + key)
        result[key] = value
    return result


def load(path: Path) -> dict:
    try:
        obj = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_keys)
    except (OSError, ValueError) as exc:
        raise CatalogError("catalog could not be read: " + str(exc)) from exc
    validate(obj)
    return obj


def check_keys(obj: dict, required: set[str], optional: set[str], name: str) -> None:
    if not isinstance(obj, dict) or set(obj) - (required | optional) or not required <= set(obj):
        raise CatalogError(name + ": unexpected or missing fields")


def check_string(obj: dict, key: str, name: str) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or not value.strip() or len(value) > 512:
        raise CatalogError(name + ": invalid " + key)
    return value


def revision_digest(revision: dict) -> str:
    """Content-address a revision using its canonical JSON fields, excluding id."""
    body = {key: value for key, value in revision.items() if key != "id"}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def validate_revision(revision: dict, definitions: set[str], approved_recipes: frozenset[str]) -> None:
    required = {"id", "definitionId", "version", "adapter", "recipeId", "source"}
    check_keys(revision, required, set(), "revision")
    rid = check_string(revision, "id", "revision")
    if not SHA.fullmatch(rid):
        raise CatalogError("revision: id must be a sha256 content digest")
    definition_id = check_string(revision, "definitionId", "revision")
    if definition_id not in definitions:
        raise CatalogError("revision: unknown definition")
    if not REV.fullmatch(check_string(revision, "version", "revision")):
        raise CatalogError("revision: invalid version")
    if revision["adapter"] not in ADAPTERS:
        raise CatalogError("revision: unsupported adapter")
    recipe = check_string(revision, "recipeId", "revision")
    if recipe not in approved_recipes:
        raise CatalogError("revision: recipe not present in code-reviewed allowlist")
    source = revision["source"]
    check_keys(source, {"provider", "uri", "sha256"}, set(), "source")
    if source["provider"] not in SOURCES:
        raise CatalogError("source: unknown provider")
    uri = check_string(source, "uri", "source")
    if source["provider"] == "bundled":
        # A local repository file is not a generic file:// or custom path source.
        # Each bundled recipe's path is fixed in trusted executable code.
        if uri != BUNDLED_RECIPES.get(recipe) or revision["adapter"] != "verified-asset":
            raise CatalogError("source: unapproved bundled recipe path")
    else:
        parts = urlsplit(uri)
        if (parts.scheme != "https" or not parts.hostname or parts.username
                or parts.password or parts.fragment or parts.port == 0):
            raise CatalogError("source: pinned HTTPS artifact required")
    checksum = check_string(source, "sha256", "source")
    if not SHA.fullmatch(checksum):
        raise CatalogError("source: invalid sha256")
    if rid != revision_digest(revision):
        raise CatalogError("revision: immutable content digest mismatch")


def validate(obj: dict, approved_recipes: frozenset[str] = APPROVED_RECIPES) -> None:
    check_keys(obj, {"schemaVersion", "definitions", "revisions"}, set(), "index")
    if type(obj["schemaVersion"]) is not int or obj["schemaVersion"] != 1:
        raise CatalogError("unsupported schema version")
    if not isinstance(obj["definitions"], list) or not isinstance(obj["revisions"], list):
        raise CatalogError("definitions/revisions must be lists")
    ids = set()
    for entry in obj["definitions"]:
        check_keys(entry, {"id", "name", "kind", "status", "targets", "description"}, set(), "definition")
        entry_id = check_string(entry, "id", "definition")
        if not ID.fullmatch(entry_id) or entry_id in ids:
            raise CatalogError("definition: invalid or duplicate id")
        ids.add(entry_id)
        check_string(entry, "name", "definition")
        check_string(entry, "description", "definition")
        if entry["kind"] not in KINDS or entry["status"] not in {"planned", "experimental"}:
            raise CatalogError("definition: invalid kind/status")
        targets = entry["targets"]
        if (not isinstance(targets, list) or not targets
                or any(not isinstance(t, str) or t not in TARGETS for t in targets)
                or len(targets) != len(set(targets))):
            raise CatalogError("definition: invalid target")
    seen = set()
    for revision in obj["revisions"]:
        if not isinstance(revision, dict):
            raise CatalogError("invalid revision")
        revision_id = revision.get("id")
        if revision_id in seen:
            raise CatalogError("duplicate revision id")
        seen.add(revision_id)
        validate_revision(revision, ids, approved_recipes)


def canonical_digest(obj: dict) -> str:
    raw = json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    return hashlib.sha256(raw).hexdigest()


def plan(obj: dict, definition_id: str) -> dict:
    definition = next((d for d in obj["definitions"] if d["id"] == definition_id), None)
    if definition is None:
        raise CatalogError("unknown definition: " + definition_id)
    revisions = [r for r in obj["revisions"] if r["definitionId"] == definition_id]
    if len(revisions) == 1 and revisions[0]["recipeId"] == "python-stdlib-scaffold-v1":
        return {"definitionId": definition_id, "status": "READY_FOR_USER_APPROVAL",
                "revisions": [revisions[0]["id"]],
                "reason": "Offline, user-local project scaffold (not Python runtime installation)",
                "steps": ["Verify", "Preview", "Approve", "Create", "Reconcile", "Uninstall"],
                "command": "python3 scripts/gpupanel-catalog-workspace.py plan",
                "executed": False}
    return {"definitionId": definition_id, "status": "BLOCKED",
            "revisions": [r["id"] for r in revisions],
            "reason": "No reviewed installer or independent runtime verification is connected",
            "steps": ["Resolve", "Approve", "Download", "Verify", "Install", "Reconcile"],
            "executed": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="GPUPanel offline Catalog index: validate, browse, plan")
    parser.add_argument("--index", type=Path, default=DEFAULT)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("verify")
    sub.add_parser("list")
    p = sub.add_parser("show")
    p.add_argument("definition_id")
    p = sub.add_parser("plan")
    p.add_argument("definition_id")
    args = parser.parse_args(argv)
    try:
        index = load(args.index)
        if args.command == "verify":
            result = {"validSchema": True, "schemaVersion": 1, "indexSha256": canonical_digest(index),
                      "trustRootVerified": False, "executable": False}
        elif args.command == "list":
            result = {"definitions": index["definitions"], "revisions": len(index["revisions"]),
                      "executable": False}
        elif args.command == "show":
            result = next((d for d in index["definitions"] if d["id"] == args.definition_id), None)
            if result is None:
                raise CatalogError("unknown definition: " + args.definition_id)
        else:
            result = plan(index, args.definition_id)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2 if args.command == "plan" and result["status"] == "BLOCKED" else 0
    except (CatalogError, TypeError, ValueError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
