# Selective API cleanup inventory — initial evidence

Status: **PARTIAL / NOT EXHAUSTIVE**. This inventory is grounded in the AppInstall real-VM test source in PR #159; it is **not** a claim that every router or client has been enumerated. Do not remove legacy registration based on this file alone.

| Observed current API | Decision | Rationale / gate |
| --- | --- | --- |
| `POST /api/v1/apps/sync/local` | DEFER | Existing path retained; review task semantics separately |
| `POST /api/v1/apps/install` | **KEEP unchanged** | Clear operation; preserve existing callers and live VM tests |
| `GET /api/v1/apps/installed/evidence/{id}` | KEEP for now | Read semantics are clear; maintain strict CONSISTENT predicate |
| `POST /api/v1/apps/installed/op` (`delete`) | **REFACTOR candidate** | Generic operation multiplexing is ambiguous; consider `DELETE /api/v1/apps/installed/{id}` after authorization, idempotency and caller inventory |

Source: `scripts/install-test/app-install-live.py` on PR #159, which uses the retained GPUPanel `/api/v1` prefix.

The accompanying `docs/api/openapi-v1.draft.yaml` is a design-only read contract; it does not assert runtime availability. No mutation route is approved for replacement without review.

## Next implementation checkpoints

1. Find actual Go router registration and all middleware (including SSE/WS), then inventory complete method/path pairs.
2. Find Web and Wails URL construction and auth interceptors; classify actual endpoints KEEP / REFACTOR / DEFER with concrete evidence.
3. Keep the existing `/api/v1` router and `POST /apps/install` unchanged. Prototype only narrowly scoped replacements for REFACTOR endpoints, preserving persistence and authorization.
4. Migrate only affected clients and tests; do not touch unrelated routes.
5. Remove superseded routes in a **separate** breaking-change PR after independently verified rollback and no remaining callers.

## Safety

Do not rebase or edit the fixed-candidate AppInstall acceptance PR #159 to introduce API routing changes. Its M0 NO-GO state remains authoritative until real Ubuntu VM acceptance completes.
