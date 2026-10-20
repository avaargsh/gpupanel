# Legacy route inventory — initial evidence

Status: **PARTIAL / NOT EXHAUSTIVE**. This inventory is grounded in the AppInstall real-VM test source in PR #159; it is **not** a claim that every router or client has been enumerated. Do not remove legacy registration based on this file alone.

| Observed current API | Proposed independent v1 API | Migration gate |
| --- | --- | --- |
| `POST /api/v1/apps/sync/local` | `POST /api/gpupanel/v1/app-catalog/sync-jobs` | Define async task identity, authorization and lost-ACK behavior |
| `POST /api/v1/apps/install` | `POST /api/gpupanel/v1/app-installations` | Define idempotency, conflict and single-submit semantics before exposing |
| `GET /api/v1/apps/installed/evidence/{id}` | `GET /api/gpupanel/v1/app-installations/{installationId}/evidence` | Preserve strict CONSISTENT predicate, TaskDB and Docker identity proof |
| `POST /api/v1/apps/installed/op` (`delete`) | `DELETE /api/gpupanel/v1/app-installations/{installationId}` | Define ownership, task ID, no blind retries and post-delete observation |

Source: `scripts/install-test/app-install-live.py` on PR #159, which currently uses the upstream-shaped `/api/v1` prefix.

The accompanying `docs/api/openapi-v1.draft.yaml` currently defines **only two proposed read endpoints**, both unimplemented. Mutating endpoints above are design targets and intentionally excluded from OpenAPI until the idempotency and authorization contracts are reviewed.

## Next implementation checkpoints

1. Find actual Go router registration and all middleware (including SSE/WS), then inventory complete method/path pairs.
2. Find Web and Wails URL construction and auth interceptors; add negative contract tests to prevent newly introduced upstream-shaped endpoints.
3. Implement a separate v1 router and task/evidence read adapters first, retaining existing persistence and authorization.
4. Migrate clients and real VM tests by slice, keeping the old endpoints only as temporary internal routes.
5. Remove old routes in a **separate** breaking-change PR after independently verified rollback and no remaining callers.

## Safety

Do not rebase or edit the fixed-candidate AppInstall acceptance PR #159 to introduce API routing changes. Its M0 NO-GO state remains authoritative until real Ubuntu VM acceptance completes.
