# `backend/internal/operation` — bounded in-memory operation lifecycle

Independent Apache-2.0-licensed slice of the `backend/` module: a typed,
bounded, in-memory operation registry intended for a later Assist integration
slice. **No executor, no persistence, no API.** Standard library only; it
imports nothing from `core/` or `agent/`.

## Durability and integration limits (read before wiring anything)

- **In memory only.** Every record lives in one `Store` instance and is lost
  when the process restarts. Nothing is written to disk or any database.
- **Not durable, not API-connected.** There is no HTTP handler, route, session,
  CSRF, schema or `/api/*` contract in this package, and none was changed.
  It is a candidate library awaiting integration.
- **Loss on restart.** After a restart the registry is empty: operation
  identities, states, timeouts and verifications are gone.
- **Restoration cannot automatically replay.** Any future restore path must not
  re-execute restored records through this package — this package cannot
  execute anything, and a restored `completed/failed/unknown` record is a
  historical fact, not a resumable task. Re-establishing work requires a fresh
  `Claim` with a caller-chosen key, decided by the integrating owner.
- **Trusted owner is caller-established.** Every method takes an `Owner`. The
  package performs no authentication and provides no HTTP feature: it cannot
  distinguish a real session from a self-reported header. The caller must pass
  an owner established by its own authenticated upstream; forwarding
  client-claimed owner strings voids every ownership guarantee below.

## What it enforces

State machine (`planned -> running -> completed | failed | unknown`):

- **Identity and idempotency.** `Claim` atomically reserves `(owner, key)`.
  Concurrent identical claims produce exactly one identity; retries replay it
  (`replayed == true`). Resource change → `ErrBindingMismatch`; parameter
  change → `ErrDigestMismatch` (parameters are SHA-256 digested and the raw
  bytes are never retained).
- **Ownership.** Queries and mutations by a foreign owner are
  `ErrOwnershipDenied`; keys are scoped per owner. Enforced for `Get`, `Begin`,
  `Complete`, `Fail`, `Verify`; `Reconcile` only touches the caller's own
  records. Tests: `TestForeignOwnerMutationsDenied`,
  `TestReconcileScopedToOwnerLeavesForeignRecords`.
- **Capacity.** A finite, explicitly configured record bound. Overflow is an
  explicit `ErrCapacity`; live records are never evicted to make room
  (`TestCapacityRejectsWithoutEviction`, `TestConcurrentClaimsWithFiniteCapacity`).
- **Expiry.** `RecordTTL` from creation. Dead (non-running) expired records
  become unreadable (`ErrExpired`), are not replayable, keep occupying capacity
  until `Reconcile` purges them — the purge releases the key, so key reuse
  after purge yields a fresh identity.
- **Bounded timeout.** Only `Reconcile` applies clock-driven change: a running
  record past `Deadline` becomes `unknown`; later outcomes
  (`Complete`/`Fail`/`Begin`) are `ErrInvalidTransition`. Queries (`Get`,
  `List`) never transition, execute or replay anything
  (`TestQueriesNeverReconcileTransitionOrExecute`).
- **Idempotency matrix.** `Claim` replays; `Begin` replays when already
  running; `Complete`/`Fail` are one-shot (duplicate → `ErrInvalidTransition`);
  `Verify` replays only an identical observation (conflict →
  `ErrVerificationConflict`).
- **Independently verified outcome.** State (what was reported) and
  `Verification` (what an independent observer saw) are two distinct facts;
  disagreement is preserved and `Operation.IndependentlyVerified()` stays
  false.
- **Cancellation and concurrency.** Every method honours `context.Context`
  before mutating; a `Store` is a mutex-guarded struct that spawns no
  goroutines, keeps no queue and no package-level registry.
- **Deterministic tests.** An injected `Clock` drives expiry/timeout tests;
  no sleeps.

## Public surface

`New(Config)` → `Claim`, `Get`, `List`, `Begin`, `Complete`, `Fail`,
`Reconcile`, `Verify`. All values returned are caller-owned snapshots.

## Provenance and rights review

- **Origin:** independently implemented from the task functional specification
  and public Go/Linux standard semantics. **No** code, comments or structure was
  copied, translated or adapted from the read-only research tree
  `/home/avaarg/workspace/agentaliyun/agent/` (license-mixed, contains
  GPL/reverse-engineered material), from `core/`, or from `agent/`.
- **Dependencies:** Go standard library only (`context`, `crypto/rand`,
  `crypto/sha256`, `encoding/hex`, `errors`, `fmt`, `sort`, `sync`, `time`).
  No `go.mod` change was needed or made.
- **License:** each new file carries `SPDX-License-Identifier: Apache-2.0` as
  requested by the owner. This is a **file-level statement about newly written
  files only**; it does not relicense inherited code, and root `LICENSE` /
  `NOTICE.md` are untouched.
- **Remaining rights review (open):** the functional specification itself was
  written for this task, but an independent reviewer must still confirm (a)
  no behavioral wording mirrors license-encumbered sources, (b) SPDX headers
  are acceptable for the future distribution plan, and (c) attribution
  obligations for the `backend/` module as a whole. Nothing here constitutes a
  legal conclusion.

## Tests

```sh
cd backend && go test -race -count=1 ./internal/operation/ && go vet ./internal/operation/
```

Covers: denied ownership, digest mismatch, resource binding mismatch, replay,
simultaneous claim/begin, expiry reclaim, timeout → unknown, late outcome
rejection, invalid transitions, capacity rejection, context cancellation,
verification agreement/disagreement, input bounds, snapshot isolation and
race-detector runs over mixed concurrent access.
