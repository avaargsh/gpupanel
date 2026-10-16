# DECISIONS — `backend/internal/operation`

Package-local design record, linked from this package's README. Each entry
records decision, owner, risks, removal trigger and acceptance tests. There is
no tracker issue number by design: this file *is* the linked local record for
this isolated slice; when the integration layer lands a repository-wide ADR,
the entry is converted and linked there, not duplicated.

**Status of the package itself:** an in-memory, non-durable lifecycle library.
It is **not a safe executor ledger** and must not be presented as one: no
durable outcome knowledge, no cross-restart identity, no execution. Executor
integration is **BLOCKED** on D1 and D2.

---

## D1 — Retry after purge or restart loses outcome memory; auto-Begin and re-execution of retries are forbidden

- **Decision (addresses review F1, probe P2):** the package documents, as a
  hard integration contract, that after `Reconcile` purges a record or the
  process restarts, an identical `Claim` (same owner/key/params) yields a
  fresh `planned` identity that is **indistinguishable from a brand-new
  request**. The outcome of the earlier operation (completed, failed, even
  verified-completed) is unrecoverable from this package. Therefore:
  (a) an integrator must never `Begin` (or route to an executor) a claim that
  is a retry of possibly-already-successful work without **durable outcome
  knowledge held outside this package for at least the client retry horizon**;
  (b) when that durable knowledge is absent or uncertain, the integrator must
  **refuse** re-execution, not guess. In-package, a retained `unknown` outcome
  is additionally refused at `Claim` replay (`ErrInvalidTransition`) so an
  uncertain outcome can never be silently replayed while its record exists.
- **Owner of the future durable outcome ledger:** the trusted backend slice
  that integrates this package (authenticated backend lifecycle), not this
  package. **Owner of this decision record:** package author, revisited at
  integration review.
- **Risks:** a client retry of successful work after TTL/purge/restart can
  re-open execution-capable state; the package cannot detect it (memory-only).
  Mitigation exists only on the integration side.
- **Removal trigger:** when a durable completed/unknown outcome store with
  retention ≥ the client retry horizon is implemented, tested and reviewed,
  this restriction is replaced by that store's replay semantics and this entry
  is retired in the same change.
- **Acceptance tests (in package):** `TestUnknownOutcomeStaysQueryableWithinObservationWindow`
  (post-purge identical claim = fresh planned identity, refusal before purge),
  `TestCompletedOutcomeRetainedForObservationWindow`, `TestExpiryDeniesReadsAndReplayUntilExplicitReclaim`,
  `TestLateOutcomeAfterTimeoutRejected`.
- **Integration status: BLOCKED.** No executor wiring until (a)+(b) hold.

## D2 — Reclamation owner is the trusted backend auth lifecycle (per-principal stores); no silent cross-owner privileges

- **Decision (addresses review F2, probe P1 / remaining check R1):** expired
  records are reclaimed only by `Reconcile(owner)`. In the single-host phase
  the **trusted backend authentication lifecycle** owns one `Store` per
  authenticated principal (or drives `Reconcile` for the principal) and is
  responsible for calling it over the principal's session/activity lifetime,
  including after a principal departs. This package deliberately has **no
  cross-owner janitor and grants no cross-owner privilege**: a store-wide
  sweep would let one principal act on another's records and would need its
  own threat model.
- **Owner:** integration slice owning authentication lifecycle; this package
  keeps reclamation owner-scoped.
- **Risks:** if the integrating layer fails to reconcile an abandoned
  principal, that principal's dead records keep occupying global capacity
  (explicit `ErrCapacity` for everyone else) until reclaimed — a documented
  availability dependency on the auth lifecycle, not a hidden fallback.
- **Removal trigger:** if a cross-owner reclamation path is ever needed, it
  must be added as a new decision entry with a design exposing no foreign
  record content plus denial tests; it must not appear silently.
- **Acceptance tests:** `TestReconcileScopedToOwnerLeavesForeignRecords`,
  `TestForeignOwnerMutationsDenied`, `TestReconcileRejectsOversizedOwner`,
  `TestConcurrentClaimsWithFiniteCapacity`.
- **Integration status: BLOCKED** until the auth-lifecycle reclamation owner
  is wired and its departed-principal behavior is tested.

## D3 — `IndependentlyVerified` is agreement, not success and not a replay gate

- **Decision (addresses review F4, probe P6):** the boolean reports that an
  observation agrees with the terminal state — including `unknown` agreeing
  with `unknown`. It must never be used as a "safe to report/replay" gate.
  Success is gated on `State == completed && Verification.Result == succeeded`;
  replay safety is gated on D1's durable outcome knowledge. An `unknown`
  record refuses replay regardless of the boolean.
- **Owner:** package author; enforced at integration review.
- **Risks:** a future caller misreads `true` as "outcome known and safe";
  mitigated by the doc warning, the explicit success gate and refusal on
  unknown.
- **Removal trigger:** none while the API exists; revisit if the API is split
  into named predicates (`OutcomeSucceeded()`, `ObservationAgrees()`).
- **Acceptance tests:** `TestUnknownVerificationIsNeitherSuccessNorReplayGate`,
  `TestVerifyAgreementAndDisagreementAreDistinct`.

## D4 — Injected-clock timestamp ordering is not guaranteed

- **Decision (addresses review F5):** `Verification.At`, `EndedAt` and
  friends are informational stamps from the injected `Clock`. Under arbitrary
  clocks (steps backward, no monotonic reading) `At` may precede `EndedAt`;
  nothing is clamped. Ordering semantics are carried by the store's monotonic
  record sequence (`List`/reports), not by comparing timestamps.
- **Owner:** package author; revisited when any persistence slice exists
  (persistence must define its own base-time and ordering rules).
- **Risks:** evidence timelines built by comparing stored timestamps can be
  misleading with hostile/misconfigured clocks; production default clock
  carries Go monotonic readings which limits the risk to injected clocks.
- **Removal trigger:** persistence design supersedes this with explicit
  ordering rules.
- **Acceptance tests:** none beyond documented behavior (no timestamp-order
  assertions exist or are promised).

## D5 — Terminal outcomes are retained for an explicit bounded observation window

- **Decision (reviewer observation on unknown retention):** a terminal record
  (completed/failed/unknown) stays queryable until `max(ExpiresAt,
  EndedAt+ObservationWindow)` even if the record TTL elapsed while it was
  running; only then does it become reclaimable. `ObservationWindow` is a
  required operator-chosen bound. Replay from `unknown` is refused within the
  window (D1).
- **Owner:** package author; window value chosen by the integrating operator.
- **Risks:** window memory cost is operator-controlled; too-short windows
  shrink the reconciliation view, too-long windows hold capacity.
- **Removal trigger:** replaced wholesale by D1's durable outcome store.
- **Acceptance tests:** `TestUnknownOutcomeStaysQueryableWithinObservationWindow`,
  `TestCompletedOutcomeRetainedForObservationWindow`,
  `TestRunningRecordHeldUntilTimeoutThenPurgedNextCycle`.

## D6 — Configuration bounds are operator-chosen; no speculative upper bounds in code

- **Decision (addresses review F6):** `Capacity`, `RecordTTL`,
  `RunningTimeout` and `ObservationWindow` are all required; the package
  rejects missing or incoherent values (`RecordTTL` must exceed
  `RunningTimeout`) but deliberately sets **no arbitrary upper bounds** —
  recommended operating ranges belong to the integration slice's operator
  documentation, not to library code guessing workloads.
- **Owner:** integration slice operator docs; validation owned by this package.
- **Risks:** a misconfigured integrator can pick extreme retention; behavior
  is safe (no panics at clock/year extremes, reviewed) but memory-bounded only
  by `Capacity`.
- **Removal trigger:** if operator-doc ranges harden into policy, enforce them
  at the integration layer.
- **Acceptance tests:** `TestConfigRejectsMissingOrIncoherentBounds`.
