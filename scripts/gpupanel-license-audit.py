#!/usr/bin/env python3
"""Read-only, evidence-first Git source provenance inventory; never grants licenses."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import subprocess
import sys

UPSTREAM_BASELINE = "d9dc5d7aa981c3b04ad284e93420aca9888f7e5a"
MAX_SCAN_BYTES = 256 * 1024
SPDX = re.compile(r"(?im)^\s*(?:[/#*;!\-]+\s*)?SPDX-License-Identifier:\s*(.{1,160})$")
COPYRIGHT = re.compile(r"(?im)^.{0,64}(?:copyright|©)\s+.{1,150}$")


class AuditError(Exception):
    """Fail closed on missing Git evidence or inaccessible baseline."""


def git(root: Path, *args: str, timeout: int = 60) -> bytes:
    try:
        result = subprocess.run(["git", *args], cwd=root, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=timeout, check=True)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise AuditError("git " + " ".join(args[:2]) + " failed: " + str(exc)) from exc
    return result.stdout


def commit(root: Path, ref: str) -> str:
    value = git(root, "rev-parse", "--verify", "--end-of-options", ref + "^{commit}")
    sha = value.decode("ascii").strip()
    if not re.fullmatch(r"[0-9a-f]{40,64}", sha):
        raise AuditError("not a valid commit: " + ref)
    return sha


def tree(root: Path, sha: str) -> dict[str, dict]:
    entries: dict[str, dict] = {}
    for line in git(root, "ls-tree", "-r", "-z", "-l", sha).split(b"\x00"):
        if not line:
            continue
        try:
            header, path = line.split(b"\t", 1)
            mode, kind, blob, size = header.split(b" ", 3)
            name = path.decode("utf-8", errors="surrogateescape")
            entries[name] = {"mode": mode.decode("ascii"), "type": kind.decode("ascii"),
                             "blob": blob.decode("ascii"),
                             "size": None if size == b"-" else int(size)}
        except (ValueError, UnicodeError) as exc:
            raise AuditError("unexpected git ls-tree output") from exc
    return entries


def scan_header(root: Path, entry: dict) -> dict:
    if entry["type"] != "blob" or entry["mode"] not in ("100644", "100755"):
        return {"scan": "NON_REGULAR", "spdx": [], "copyright": []}
    if entry["size"] is None or entry["size"] > MAX_SCAN_BYTES:
        return {"scan": "OVERSIZE", "spdx": [], "copyright": []}
    data = git(root, "cat-file", "blob", entry["blob"])
    if b"\0" in data:
        return {"scan": "BINARY", "spdx": [], "copyright": []}
    try:
        head = data[:16384].decode("utf-8")
    except UnicodeDecodeError:
        return {"scan": "NON_UTF8", "spdx": [], "copyright": []}
    return {"scan": "HEADER_ONLY", "spdx": sorted(set(s.strip() for s in SPDX.findall(head))),
            "copyright": list(dict.fromkeys(s.strip() for s in COPYRIGHT.findall(head)))[:8]}


def inventory(root: Path, baseline: str = UPSTREAM_BASELINE,
              revision: str = "HEAD", verify_gpl: bool = False) -> dict:
    root = root.resolve()
    base, head = commit(root, baseline), commit(root, revision)
    # Avoid quietly auditing a different or unrelated upstream lineage.
    git(root, "merge-base", "--is-ancestor", base, head)
    old, current = tree(root, base), tree(root, head)
    upstream_blobs: dict[str, list[str]] = defaultdict(list)
    for path, entry in old.items():
        if entry["type"] == "blob":
            upstream_blobs[entry["blob"]].append(path)
    if verify_gpl:
        if ("LICENSE" not in old or "LICENSE" not in current
                or old["LICENSE"]["blob"] != current["LICENSE"]["blob"]):
            raise AuditError("root LICENSE differs from upstream GPL-3.0 baseline")
        if "NOTICE.md" not in current:
            raise AuditError("NOTICE.md missing: retain upstream attribution")
        notice = git(root, "cat-file", "blob", current["NOTICE.md"]["blob"])
        if b"1Panel" not in notice or b"GPL-3.0" not in notice:
            raise AuditError("NOTICE.md missing 1Panel / GPL-3.0 attribution")

    records = []
    for path, entry in sorted(current.items()):
        previous = old.get(path)
        if entry["type"] == "commit":
            origin, review = "SUBMODULE_REVIEW", "UNKNOWN_BLOCK"
        elif previous is not None:
            origin = "INHERITED_UNCHANGED" if previous == entry else "INHERITED_MODIFIED"
            review = "KEEP_GPL"
        elif entry["blob"] in upstream_blobs:
            origin, review = "EXACT_UPSTREAM_BLOB", "KEEP_GPL"
        else:
            origin, review = "NEW_PATH_UNVERIFIED", "UNKNOWN_BLOCK"
        records.append({"path": path, "mode": entry["mode"], "type": entry["type"],
                        "blob": entry["blob"], "bytes": entry["size"],
                        "origin": origin, "review": review,
                        "upstream_paths": upstream_blobs[entry["blob"]][:5] if origin == "EXACT_UPSTREAM_BLOB" else [],
                        **scan_header(root, entry)})
    counts = dict(sorted(Counter(record["origin"] for record in records).items()))
    return {"schema_version": 1, "tool_purpose": "read_only_provenance_not_license_grant",
            "baseline_commit": base, "revision_commit": head,
            "current_distribution_license": "GPL-3.0 (fork; not relicensed)",
            "source_scope": "tracked Git tree; not a release artifact or dependency SBOM",
            "counts": counts, "files": records}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--baseline", default=UPSTREAM_BASELINE)
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--output", type=Path, help="write a JSON report; default stdout")
    parser.add_argument("--verify-gpl", action="store_true", help="fail if root GPL license/attribution changed")
    options = parser.parse_args(argv)
    try:
        result = inventory(options.repo, options.baseline, options.revision, options.verify_gpl)
    except AuditError as exc:
        print("license inventory blocked: " + str(exc), file=sys.stderr)
        return 2
    data = json.dumps(result, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    if options.output:
        options.output.write_text(data, encoding="utf-8")
        print("license inventory written to " + str(options.output), file=sys.stderr)
    else:
        sys.stdout.write(data)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
