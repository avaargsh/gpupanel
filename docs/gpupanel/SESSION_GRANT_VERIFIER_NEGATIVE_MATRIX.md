# Session-grant verifier slice: negative security contract

Status: **isolated verifier prototype with tests; not wired to an Agent route and not production authorization**.

This slice verifies a versioned HMAC-SHA256 assertion against an injected key, exact issuer/audience, exact match with the independently authenticated application principal, exact `session:read` scope, a 60-second maximum lifetime, expiry/future issuance, the expected Core service peer UID, a separately resolved application-principal-to-OS-UID authorization mapping, runtime-derived session owner/liveness, and one-time JTI consumption through an injected replay-store interface.

## Identity layers must not be conflated

- `SO_PEERCRED` identifies the process connecting to Agent (typically the Core service). `ExpectedPeerUID` pins that transport identity to the configured Core service UID.
- The target session UID is **not** inferred from `SO_PEERCRED`. `PrincipalUIDResolver` must independently map the authenticated server-side application principal to the OS UID that principal is authorized to observe.
- The grant's UID must match both that authorized mapping and fresh runtime session-owner evidence.
- `expectedPrincipal` must come from authenticated server-side request context. It must never be copied from grant claims or client headers.
- The current resolver is an injected contract/test double. No production principal-to-UID mapping or Core grant issuer is implemented by this PR.

## Negative cases covered

- Expired grant and future-issued grant.
- Grant lifetime exceeding 60 seconds.
- Principal mismatch, unmapped application principal, wrong grant UID, wrong Core peer UID, and root peer UID.
- Wrong audience, over-broad/wrong scope, empty principal/session/JTI.
- Unknown session, unknown owner, non-live session, and session owned by a different UID.
- Tampered claims/signature and undersized verification key.
- Replay-store failure, missing principal-to-UID resolver, and second use of a valid grant.
- Concurrent replay race: 32 simultaneous verification attempts against the same grant must yield exactly one acceptance and 31 replay denials.
- Malformed signature encoding, wrong issuer, and unsupported grant version.

## Deliberate limitations

- No Core-side grant issuer, signing-key lifecycle, key rotation, revocation, or secure key storage is implemented here.
- No HTTP route consumes the verifier; passing these tests does not authorize a real request.
- The included in-memory replay store is a test helper only. Production must provide an atomic, shared, durable replay store with expiry cleanup and a defined restart/failover policy. A per-process map is not sufficient for multi-process or multi-replica deployment.
- `SessionOwnerResolver` must be backed by runtime-owned, fresh process/session evidence. Persisted inventory alone is insufficient.
- `PrincipalUIDResolver` must be backed by an explicit trusted authorization policy; deriving a mapping from the grant itself is circular and forbidden.
- HMAC proves possession of a shared secret; it does not protect against a compromised Core issuer. Issuer compromise and secret custody require explicit threat-model review.
- The verifier checks that the connecting process is the configured Core service and separately checks the app-principal-to-target-UID mapping. It does not prove browser-to-OS binding by itself; that mapping must be supplied by an authenticated, reviewed authority.
- Same-UID process isolation remains unresolved. No prompt submission, shell execution, approval, remote relay, or mobile action is enabled.

Do not merge independently of the dependency chain. Exact-SHA CI, an exact-candidate Ubuntu VM acceptance, package attestation, and independent security review remain required. M0 G3–G6 stay **NO-GO**.
