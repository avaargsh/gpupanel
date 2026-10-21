# Mobile Agent Workbench: read-only projection contract

Status: **proposal only**. This document does not declare a mobile API, relay integration, native-session liveness, or production acceptance as implemented. It defines the next safe slice for issue #164.

## Decision

Start with a **read-only mobile projection** of an already-observed native Codex session. The mobile client may list and inspect bounded session metadata and attention summaries. It must not start/resume a runtime, submit prompts, approve tools, send terminal input, or mutate a session in this slice.

The source of truth remains the native runtime / Agent Host. GPUPanel Core is the authenticated projection boundary. A Relay, if used, is a transport and delivery component—not the runtime authority. The existing `wechat-ahp-client` approval client remains maintenance-only until its real-device AHP acceptance gate is satisfied.

## Scope for the first mobile slice

Included:
- list only sessions visible to the authenticated, explicitly bound OS principal;
- stable opaque session ID and runtime identifier;
- created/last-observed timestamps;
- project label only when safely available; never expose a full local path;
- observation timestamp, observer scope, and explicit liveness state;
- read-only attention summary with opaque attention ID and generic category;
- refresh, disconnected, expired, forbidden, and unknown states.

Excluded:
- prompt/reasoning/tool arguments/output, diffs, source code, command text, environment variables, credentials, full paths, and arbitrary file reads;
- session start/resume, user input, terminal, tool approval, delegated execution, auto-approval, and offline action queues;
- treating imported JSON, a loopback address, a bearer token, or a shared admin account as proof of native process ownership;
- using a newly launched app-server process as evidence that an existing CLI/VS Code process is alive.

## Proposed read-only response envelope

The following is a **design example**, not a committed API contract:

```json
{
  "schemaVersion": 1,
  "observedAt": "2026-01-01T00:00:00Z",
  "observer": {
    "runtime": "codex",
    "scope": "attached-owner-verified-unix-appserver",
    "identityBound": true
  },
  "connection": "available",
  "sessions": [
    {
      "sessionId": "opaque-native-id",
      "projectLabel": "example-project",
      "createdAt": "2026-01-01T00:00:00Z",
      "lastObservedAt": "2026-01-01T00:00:00Z",
      "liveness": "unknown",
      "attention": []
    }
  ]
}
```

The example timestamps and IDs are placeholders. A successful metadata query does **not** establish global liveness; keep `liveness: unknown` unless an independently reviewed native signal proves otherwise. Never copy this example into production evidence.

## State semantics

| State | Meaning | Client behavior |
|---|---|---|
| `available` | A fresh, authenticated read-only observation succeeded. | Render only returned fields and observation time. |
| `unavailable` | The observer cannot currently provide a fresh observation. | Clear prior session rows or mark them explicitly stale; never present old rows as current. |
| `unknown` | The operation/result cannot be established. | Show unknown and allow a safe read-only refresh. |
| `forbidden` | Principal, device, session scope, or authorization is invalid. | Fail closed; do not fall back to another user or local admin. |
| `expired` | The short-lived identity binding or observation grant expired/revoked. | Re-authenticate and re-bind; do not replay previous grants. |

A transport ACK is not proof that a native state change occurred. If any future mutating operation loses its ACK, it must return `UNKNOWN`, query authoritative state, and never blindly repeat the action.

## Trust and authorization requirements

Before the mobile projection can be enabled beyond a manually selected local fixture:

1. Bind the exact authenticated GPUPanel browser session instance to a non-root Linux OS principal using the reviewed local peer-proof flow. Do not bind only to a shared account ID.
2. Verify the native observer endpoint ownership and UID on the connected Unix socket. Fail closed on unsupported platforms, wrong UID, stale/replayed grant, unexpected socket permissions, or missing proof.
3. Scope every read to the proven principal and an explicit native session ID; reject cross-UID and cross-session requests.
4. Keep grants short-lived, one-use where appropriate, revocable on logout/session rotation, and absent from URLs, browser storage, logs, and exported snapshots.
5. Keep Relay free of source code, full paths, prompts, credentials, native session tokens, and arbitrary event payloads.
6. Preserve native Host/runtime authority. No API route may translate a read-only observer grant into execution authorization.

The merged `principalproof` and opt-in pairing code are prerequisites, not end-to-end proof that a real browser session is bound to the actual native Codex process. Do not infer acceptance from package/unit tests alone.

## Required tests before implementation can be accepted

- authenticated same-principal read succeeds; anonymous/API-key/forwarded request fails;
- second OS UID and another user's session are rejected;
- stale, replayed, expired, revoked, or rotated grants fail closed;
- unexpected socket owner/mode, non-Linux, absent endpoint, timeout, malformed protocol, and disconnect produce unavailable/unknown with no stale success;
- session IDs are bounded and opaque; no prompt, reasoning, tool payload, full path, source, token, or secret appears in response or logs;
- reconnect requires a fresh observation; prior rows do not remain marked current;
- exact commit SHA, runtime version, OS, principal setup, commands and redacted observations are recorded;
- real Ubuntu host + actual installed Codex app-server + signed-in GPUPanel browser acceptance is recorded separately from CI and synthetic fixtures.

## Implementation order

1. Reconcile and review the existing stacked read-only candidates (#166, #167, #171) against current `main`; do not merge stale-base branches blindly.
2. Independently review the merged principal-proof integration and complete the real browser-session ↔ OS UID negative matrix.
3. Implement an authenticated, principal-scoped **read-only** Core projection using the existing native observer. Do not introduce a second Agent Runtime or new Relay repository.
4. Add mobile rendering only after the projection contract, redaction, failure semantics, and real-host observation pass review.
5. Revisit write/approval features only after separate owner review, exact-device AHP acceptance, and documented customer value.

## Current acceptance status

- Contract: proposed in this document.
- Existing native session inventory / observer candidates: review and dependency reconciliation required.
- Browser session ↔ OS principal end-to-end: **NOT RUN / not accepted**.
- Existing Codex runtime live observation on a real host: **NOT RUN / not accepted**.
- Mobile projection API / Relay synchronization: **NOT IMPLEMENTED by this document**.
- Mobile writes, approvals, terminal, or delegated execution: **out of scope**.
- GPUPanel G3–G6 release gate: unchanged; this work does not promote release readiness.
