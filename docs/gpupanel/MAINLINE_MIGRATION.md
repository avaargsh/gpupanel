# Mainline migration — 2026-10-15

The owner requested consolidation of remote `dev-v2` into the main branch.
No `main` or `master` existed at inventory. Preserve the complete history from
`dev-v2` at `2a8df79935b9c765e8c0c16fc42fe7df736c3147`; create `main` from that
commit with a small governance follow-up. During verification, another operation
merged PR #88 into `dev-v2` at `959cbd6cee3adb5a2f2081982cf19c39b7284f7d`;
this advancement is merged into the promotion candidate too. No squash, history rewrite or runtime
installation is part of this migration.

## Integration policy

- `main` becomes the default and canonical PR target after the baseline passes.
- Keep `dev-v2` as the migration baseline. Preserve all unmerged/Draft PR heads.
- Require PRs, resolved conversations, and the always-running `python-contracts`,
  `frontend-baseline`, `backend-safety` checks. Disable force pushes and deletion;
  apply protection to administrators too. Path-filtered feature workflows remain
  additional evidence and must be reviewed for the actual changed contracts.
- Retarget existing open PRs to `main` after promotion; preserve their Draft state.
- Branch pruning checks the actual default branch rather than a hard-coded name.
  It remains an explicit owner-triggered maintenance task.

## Verification boundary

The baseline runs all Python contracts (including real offline uv scaffolding),
frontend type-check/build, focused Core/Agent authorization, admission, UNKNOWN,
socket and Docker-name tests, and backend compilation. It is not a full Go test
suite, real browser acceptance, Docker install lifecycle, or Ubuntu installation.
The CI embed fixture is not a distributable frontend.

A local baseline run exposed uv 0.12.23 generating a packaged application for
`uv init --app`. Explicit `--no-package` restores the intended offline,
no-build-system starter without weakening template validation. The real init →
lock → run → user-modification test is the regression gate. See the
[uv project creation contract](https://docs.astral.sh/uv/concepts/projects/init/).

M0 remains **NO-GO**: G3 install/rollback, G4 real login/Host, G5 full Docker/App
lifecycle, and G6 recovery are not accepted by this migration. Read
[M0 release train](M0_RELEASE_TRAIN.md), [AGENTS](../../AGENTS.md), and the open
acceptance issues before making any release claim. PR #88 was independently
merged upstream during this migration; its read-only evidence acceptance does
not satisfy the full G3–G6 installation and recovery gates.

## Recovery

The original `dev-v2` SHA remains reachable and unchanged by this migration.
If governance regressions occur, revert the follow-up through a reviewed PR;
repository administration can restore the default to `dev-v2`. Never reset or
force-push shared history, delete unmerged branches or modify installed host data.
GitHub settings and exact promoted SHA/check URLs must be verified live; this
file describes policy, not proof that an API mutation or test succeeded.
