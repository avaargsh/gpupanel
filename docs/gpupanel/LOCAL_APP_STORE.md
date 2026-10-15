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

## Installation request recovery (front-end slice)

- Installation form loads the selected app and exact version detail before enabling confirmation. Invalid or unavailable version data leaves an explicit error and retry entry, rather than an inert button.
- A synchronous single-flight state fence covers validation, the port-exposure confirmation, and the API submission. Canceling a confirmation performs no install mutation. The drawer resists dismissal while submitting.
- On a rejected/timed-out install POST the browser **cannot prove** whether the Agent created the task. It keeps the generated task UUID and exposes its existing task-log viewer; the submission button stays blocked until the operator reviews the task and independently checks Installed Apps, then explicitly acknowledges the risk of retrying. Closing and reopening this drawer preserves the unresolved task in the current UI component instance.
- These guards are **not** backend exactly-once, durable idempotency, or cross-session resume. A page reload can lose the in-memory attempt state. Production G5 still requires task-ID replay fencing and actual backend operation reconciliation on a disposable host. The browser does not log raw exception payloads or secrets.

## Known constraints and falsifiable acceptance

1. **Source/build gates**: Python portal contract, Node decoder boundary tests, `npm run build:pro`, `npm run type-check` must pass at the exact PR head.
2. **Live acceptance NOT RUN**: on disposable Ubuntu 24.04 with a real locally registered app definition and Docker, verify login → local sync task COMPLETED → list → detail → explicit install → installed status and logs → stop/start → uninstall → independently observed removal. Test negative `app_view`/mutation permissions, unsupported Docker, stale node switch, duplicate sync attempts and failed recipes.
3. **Remaining risk**: the inherited local sync task is asynchronous and has side effects in App/AppDetail tables. The UI cannot by itself establish backend task completion or idempotent duplicate-task rejection. Task IDs/logs and a reread provide operator visibility; true backend idempotency and reconciliation remain for live G5 hardening.
4. **Rollback**: revert the UI/router/localization/test patch only. No DB migration or on-host mutation is performed by the code patch; live installs, once a user has authorized them, are managed by the existing Installed Apps lifecycle rather than by reverting frontend code.

The release gates G3 (system installer), G4 (authenticated Host E2E), G5 (Docker+app E2E) and G6 (recovery) are **not** passed by this feature alone.


## Durable install task-ID admission (2026-10-15)

The authenticated Agent `POST /apps/install` now makes a **single atomic TaskDB primary-key claim** before calling the existing installation service. The task ID is required to be a canonical UUID if supplied; legacy clients without a task ID receive a generated UUID internally. A reused ID is rejected, including after Agent restart, even if its previous task failed. This guards against two requests with the **same task ID** performing duplicate Docker/DB work or truncating the same log file.

The persisted receipt begins as `App / TaskInstall / Executing` with `resource_id=0`. The existing task runner owns progression once the installation service creates an AppInstall and links that ID to the task. If the synchronous admission fails, a constrained update marks only an unlinked receipt Failed; it **never releases** the ID and cannot overwrite a linked task. A previously rejected, interrupted, or unlinked record is evidence of attempted admission, **not proof of installed resources**.

Non-goals and remaining gaps: this does not deduplicate **different task IDs** racing for the same application name, prevent an internal/non-HTTP caller from bypassing the API guard, guarantee atomicity between the separate TaskDB and application DB, or solve a crash between an AppInstall insert and Task.Execute. The existing runner still uses `Save` on the claimed row; fault injection and crash recovery are required to validate its lifecycle. The TaskDB receipt is inspectable by existing task list APIs but may not yet have a task log file if synchronous setup failed. Per-name serialization and backend outcome contract remain unverified for G5.

Test evidence required: `cd agent && go test ./app/service -run '^TestAppInstallTaskAdmission' -count=1` (concurrent same-ID claims, open another SQLite connection, failure persistence, and started-task protection), plus API route-order static contract. Real host restart/crash, different-ID collisions and installed-state reconciliation remain **NOT RUN**.


## Unlinked App install receipt diagnostics (2026-10-15)

The Agent reserves an installation Task UUID in TaskDB before it creates any execution log or associates an AppInstall resource ID. If installation fails or the process exits in that window, the Task record survives but its `log_file` can be empty. The inherited Task Log API previously tried to open an empty file path and returned an error; a user could not inspect the receipt surfaced by the App Store's retry guard.

The Task Log API now provides a **read-only synthetic admission diagnostic** exclusively for `TaskScopeApp + TaskInstall + resource_id=0 + empty log_file`, retaining the recorded TaskDB status. It queries AppInstall DB for a case-insensitive same-name count and presents one of three outcomes: **no name match**, **one or more name matches**, or **DB lookup unavailable**. None is a confirmed Docker or filesystem outcome. A same-name row is **not operation-linked** and could have been created by a different Task UUID. Missing AppInstall is also **not proof** that side effects never happened.

The normal log viewer disables polling and download for this `scope=admission` diagnostic, and instructs the operator to inspect original-node installed-app state, Task history, Docker containers and persisted filesystem state **before attempting any retry**. No rows, containers, volumes, tasks or secrets are modified, and no background recovery or auto-delete is initiated.

Tests: `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_app_install_receipt.py' -v` and `cd agent && go test ./app/service -run '^(TestAppInstallTaskAdmission|TestAppInstallAdmissionReceipt)' -count=1`. The real API/browser/Docker and crash/lost-ACK Golden Path is still **NOT RUN**; G3–G6 and multi-node readiness remain open.
