# Local application store — reused 1Panel workflow (2026-10-15)

## User workflow and domain contract

Current scope: one authenticated Ubuntu Host operator opens `/apps/all`, lists locally registered applications, filters, opens details, explicitly confirms install, checks the task log, then operates the resulting deployment in `/apps/installed`. This is **not** a new registry, GPU scheduler, managed marketplace or auto-install-on-login.

**Ownership/data flow**: Vue app-store view (request/view state) → Core authenticated proxy/authorization → Agent `apps/search` / `apps/sync/local` / existing install API → local App/AppDetail tables + Docker/Compose → task log and installed state → UI reread. The backend App record is not a trusted executable command: the existing installation form and backend validator decide allowable parameters; installation is a separate user-confirmed request.

## Deliberate choices

- Source of truth for this page is the **existing local** 1Panel app repository (`resource=local`), not GPUPanel's experimental root `catalog/index.json`. The Python stdlib offline project scaffold remains a separate user-local CLI utility; it is **not** a web-installable application.
- Upstream **remote** 1Panel catalog sync/search/new installs stay disabled in the Agent. Previously installed remote applications remain manageable in Installed Apps; this page does not revive their source.
- Reuse upstream AppCard, Tags, Detail, Install and TaskLog; preserve original `/apps/*` routes. No new dependency or external API is added.
- User clicks **Sync local apps**, reviews a confirmation warning, and receives a task log. Sync may retire removed local definitions without deleting installed app records. An accepted HTTP call is not proof of completed synchronization.
- Inherited `?install` deep links are **not** auto-executed. The previous router bypass of `hasRouteAccess` for those links is removed. Existing backend authorization remains the real security boundary.
- View rejects malformed search payloads (error, not empty success), keeps separate loading/empty/error states and fences stale results across node changes. A node switch cannot promote an old request result as new-node data.

## Known constraints and falsifiable acceptance

1. **Source/build gates**: Python portal contract, Node decoder boundary tests, `npm run build:pro`, `npm run type-check` must pass at the exact PR head.
2. **Live acceptance NOT RUN**: on disposable Ubuntu 24.04 with a real locally registered app definition and Docker, verify login → local sync task COMPLETED → list → detail → explicit install → installed status and logs → stop/start → uninstall → independently observed removal. Test negative `app_view`/mutation permissions, unsupported Docker, stale node switch, duplicate sync attempts and failed recipes.
3. **Remaining risk**: the inherited local sync task is asynchronous and has side effects in App/AppDetail tables. The UI cannot by itself establish backend task completion or idempotent duplicate-task rejection. Task IDs/logs and a reread provide operator visibility; true backend idempotency and reconciliation remain for live G5 hardening.
4. **Rollback**: revert the UI/router/localization/test patch only. No DB migration or on-host mutation is performed by the code patch; live installs, once a user has authorized them, are managed by the existing Installed Apps lifecycle rather than by reverting frontend code.

The release gates G3 (system installer), G4 (authenticated Host E2E), G5 (Docker+app E2E) and G6 (recovery) are **not** passed by this feature alone.
