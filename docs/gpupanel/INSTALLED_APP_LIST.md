# Installed Apps: node-aware reads and explicit failure state (G5 UI slice)

**Scope:** GPUPanel `/apps/installed` and `/apps/upgrade` on one authenticated Ubuntu Host, without new APIs or changing Agent's install/operate behavior.

## User outcome

- Installed application searches, explicit refresh/sync and 30-second background polling now track a monotonically increasing request revision and the selected `operateNode`.
- The UI does not render an old-node response after switching nodes, an older overlapping response after a newer request, or a late response after unmount. A node change clears the displayed list and pagination immediately.
- The response must contain valid pagination and core AppInstallDTO identity/status fields. A malformed success payload, network error or permission denial displays a localized retryable **error**, not a false empty list or an indefinite spinner. Original exception details are not displayed.
- Empty success displays the existing empty prompt. Sorting's full-list request uses the same node/revision fence and does not silently show a stale result. Background polling pauses in sort mode and resumes after exit.
- The previous 1-second startup reconciliation and explicit Refresh call keep `sync=true`; background polling uses `sync=false`. This avoids having a one-time sync flag persist into every later search. App mutations, which still use inherited Agent operations, are out of scope.

## Trust boundaries and contract

Browser authenticated Core proxy → existing Agent `POST /apps/installed/search?operateNode=...` → AppInstallDB / app status → checked view DTO. The UI is not the authorization authority: Core/Agent must still validate access. Unknown app status strings remain **unknown** and never become Running based on a 2xx search result.

This change touches no persistent schema, task admission, replay semantics, Docker deployment or privileged action. It does not assert enterprise multi-node RBAC or real service readiness. Operation mutability during cross-node switches is a separate task and should not be inferred secure from read fencing.

## Reproducible source checks

```bash
cd frontend
node --experimental-strip-types --test src/views/app-store/installed/installed-page.test.mjs
npm ci
npm run build:pro
npm run type-check
```

Manual follow-up on an **isolated Ubuntu test installation** (not production): first visit, true empty list, malformed/403/timeout response, two out-of-order searches, switch node during in-flight list fetch, sort mode during polling, page unmount, explicit sync and task state reread. Check localized retry and keyboard access. The automated tests exercise pure response validation and request revision logic; they do **not** replace browser/API or Docker G5 acceptance.

## Rollback

Revert frontend page, parser/revision utility, i18n strings, regression tests and CI step. No DB migration, installation, host cleanup or on-disk rollback.
