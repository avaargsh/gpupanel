# App installation read-only evidence snapshot

> Status: Experimental PR; **not** a G5/G6 or production acceptance.
> This is a diagnostic observation, not the right to mutate a deployment.

## Why

The original App Store stores installation metadata in AppInstall DB and
execution logs/IDs in a separate TaskDB. Running Docker containers form a
third source of observed state. A task marked success or failure alone does
not prove the outcome; Agent restart/ACK loss can leave partially completed
installations. The existing app-info endpoint may return installer environment
data and is **not** suitable as a restricted evidence object.

PR #61 independently handles the *pre-execution, unlinked* TaskDB receipt
(resource_id=0, no log file). This slice deliberately handles an *existing*
AppInstall ID only; the two changes do not replace each other.

## Read-only API

`GET /api/v2/apps/installed/evidence/:appInstallId`

- Uses the existing Agent app API route and its current Core/Agent access
  path; no new public socket or direct Docker API.
- Returns only install ID/name/status, latest **linked TaskInstall** UUID/status,
  observed named container states, observation timestamp, classification and
  short reason codes. It deliberately omits installer parameters, credentials,
  app environment, Compose content, TaskDB error logs and raw Docker labels.
- Queries AppInstall DB, TaskDB and *read-only* Docker ContainerList. Performs
  no task creation, Compose Up/Down, DB Save/Update or self-healing.
- `verified` is **always false**. The response is a non-atomic snapshot and is
  never a substitute for independent health/data/owner verification.

### Classification contract

| Classification | Meaning | Never implies |
| --- | --- | --- |
| `CONSISTENT` | App DB says Running, linked install task says Success, expected containers are running and Compose labels agree at observation time | app readiness, data integrity or permission to retry |
| `PARTIAL` | an expected container is absent, or app DB says Running but a container isn't | safe deletion, successful rollback |
| `CONFLICT` | multiple AppInstall rows claim the same container name, or Docker Compose project label differs from expected installation identity | which writer owns the side effect; a custom Compose project may need manual validation |
| `UNKNOWN` | app/task/ownership/Docker evidence unavailable or unresolved install status; no conclusive conjunction | install failure or success |

A linked install task can be missing for older installations; classify UNKNOWN,
do not infer success. If any Docker/DB query is unavailable, return UNKNOWN with
a bounded reason code, not raw internal errors. The names in the response
are the expected and observed *exact* container names as visible to the
current Agent, not an enterprise owner proof.

## Live acceptance still required

1. Authenticate through the GPUPanel product proxy with a role permitted
   to read the specific app installation; deny unauthorized tenants/projects.
   Existing 1Panel admin auth does not by itself certify enterprise RBAC.
2. On disposable Ubuntu, create a real CPU/Jupyter or MaxKB application.
   Observe `CONSISTENT` only if the exact linked task and Docker labels match.
3. Remove/stop a disposable container outside the app flow and confirm
   `PARTIAL` without automatic recreation. Test unavailable Docker -> UNKNOWN.
4. Introduce a controlled container-label mismatch and an intentionally
   conflicting AppInstall record in a disposable test DB -> CONFLICT.
5. Kill Agent during install: pair PR #60 UNKNOWN restart guard with this
   read-only endpoint and PR #61 unlinked receipt view. Confirm **no**
   autonomous retry, deletion, down/up, data cleanup or false verified claims.
6. Inspect serialized JSON and browser/network traces for credentials,
   Compose/env/task log contents. Verify cache-control and audit policy
   before exposing this endpoint to multi-tenant users.

## Integration order

This patch is intentionally independent of PR #55 (platform ADRs),
#56 (browser reload guard), #57 (single-process same-name install lock),
#60 (UNKNOWN-on-restart and mutation block) and #61 (unlinked receipt view).
Merge only after conflict review and after tests pass on the **eventual
integration HEAD**. All read-only evidence must be rechecked before any
future operator resolution flow is authorized.

### Tests

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_app_install_evidence.py' -v
cd agent
go test ./app/service -run '^TestAppInstallEvidence' -count=1
go test ./app/api/v2 ./router -run '^$' -count=1
```
