# `backend/internal/operation` — bounded in-memory operation lifecycle

Independent Apache-2.0-licensed slice of the `backend/` module: a typed,
bounded, in-memory operation registry intended for a later Assist integration
slice. **No executor, no persistence, no API.** Standard library only; it
imports nothing from `core/` or `agent/`.

**Not a safe executor ledger.** This package is an in-memory lifecycle library
only; it holds no durable outcome knowledge and cannot make retry decisions
safe by itself. Design decisions, owners, risks, removal triggers and the
blocked-integration list live in [DECISIONS.md](DECISIONS.md) (D1–D6, written
for independent review `REQUEST_CHANGES` on candidate `96442b68`; F1/F2
addressed there and below).

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
- **Post-purge and post-restart claims lose outcome memory (review F1 / D1).**
  After `Reconcile` purges a record, or after a process restart, an identical
  claim (same owner/key/params) returns a **fresh `planned` identity that is
  indistinguishable from a brand-new request**: the earlier outcome — even a
  verified-completed one — is unrecoverable here. An integrator must **not**
  auto-`Begin` or re-execute a client retry of possibly-successful work without
  durable outcome knowledge held outside this package for at least the client
  retry horizon, and must **refuse** re-execution when that knowledge is
  absent or uncertain. A retained `unknown` outcome is refused at claim replay
  (`ErrInvalidTransition`) so it can never be silently re-opened while its
  record exists. Executor integration is blocked until an integrator-side
  durable completed/unknown outcome ledger exists (DECISIONS.md D1).
- **Reclamation owner (review F2 / D2).** Dead records free capacity only via
  `Reconcile(owner)`. In the single-host phase the **trusted backend
  authentication lifecycle** owns each principal's store and is responsible
  for reconciling it over the principal's lifetime, including after the
  principal departs. This package has no cross-owner janitor and grants no
  cross-owner privilege; a departed principal that is never reconciled keeps
  its dead records in capacity until the auth lifecycle reclaims them.
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
- **Expiry and retention.** `RecordTTL` from creation. Dead (non-running)
  expired records become unreadable (`ErrExpired`), are not replayable, and
  keep occupying capacity until `Reconcile` purges them — the purge releases
  the key, so key reuse after purge yields a fresh identity (see the
  post-purge warning above). A terminal record (completed/failed/unknown) is
  additionally retained, queryable and verifiable for an operator-chosen
  `ObservationWindow` measured from its terminal transition, even if the TTL
  elapsed while it ran (DECISIONS.md D5).
- **Bounded timeout.** Only `Reconcile` applies clock-driven change: a running
  record past `Deadline` becomes `unknown` and stays queryable for the
  observation window; later outcomes
  (`Complete`/`Fail`/`Begin`) are `ErrInvalidTransition`. Queries (`Get`,
  `List`) never transition, execute or replay anything
  (`TestQueriesNeverReconcileTransitionOrExecute`).
- **Idempotency matrix.** `Claim` replays — except on an `unknown` outcome,
  which is explicitly refused; `Begin` replays when already
  running; `Complete`/`Fail` are one-shot (duplicate → `ErrInvalidTransition`);
  `Verify` replays only an identical observation (conflict →
  `ErrVerificationConflict`).
- **Independently verified outcome.** State (what was reported) and
  `Verification` (what an independent observer saw) are two distinct facts;
  disagreement is preserved and `Operation.IndependentlyVerified()` stays
  false on disagreement. Warning (D3): `true` includes `unknown` agreeing with
  `unknown` — it is **not** a success and **not** a replay-safety gate; gate
  success on `State == completed && Verification.Result == succeeded`.
  Ordering caveat (D5/D4): `Verification.At` is an informational stamp from
  the injected clock and is not guaranteed to sort after `EndedAt` under
  arbitrary clocks; record order comes from the store's internal sequence.
- **Cancellation and concurrency.** Every method honours `context.Context`
  before mutating; a `Store` is a mutex-guarded struct that spawns no
  goroutines, keeps no queue and no package-level registry.
- **Deterministic tests.** An injected `Clock` drives expiry/timeout tests;
  no sleeps.

## Public surface

`New(Config)` → `Claim`, `Get`, `List`, `Begin`, `Complete`, `Fail`,
`Reconcile`, `Verify`. All values returned are caller-owned snapshots. All
`Config` bounds (`Capacity`, `RecordTTL`, `RunningTimeout`,
`ObservationWindow`) are required and operator-chosen; the package sets no
speculative defaults or upper bounds (DECISIONS.md D6).

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
