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
2. Cover non-HTTP AppService.Install entry points. Current durable name admission
   is on the authenticated HTTP path; process-local lock alone is insufficient
   to certify other callers as cross-process-safe.
3. Prove the migration handles real legacy data including inconsistent,
   duplicate and truncated task names, and can be rolled back safely.
4. Run the authenticated Core -> Agent -> Docker/AppInstall workflow on a
   disposable Ubuntu VM, including Agent SIGKILL, restart, duplicate POST,
   UNKNOWN evidence inspection, DB reopen, and safe cleanup.
5. Maintain a NO-GO until #69-#72 complete; tests and migration are not a
   release signature or an execution proof.

Rollback of code does **not** undo records of admitted work. No destructive
schema or data down migration is provided; retain TaskDB backups and evidence.
