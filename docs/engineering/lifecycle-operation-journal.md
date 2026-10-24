# Durable system-lifecycle operation journal

**Status: implementation slice / not yet wired into production mutation entrypoints.** This journal is an identity, state and audit primitive; it is not an executor and does not make an install, upgrade, uninstall, backup or restore safe by itself.

Issue: [#195](https://github.com/avaargsh/gpupanel/issues/195). Umbrella lifecycle contract: [#191](https://github.com/avaargsh/gpupanel/issues/191). Release acceptance remains governed by [#69](https://github.com/avaargsh/gpupanel/issues/69) and remains M0 NO-GO until the exact-candidate VM gates pass.

## One identity across retries

Every operation is scoped by the tuple:

```text
(trusted owner, normalized target, operation kind, idempotency key)
```

The database enforces uniqueness on this tuple. The operation also binds a canonical request digest and immutable artifact digest. Repeating the same tuple and same digests returns the same operation ID and recorded outcome; reusing the key with a changed parameter or artifact digest is rejected. A replay receipt has `execution_disposition=OBSERVE_ONLY`, never permission to execute again.

The owner must be resolved from a verified Core session/API principal or the trusted host supervisor. Never accept an arbitrary owner string supplied by the caller as authorization. The journal stores digests and safe error codes, not raw parameters, passwords, tokens, logs or backup contents.

## Durable SQLite schema shared by Go and Python

Default database: `/var/lib/gpupanel-lifecycle/operations.db`. It is deliberately outside `/opt/gpupanel` and the product's `core.db`, so application data restore/purge does not erase the fact that a previous operation may already have changed the host. The default journal is root-owned and private (directory mode 0700, file mode 0600); path normalization, regular-file, ownership, permissions, and symlink-ancestor checks run before access.

Two tables are shared across implementations:

- `lifecycle_operations`: one current record per operation identity, binding/artifact digests, state, CAS revision, timestamps, safe error code and last evidence digest.
- `lifecycle_operation_events`: append-only transition receipt history, sequence, owner, from/to state, actor, stage, safe error code, evidence digest and nanosecond timestamp.

The Go package is `core/app/lifecycle`; the host-side CLI is `scripts/gpupanel-lifecycle-operation.py`. Both serialize the same operation IDs, table names, column names, state strings and nanosecond timestamp fields. The Go test suite includes a cross-language interoperability check that writes through each implementation and reads through the other.

## State transitions

```text
planned
  -> preflight
  -> plan_reviewed
  -> backup_sealed (when the operation requires a verified backup)
  -> applying
  -> verifying
  -> completed

Before mutation: planned/preflight/plan_reviewed/backup_sealed
  -> failed_no_mutation

After mutation begins:
  applying/verifying -> rolled_back | unknown | recovery_required

unknown/recovery_required
  -> completed | rolled_back | recovery_required
     only through an explicit reconciliation call with independently
     generated evidence digest and expected state/revision
```

Every transition uses `owner + operation ID + expected state + expected revision` CAS inside a SQLite transaction. Updating the current row and appending its event are one transaction. Repeating the exact same transition is idempotent; a stale revision or conflicting event is rejected.

`completed`, `rolled_back` and `backup_sealed` require an evidence SHA-256. `failed_no_mutation`, `unknown` and `recovery_required` require a bounded safe error code. An error code is not evidence of success.

**UNKNOWN is not a retry state.** Claims replay the existing UNKNOWN record without creating a fresh identity. Normal transitions cannot leave UNKNOWN or RECOVERY_REQUIRED. Only an explicit evidence-backed reconciliation can conclude completed/rolled-back or maintain the recovery hold.

## Host-side CLI examples

These commands only create/read/update the journal; they do not execute lifecycle operations. Use the same key after a lost acknowledgement. Do not put secret data into binding JSON or the idempotency key.

```sh
# Canonical binding bytes are hashed by the trusted caller.
binding_sha="$(printf '%s' '{"version":"v2.4.1","channel":"stable"}' | sha256sum | awk '{print $1}')"

sudo python3 scripts/gpupanel-lifecycle-operation.py claim \
  --owner 'host-supervisor:machine-identity' \
  --target /opt/gpupanel --kind upgrade --key 'upgrade-v2.4.1-2026-10' \
  --binding-sha256 "$binding_sha" --artifact-sha256 '<verified-64-char-sha256>'

sudo python3 scripts/gpupanel-lifecycle-operation.py get \
  --owner 'host-supervisor:machine-identity' --id '<returned-operation-id>'

sudo python3 scripts/gpupanel-lifecycle-operation.py history \
  --owner 'host-supervisor:machine-identity' --id '<returned-operation-id>'
```

The hidden `--db-path` option exists for tests and Go/Python interoperability only. Production should use the default protected location.

## Current scope and remaining work

This first increment provides a durable journal, ownership-scoped reads, digest-bound claims, revision-CAS transitions, append-only events, and tests for restart, duplicate claims, changed bindings, concurrent claims, stale revisions, UNKNOWN refusal and cross-language schema compatibility.

It does **not** yet wire the journal into `core/app/service/Upgrade`, `core/cmd/server/cmd/restore.go`, the release install script, uninstall, backup or restore entrypoints. Until each execution path claims the identity before mutation and advances the same record with independently observed receipts afterward, that path must not be described as idempotent. The existing in-memory `backend/internal/operation` package is not a substitute: its documented state is lost on process restart.

Required before rollout:
1. Exact-HEAD Python contracts, Go `-race`/vet, source policy, frontend baseline, and real Ubuntu 24.04 VM checks.
2. Core session/API owner binding and a durable client idempotency key on upgrade submission; remove the current gap where Upgrade starts a background worker and returns before an operation identity/outcome can be queried.
3. Integrate install/uninstall scripts with a durable operation receipt before/after mutations; do not infer failure means no mutation.
4. Rework CLI restore's ignored copy/delete errors so it cannot print success after a failed data restore, and bind restore to a named backup manifest.
5. Backup/restore manifest, data/schema generation, artifact signature/provenance and explicit backup retention horizon.
6. Failure injection for process kill, lost ACK, duplicate request, concurrent request, reboot, corrupt backup and incompatible database/schema. Keep UNKNOWN blocked until independent reconciliation.
7. Independent review and exact-candidate acceptance. No single source-test PASS may promote G3/M0 from NO-GO.
