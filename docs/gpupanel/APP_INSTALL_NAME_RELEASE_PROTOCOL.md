# G5 AppInstall name release: internal CAS protocol (NOT wired)

Status: **experimental stacked Draft on GPUPanel #134, M0 / G5 NO-GO**.

This slice addresses a real limitation of durable name admission: simply keeping
`app_install_name_claims` forever makes it impossible to reinstall after a
legitimate uninstall. Blindly deleting the claim, however, may cause a second
installation while the first TaskID already created Docker, Compose or
filesystem resources. The solution is **no public release endpoint yet**.

## Proposed authority and sequencing

1. A separately authenticated, privileged operator selects the original
   **canonical Task UUID**, exact normalized app name and unique release
   request UUID. Raw operator strings and frontend booleans are NOT approval.
2. The internal code reads TaskDB name owner + Task identity/status and the
   corresponding AppDB names. Any conflict, missing Task, AppDB failure,
   saturated scan, AppInstall row, UNKNOWN or Executing **blocks** release.
3. A future *trusted* host observer must independently establish zero
   matching Docker resources, zero matching Compose projects, zero owned
   filesystem resources and no active operations. The current implementation
   supplies only an injected interface; **no real observer exists yet**.
   Two fresh observations must agree around external authorization.
4. A future *trusted* admin authorizer must attest that the operator was
   authorized for this exact name, owner, request and observation digest.
   The current implementation supplies only an injected interface; **no
   real admin approval integration exists yet**.
5. In a single TaskDB transaction, persist an immutable audit row keyed by
   release UUID, then delete the current `app_install_name_claims` row with
   an exact `name_key + original Task UUID + terminal owner Task` CAS.
   The original Task row and task log remain unchanged. Failure to write
   the audit prevents release; a stale/replayed owner cannot be released.
6. Only after that complete release may a **different** canonical Task UUID
   create a new name admission. There is no automatic retry or recreation
   from UNKNOWN.

The audit digest is a local correlation hash over normalized name, original
task and inspected boolean categories. **It is neither a signed attestation
nor a Docker/filesystem inventory**. The actual observer/authorizer must
provide independently checkable evidence and anti-TOCTOU protection before
any exposed release API is permissible.

## Deliberate conservative exclusions

- UNKNOWN/Executing/Canceled outcomes may **not** be released by this
  implementation, even after external observations. UNKNOWN must first gain
  its own independently audited resolution transition (not in this PR).
- No force release, timer/TTL, TaskDB receipt deletion, task status rewrite,
  Docker prune, filesystem cleanup, mutation API, CLI, or "verified" flag.
- No cross-database atomicity across TaskDB, AppDB, Docker and filesystem is
  claimed; DB and host observations are snapshots. A new production route
  must include host identity, operation fencing, stable owned resource IDs
  and privileged actor audit, then be tested on a real disposable Ubuntu VM.
- The TaskDB `AddAppInstallNameReleaseAudit` migration is additive and is
  ordered after `AddAppInstallNameClaims`. No destructive down migration.

## Offline tests and independent release gate

Go tests cover happy-path CAS with retained original Task, single owner
under concurrent releases, replay rejection, missing audit schema rollback,
wrong/stale/partial observer results, UNKNOWN/Executing Task, persisting
AppInstall row, and invalid/mid-review operator authorization. These are
**simulation tests**, not a demonstrated safe real release.

Before the stacked PR can be merged:
- Production-grade read-only Docker/Compose/filesystem observer with
  namespace/host identity, no symlink/path traversal, fixed resource
  ownership and negative/ambiguous evidence refusal.
- Real privileged approver linked to current actor/session/policy with
  anti-forgery verification, expiry, request UUID and durable audit.
- Controlled concurrency and crash/restart tests across TaskDB/AppDB and
  real Docker on a throwaway Ubuntu host; *same installed candidate SHA*.
- Backward/forward migration and rollback evidence for G3–G6.
- Parent #134 must have an independently approved release integration plan.
  A green CI alone is not a reason to ship.

There is **no installed product behavior change** from this stacked branch
until a future approved service exposes and calls these internal interfaces.
