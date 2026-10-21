# Session-grant verifier slice: negative security contract

Status: **isolated verifier prototype with tests; not wired to an Agent route and not production authorization**.

This slice is stacked on PR #175 and intentionally stops at a pure Go verification boundary. It verifies a versioned HMAC-SHA256 assertion against an injected key, exact issuer/audience, exact `session:read` scope, a 60-second maximum lifetime, expiry/future issuance, kernel peer UID equality, runtime-derived session owner/liveness, and one-time JTI consumption through an injected replay-store interface.

## Negative cases covered

- Expired grant and future-issued grant.
- Grant lifetime exceeding 60 seconds.
- Wrong authenticated UID claim, wrong kernel peer UID, and root peer UID.
- Wrong audience, over-broad/wrong scope, empty principal/session/JTI.
- Unknown session, unknown owner, non-live session, and session owned by a different UID.
- Tampered claims/signature and undersized verification key.
- Replay-store failure and second use of a valid grant.

## Deliberate limitations

- No Core-side grant issuer, signing-key lifecycle, key rotation, revocation, or secure key storage is implemented here.
- No HTTP route consumes the verifier; passing these tests does not authorize a real request.
- The included in-memory replay store is a test helper only. Production must provide an atomic, shared, durable replay store with expiry cleanup and a defined restart/failover policy. A per-process map is not sufficient for multi-process or multi-replica deployment.
- `SessionOwnerResolver` must be backed by runtime-owned, fresh process/session evidence. Persisted inventory alone is insufficient.
- HMAC proves possession of a shared secret; it does not protect against a compromised Core issuer. Issuer compromise and secret custody require explicit threat-model review.
- Peer credentials identify the process connected to the Agent socket, typically Core, not the browser user. The verifier's `peerUID` input must be obtained from the accepted Unix connection context, never a request header.
- Same-UID process isolation remains unresolved. No prompt submission, shell execution, approval, remote relay, or mobile action is enabled.

Do not merge independently of the dependency chain. Exact-SHA CI, an exact-candidate Ubuntu VM acceptance, package attestation, and independent security review remain required. M0 G3–G6 stay **NO-GO**.
