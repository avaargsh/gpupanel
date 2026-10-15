# Prune merged GPUPanel PR branches safely

This is a **manual maintenance task** tracked in [issue #73](https://github.com/avaargsh/gpupanel/issues/73), not a release gate and not a runtime dependency.

## Read-only baseline (2026-10-15)

- Default branch: `dev-v2` (must never delete).
- GitHub API inventory: 68 PRs and 68 remote branches.
- 52 *provisional* deletion candidates: an exact current remote SHA matches the final head SHA of a merged PR, and the name is not referenced by any other unmerged PR.
- 14 preserved by explicit branch/default/PR rules; 2 unmatched names (`feat/g3-core-config-isolation-20261015`, `fix/first-run-real-docker-health`) require human provenance review.
- `delete_branch_on_merge=false` as of the snapshot. Enable **Settings → General → Pull Requests → Automatically delete head branches** if desired for future merges.

**No remote ref has been deleted by this documentation or its accompanying code.** Execution must re-query live GitHub state. Existing PR history and merge commits remain accessible after branch deletion.

## Prerequisites

Run these commands in a local clone whose `origin` is **exactly** `avaargsh/gpupanel`. The machine must have Python 3, Git and GitHub CLI (`gh`) authenticated with permission to delete old branch refs.

```bash
gh auth status
git remote get-url origin
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_prune_merged_branches.py' -v
python3 scripts/gpupanel-prune-merged-branches.py > branch-prune-preview.json
```

Review `branch-prune-preview.json`, particularly `eligible` and `excluded`. The script defaults to **dry-run** and makes no mutation without `--apply`.

After independent review of the live list:

```bash
python3 scripts/gpupanel-prune-merged-branches.py --apply --confirm-repo avaargsh/gpupanel \
  > branch-prune-execution.json
```

The script refuses unknown repos and nonmatching `origin`; it excludes default/protected refs, any branch with any nonmerged PR, stale/pruned PR head SHAs and branches checked out in local worktrees. It re-fetches inventory before each deletion and uses Git's **exact SHA `--force-with-lease` remote compare-and-delete** (not unrestricted force push). It then checks GitHub branch inventory again to confirm the deleted branch no longer exists.

A successful dry-run is **not** a deletion. If a branch moved, permissions changed, GitHub API failed, a ruleset blocked deletion or the final ref check failed, record that item as NOT DELETED and investigate; do not use `--force` as a workaround.

**Scope restriction:** do not delete branches from other projects, unmerged branches, disputed shared-worktree refs, unknown/no-PR heads, GitHub forks, default branches or protected refs. This tool only cleans the named GPUPanel remote and does not remove local branches. Do not store GitHub credentials or raw API authentication headers in the reports.

## Completion evidence

Close [issue #73](https://github.com/avaargsh/gpupanel/issues/73) only after the output contains `verified_deleted` and `not_deleted` with any failures investigated, and a fresh remote branch listing agrees. GitHub repository administration may then enable automatic deletion on future PR merges.