# G5: Durable AppInstall name admission (experimental)

Status: **Draft / no M0 G5 GO**. This change is a conservative TaskDB
admission fence, not a completed AppInstall reconciliation engine.

## Why it exists

A single Task UUID was already reserved durably, and `lockAppInstallPreparation`
serialized the synchronous same-name phase only **within one process**.
Two requests with different UUIDs but the same normalized name could both
reserve distinct TaskDB rows, particularly across Agent processes or restart
before an AppInstall row was created. That is unsafe when Docker/network/
filesystem side effects may already have begun.

## Authority and lifecycle

- TaskDB owns `app_install_name_claims`, keyed by
  `strings.ToLower(strings.TrimSpace(request.name))` with a 255-byte bound.
  Each row carries the original Task UUID. Task ID and name ownership are
  inserted in ONE TaskDB transaction with durable unique constraints.
- Conflicts deny the new request; no Docker side effect is entered by the
  HTTP handler. Failed transactions roll back the newly inserted Task record.
- Before the shared `AppService.Install` path performs even its first Docker
  network mutation, `BeginAppInstallExecution` consumes a durable
  `execution_started_at IS NULL` transition. It matches the canonical
  Task UUID, normalized owner name and persisted Executing App/TaskInstall
  receipt in the *same SQL UPDATE*. Once consumed, the execution attempt
  cannot be replayed, even after a crash before external side effects.
- **Non-HTTP callers fail closed** unless they explicitly arrange the same
  previously authorized durable Task/name admission; the shared service
  method does not silently generate a new ID, reserve a name or grant an
  approval. This is a safety boundary, not a finished non-HTTP UX.
- Claim remains after **SUCCESS, FAILED, UNKNOWN, restart, or lost ACK**.
  Never infer safe reuse from a Task status. Existing TaskDB Task receipts
  and their logs remain inspectable.
- Installed App name lookup and process-local preparation lock still run as
  secondary checks in AppService; neither replaces durable TaskDB admission.
- No timer/TTL, retry, background cleanup, auto-Docker prune, or implicit
  release is provided. **No delete/release API is added in this PR.**
- New installation of a previously used name after successful uninstall is
  deliberately unavailable until a reviewed, evidence-bound release protocol
  is introduced. This is not a final product UX; reviewers must resolve the
  release contract before considering a production deployment.
- The `agent.db` AppInstall table, Docker containers and TaskDB live in
  distinct state domains; a TaskDB claim cannot prove actual deployment.

## Upgrade and historical data

A new append-only TaskDB migration creates the name claim table and copies
legacy `App/TaskInstall` entries still `Executing` or `UNKNOWN`. Legacy
translated task display names ending with ` [name]` are normalized back to
their bracketed resource name, and raw admission names are also accepted.
Ambiguous duplicates keep one blocking name claim and preserve **all**
historical Task rows. An unclassifiable legacy name fails the migration
closed rather than granting a potentially dangerous fresh install.

Historical failed/completed installs without an AppInstall record or with
ambiguous external Docker/filesystem effects still require independent
investigation. The migration does **not** claim that all legacy effects are
reconciled. Test this migration against a backed-up real TaskDB before any
release or upgrade; never install this experimental branch onto a live
production or inherited 1Panel host.

## Read-only name claim recovery preflight

`agent/app/service/app_install_name_review.go` provides
`reviewAppInstallNameClaim(taskDB, appDB, name)` as an **unexposed internal
read model**. It returns a redacted `AppInstallNameReview` with the durable
name key, original Task UUID/status/resource ID, a bounded list of matching
AppInstall IDs, and reason codes. It never returns Docker labels, secret
application variables, logs or Compose content.

Every result returns `verified=false`, `canRelease=false` and
`observationalOnly=true`, including a Success Task, absent AppInstall row,
missing name claim, damaged TaskDB linkage and DB query errors. AppDB scans
are deliberately capped; saturation is not evidence that a name is unused.
This read model neither examines Docker/volumes nor creates a release approval,
CAS transition, journal entry or replayable authorization. It **must not** be
treated as a complete safety verdict or exposed over HTTP without a separate
admin authorization, redaction and rate-limit review.

When the original Task has ResourceID zero, the existing
`/apps/installed/evidence/{id}` is not applicable; this bounded preflight
preserves the TaskID and warns that no persisted AppInstall association is
available. For linked tasks, the independent resource evidence sheet can
be used for human inspection, not as an automatic name-release trigger.

## Verification and remaining G5 work

Tests should cover: concurrent distinct UUIDs/same name (case and whitespace),
reopen/restart after UNKNOWN, TaskDB rollback on name conflict, absent schema
fail-closed, invalid/oversized names, legacy UNKNOWN backfill, and preserving
existing Task history. Run Go race tests and the original API contract checks.

Before G5 acceptance, additionally require:

1. Define a privileged **manual evidence-bound release** that observes the
   original Task UUID, Agent node, AppInstall rows, Docker identity, Compose
   project and persistent filesystem; require explicit operator approval,
   compare-and-swap ownership, audit and idempotent lost-ACK handling.
2. Add explicit normal authorization + durable reservation to legitimate
   non-HTTP AppService.Install callers. The **shared service execution CAS now
   rejects** unreserved non-HTTP callers before any side effects, but this
   does not automatically authorize or enable those workflows.
3. Prove the migration handles real legacy data including inconsistent,
   duplicate and truncated task names, and can be rolled back safely.
4. Run the authenticated Core -> Agent -> Docker/AppInstall workflow on a
   disposable Ubuntu VM, including Agent SIGKILL, restart, duplicate POST,
   UNKNOWN evidence inspection, DB reopen, and safe cleanup.
5. Maintain a NO-GO until #69-#72 complete; tests and migration are not a
   release signature or an execution proof.

Rollback of code does **not** undo records of admitted work. No destructive
schema or data down migration is provided; retain TaskDB backups and evidence.
