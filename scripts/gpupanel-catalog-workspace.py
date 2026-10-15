#!/usr/bin/env python3
"""GPUPanel first Catalog vertical slice: verified, unprivileged, offline project scaffold.

No shell execution, downloads, package manager invocation or Host service mutation.
Ubuntu/Linux only: atomic no-replace directory publication requires renameat2.
"""
from __future__ import annotations

import argparse
import ctypes
import errno
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "catalog" / "index.json"
DEFINITION_ID = "gpupanel.dev.python-stdlib"
RECIPE_ID = "python-stdlib-scaffold-v1"
FILES = ("README.md", "main.py", "pyproject.toml")
RECEIPT = ".gpupanel-install.json"
DEFAULT_TARGET = Path.home() / "GPUPanel" / "projects" / "python-stdlib-starter"

spec = importlib.util.spec_from_file_location("gpupanel_catalog_contract", ROOT / "scripts" / "gpupanel-catalog.py")
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class WorkspaceError(Exception):
    pass


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verified_template(root: Path = ROOT) -> tuple[dict, dict, dict[str, bytes]]:
    index = catalog.load(root / "catalog/index.json")
    revision = next((r for r in index["revisions"] if r["definitionId"] == DEFINITION_ID), None)
    if revision is None or revision["recipeId"] != RECIPE_ID:
        raise WorkspaceError("missing reviewed Python stdlib Catalog revision")
    source = revision["source"]
    if source["provider"] != "bundled" or source["uri"] != catalog.BUNDLED_RECIPES[RECIPE_ID]:
        raise WorkspaceError("source must be the code-reviewed bundled recipe")
    manifest_path = root / source["uri"]
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise WorkspaceError("bundled manifest missing or symlinked")
    manifest_raw = manifest_path.read_bytes()
    if sha(manifest_raw) != source["sha256"]:
        raise WorkspaceError("bundled manifest sha256 mismatch")
    try:
        manifest = json.loads(manifest_raw, object_pairs_hook=catalog.no_duplicate_keys)
    except (ValueError, catalog.CatalogError) as exc:
        raise WorkspaceError("invalid bundled manifest") from exc
    if (not isinstance(manifest, dict) or set(manifest) != {"formatVersion", "files"}
            or manifest["formatVersion"] != 1 or not isinstance(manifest["files"], list)):
        raise WorkspaceError("unsupported template file manifest")
    rows = manifest["files"]
    if sorted(x.get("path") for x in rows if isinstance(x, dict)) != list(FILES) or len(rows) != len(FILES):
        raise WorkspaceError("unexpected template files")
    contents = {}
    for row in rows:
        if set(row) != {"path", "sha256", "size"}:
            raise WorkspaceError("invalid template file metadata")
        name = row["path"]
        path = manifest_path.parent / name
        if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
            raise WorkspaceError("invalid/symlinked bundled file")
        content = path.read_bytes()
        if sha(content) != row["sha256"] or len(content) != row["size"] or len(content) > 1024 * 1024:
            raise WorkspaceError("bundled file checksum/size mismatch: " + name)
        contents[name] = content
    return index, revision, contents


def safe_target(target: Path, allowed_root: Path) -> Path:
    root = allowed_root.absolute()
    if not root.is_dir() or root.is_symlink():
        raise WorkspaceError("allowed user root does not exist or is a symlink")
    dst = target.expanduser().absolute()
    # Resolve for containment, but also refuse symlink components individually.
    if dst == root or not dst.resolve(strict=False).is_relative_to(root.resolve()):
        raise WorkspaceError("destination must be inside the approved user home")
    for candidate in (dst, *dst.parents):
        if candidate == root:
            break
        if candidate.is_symlink():
            raise WorkspaceError("symlinks in destination path are forbidden")
    if not dst.parent.resolve(strict=False).is_relative_to(root.resolve()):
        raise WorkspaceError("destination escapes allowed user home")
    # A non-existent parent is allowed during planning, which must be read-only.
    # The approved installer is responsible for creating missing user-local dirs.
    for ancestor in (dst.parent, *dst.parent.parents):
        if ancestor == root:
            break
        if ancestor.exists() and not ancestor.is_dir():
            raise WorkspaceError("destination contains a non-directory parent")
    return dst


def prepare_user_parents(target: Path, allowed_root: Path) -> None:
    """Create only missing directories beneath the approved home, never by plan."""
    dst = safe_target(target, allowed_root)
    home = allowed_root.absolute()
    missing = []
    parent = dst.parent
    while parent != home:
        if parent.is_symlink():
            raise WorkspaceError("symlinked destination parent")
        if parent.exists():
            if not parent.is_dir():
                raise WorkspaceError("destination parent is not a directory")
            break
        missing.append(parent)
        parent = parent.parent
    for path in reversed(missing):
        try:
            path.mkdir(mode=0o700)
        except FileExistsError:
            # Concurrent creation is not proof of a safe path; recheck below.
            pass
        if path.is_symlink() or not path.is_dir():
            raise WorkspaceError("unsafe destination parent after creation")
    # Recheck the entire tree after creating directories.
    safe_target(dst, home)


def status(target: Path, allowed_root: Path, root: Path = ROOT) -> dict:
    dst = safe_target(target, allowed_root)
    _, revision, contents = verified_template(root)
    if dst.is_symlink():
        return {"status": "DRIFT", "reason": "target is a symlink", "target": str(dst)}
    if not dst.exists():
        return {"status": "ABSENT", "target": str(dst)}
    if not dst.is_dir():
        return {"status": "UNMANAGED", "reason": "target is not a directory", "target": str(dst)}
    receipt = dst / RECEIPT
    if not receipt.is_file() or receipt.is_symlink():
        return {"status": "UNMANAGED", "reason": "missing receipt", "target": str(dst)}
    try:
        record = json.loads(receipt.read_bytes(), object_pairs_hook=catalog.no_duplicate_keys)
    except (OSError, ValueError, catalog.CatalogError):
        return {"status": "DRIFT", "reason": "invalid receipt", "target": str(dst)}
    if record != {"formatVersion": 1, "definitionId": DEFINITION_ID, "revisionId": revision["id"],
                   "files": {name: sha(content) for name, content in contents.items()}}:
        return {"status": "DRIFT", "reason": "receipt mismatch", "target": str(dst)}
    if {x.name for x in dst.iterdir()} != set(FILES) | {RECEIPT}:
        return {"status": "DRIFT", "reason": "unexpected/missing files", "target": str(dst)}
    for name, content in contents.items():
        path = dst / name
        if not path.is_file() or path.is_symlink() or sha(path.read_bytes()) != sha(content):
            return {"status": "DRIFT", "reason": "file altered: " + name, "target": str(dst)}
    return {"status": "INSTALLED", "target": str(dst), "revisionId": revision["id"], "verified": True}


def rename_exclusive(source: Path, dest: Path) -> None:
    """Linux renameat2 RENAME_NOREPLACE: never overwrite even under a race."""
    libc = ctypes.CDLL(None, use_errno=True)
    if not hasattr(libc, "renameat2"):
        raise WorkspaceError("atomic no-replace rename unavailable on this host")
    libc.renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    libc.renameat2.restype = ctypes.c_int
    # AT_FDCWD=-100, RENAME_NOREPLACE=1
    if libc.renameat2(-100, os.fsencode(source), -100, os.fsencode(dest), 1) != 0:
        error = ctypes.get_errno()
        raise WorkspaceError(f"atomic publication refused: {os.strerror(error)}")


def install(target: Path, allowed_root: Path, approved: bool, root: Path = ROOT) -> dict:
    dst = safe_target(target, allowed_root)
    _, revision, contents = verified_template(root)
    if not approved:
        return {"status": "APPROVAL_REQUIRED", "target": str(dst), "revisionId": revision["id"],
                "changes": list(FILES), "executed": False}
    if dst.exists() or dst.is_symlink():
        raise WorkspaceError("destination already exists; never overwrite existing projects")
    prepare_user_parents(dst, allowed_root)
    with tempfile.TemporaryDirectory(prefix=".gpupanel-stage-", dir=dst.parent) as tmp:
        stage = Path(tmp)
        for name, content in contents.items():
            path = stage / name
            with path.open("xb") as file:
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
        receipt = {"formatVersion": 1, "definitionId": DEFINITION_ID, "revisionId": revision["id"],
                   "files": {name: sha(content) for name, content in contents.items()}}
        (stage / RECEIPT).write_text(json.dumps(receipt, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        rename_exclusive(stage, dst)
        # TemporaryDirectory may cleanup only the old path, now renamed.
    observed = status(dst, allowed_root, root)
    if observed["status"] != "INSTALLED":
        raise WorkspaceError("installation published but observation failed; investigate, do not delete user data")
    return observed


def uninstall(target: Path, allowed_root: Path, approved: bool, root: Path = ROOT) -> dict:
    dst = safe_target(target, allowed_root)
    observed = status(dst, allowed_root, root)
    if observed["status"] != "INSTALLED":
        raise WorkspaceError("uninstall refused: target is not a verified, unchanged GPUPanel install")
    if not approved:
        return {"status": "APPROVAL_REQUIRED", "target": str(dst), "operation": "uninstall", "executed": False}
    # Only the exact four known files can be deleted. Extra/edited user content blocks uninstall.
    for name in FILES:
        p = dst / name
        if p.is_symlink():
            raise WorkspaceError("uninstall refused: symlinked file")
    for name in FILES:
        (dst / name).unlink()
    (dst / RECEIPT).unlink()
    dst.rmdir()  # Fails rather than removing any unexpected user-created files.
    return {"status": "ABSENT", "target": str(dst), "uninstalled": True}


def list_installs(projects_dir: Path, allowed_root: Path, root: Path = ROOT) -> dict:
    """List only our known project receipts, never arbitrary user workspace files."""
    directory = safe_target(projects_dir / ".gpupanel-list-sentinel", allowed_root).parent
    if not directory.exists():
        return {"status": "OK", "installations": [], "managed": 0, "drifted": 0, "executed": False}
    if not directory.is_dir() or directory.is_symlink():
        raise WorkspaceError("projects directory is unsafe")
    records = []
    try:
        children = sorted(directory.iterdir(), key=lambda path: path.name)
    except OSError as exc:
        raise WorkspaceError("cannot enumerate project directory") from exc
    if len(children) > 1000:
        raise WorkspaceError("too many entries for a bounded inventory")
    for child in children:
        # Do not inspect, disclose or traverse ordinary user projects.
        if child.is_symlink() or not child.is_dir():
            continue
        if not (child / RECEIPT).exists() and not (child / RECEIPT).is_symlink():
            continue
        entry = status(child, allowed_root, root)
        records.append({"directory": child.name, "state": entry["status"],
                        "revisionId": entry.get("revisionId"),
                        "reason": entry.get("reason")})
    return {"status": "OK", "installations": records,
            "managed": sum(x["state"] == "INSTALLED" for x in records),
            "drifted": sum(x["state"] != "INSTALLED" for x in records),
            "executed": False}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Offline GPUPanel user-local Python stdlib scaffold")
    parser.add_argument("--target", type=Path, default=DEFAULT_TARGET)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("plan")
    sub.add_parser("status")
    sub.add_parser("list", help="inspect GPUPanel receipt-bearing projects in the target parent")
    sub.add_parser("install").add_argument("--approve", action="store_true")
    sub.add_parser("uninstall").add_argument("--approve", action="store_true")
    args = parser.parse_args(argv)
    try:
        if not sys.platform.startswith("linux"):
            raise WorkspaceError("this adapter is validated only for Linux/Ubuntu")
        if os.geteuid() == 0:
            raise WorkspaceError("do not run this user-workspace adapter as root")
        if args.action == "plan":
            result = install(args.target, Path.home(), False)
        elif args.action == "install":
            result = install(args.target, Path.home(), args.approve)
        elif args.action == "status":
            result = status(args.target, Path.home())
        elif args.action == "list":
            result = list_installs(args.target.parent, Path.home())
        else:
            result = uninstall(args.target, Path.home(), args.approve)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["status"] in {"INSTALLED", "ABSENT", "OK"} else 2
    except (WorkspaceError, OSError, catalog.CatalogError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
