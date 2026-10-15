#!/usr/bin/env python3
"""Prune GPUPanel merged-PR remote heads. Default is read-only dry run."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

REPO = "avaargsh/gpupanel"
SIZE = 100


def command(args):
    p = subprocess.run(args, text=True, capture_output=True, check=False)
    if p.returncode:
        raise RuntimeError(f"Command failed ({p.returncode}): {args[0]} {args[1]}: {p.stderr[-600:]}")
    return p.stdout


def gh_json(endpoint):
    return json.loads(command(["gh", "api", endpoint]))


def get_all(resource):
    result = []
    for page in range(1, 101):
        separator = "&" if "?" in resource else "?"
        data = gh_json(f"repos/{REPO}/{resource}{separator}per_page={SIZE}&page={page}")
        if not isinstance(data, list):
            raise RuntimeError("Unexpected GitHub API response; refuse deletion")
        result.extend(data)
        if len(data) < SIZE:
            return result
    raise RuntimeError("Pagination limit reached; refuse deletion")


def inventory():
    meta = gh_json(f"repos/{REPO}")
    if meta.get("full_name") != REPO or not meta.get("default_branch"):
        raise RuntimeError("Cannot verify repository identity and default branch")
    return meta["default_branch"], get_all("branches"), get_all("pulls?state=all")


def classify(default, branches, prs):
    eligible, excluded = [], {}
    for b in branches:
        name = b.get("name")
        sha = (b.get("commit") or {}).get("sha")
        if not isinstance(name, str) or not isinstance(sha, str) or not re.fullmatch("[0-9a-f]{40}", sha):
            raise RuntimeError("Invalid branch identity; refuse deletion")
        if name == default or b.get("protected"):
            excluded[name] = "default/protected"
            continue
        associated = [p for p in prs if (p.get("head") or {}).get("ref") == name
                      and ((p.get("head") or {}).get("repo") or {}).get("full_name") == REPO]
        if any(not p.get("merged_at") for p in associated):
            excluded[name] = "open or closed-unmerged PR references branch"
            continue
        proof = [p["number"] for p in associated
                 if p.get("merged_at") and (p.get("head") or {}).get("sha") == sha]
        if not proof:
            excluded[name] = "no merged PR with exact current head SHA"
            continue
        eligible.append({"branch": name, "sha": sha, "merged_prs": sorted(proof)})
    return sorted(eligible, key=lambda item: item["branch"]), excluded


def verify_origin():
    url = command(["git", "remote", "get-url", "origin"]).strip()
    patterns = (
        r"https://github\.com/avaargsh/gpupanel(?:\.git)?/?",
        r"git@github\.com:avaargsh/gpupanel(?:\.git)?",
        r"ssh://git@github\.com/avaargsh/gpupanel(?:\.git)?",
    )
    if not any(re.fullmatch(p, url) for p in patterns):
        raise RuntimeError("Origin is not exactly github.com/avaargsh/gpupanel")


def checked_out_worktrees():
    lines = command(["git", "worktree", "list", "--porcelain"]).splitlines()
    prefix = "branch refs/heads/"
    return {line[len(prefix):] for line in lines if line.startswith(prefix)}


def delete_exact_head(item):
    name, sha = item["branch"], item["sha"]
    # Atomic compare-and-delete; unlike an API DELETE, lease prevents racing an updated ref.
    command(["git", "push", "--porcelain",
             f"--force-with-lease=refs/heads/{name}:{sha}",
             "origin", f":refs/heads/{name}"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Delete only verified merged-PR heads")
    parser.add_argument("--confirm-repo", default="", help="Required with --apply: avaargsh/gpupanel")
    args = parser.parse_args()
    if args.apply and args.confirm_repo != REPO:
        parser.error("--apply requires --confirm-repo avaargsh/gpupanel")
    try:
        default, branches, prs = inventory()
        selected, excluded = classify(default, branches, prs)
        print(json.dumps({"mode": "apply" if args.apply else "dry-run", "repo": REPO,
                          "branch_count": len(branches), "eligible": selected,
                          "excluded": excluded}, indent=2, ensure_ascii=False))
        if not args.apply:
            return 0
        verify_origin()
        active = checked_out_worktrees()
        deleted, failures = [], {}
        for item in selected:
            name = item["branch"]
            if name in active:
                failures[name] = "checked out in local worktree"
                continue
            # Re-read upstream state just before each ref mutation.
            fresh, _ = classify(*inventory())
            if item not in fresh:
                failures[name] = "upstream PR/branch eligibility changed"
                continue
            try:
                delete_exact_head(item)
                remaining = {b["name"] for b in get_all("branches")}
                if name in remaining:
                    failures[name] = "push returned success but remote branch still exists"
                else:
                    deleted.append(name)
                    print(f"DELETED {name}", file=sys.stderr)
            except RuntimeError as exc:
                failures[name] = str(exc)
        print(json.dumps({"verified_deleted": deleted, "not_deleted": failures},
                         indent=2, ensure_ascii=False))
        return 2 if failures else 0
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
