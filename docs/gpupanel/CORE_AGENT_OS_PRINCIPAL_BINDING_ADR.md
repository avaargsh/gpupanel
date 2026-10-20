# ADR: Core–Agent OS-principal binding for local native sessions

Status: **Proposed; documentation only. No authorization behavior changes.**

Date: 2026-10-20

Related work:
- [Issue #164 — Mobile Agent Workbench](https://github.com/avaargsh/gpupanel/issues/164)
- [PR #167 — Native Codex app-server read-only snapshot probe](https://github.com/avaargsh/gpupanel/pull/167)
- [PR #173 — fail-closed OS peer credential primitive](https://github.com/avaargsh/gpupanel/pull/173)

## Context observed in the repository

1. Core's local Agent reverse proxy dials a Unix socket (currently `/etc/gpupanel/agent.sock`).
2. The Agent master server prepares a private socket directory and socket, checks ownership/mode, and refuses to unlink an existing or stale socket automatically.
3. `agent/app/hostops/linux_principal.go` performs a read-only suitability preflight for a conventional Ubuntu local account. A successful result is `CandidateUnbound`, with `ExecutionAuthorized=false`.
4. The Codex observer's private token-file and authenticated WebSocket checks protect that observer's local native-runtime connection. They do not bind a GPUPanel browser principal to the OS user who owns a native session.
5. PR #173 adds a Python `SO_PEERCRED` primitive, but it is not wired into Core/Agent and does not authorize requests.

These are useful layers, but none currently proves the full relation:

`authenticated GPUPanel principal → authorized local OS UID → verified native session owner → read-only session projection`.

## Decision

Do not treat loopback, a Core-to-Agent Unix socket, a bearer token, a session inventory row, or an OS-account suitability result as sufficient proof of native-session ownership.

The next implementation should be split into small independently testable steps:

### A. Preserve transport admission, add request-scoped peer identity

- Keep the current socket owner/mode and no-auto-unlink behavior.
- On Linux, capture peer credentials from the accepted Unix connection at the server boundary; fail closed if credentials cannot be read.
- Do not accept a caller-supplied UID, PID, username, `HOME`, or browser header as a replacement for kernel credentials.
- Do not interpret a root-owned Core-to-Agent connection as the end-user's OS identity. If Core and Agent communicate as the same service UID, that hop alone cannot distinguish browser users.

### B. Authenticate the application principal independently

- Resolve the browser/API principal only from the existing authenticated Core request context.
- At the Core-to-Agent boundary, propagate a server-authenticated, narrowly scoped assertion over the protected local channel; never trust a client-authored identity field.
- The assertion must bind a stable principal identifier to the intended local UID and a specific operation. If the current architecture cannot securely establish this binding, return `UNKNOWN/UNBOUND` rather than guessing.

### C. Introduce a minimal read-only grant contract

A grant, once implemented, must contain at least:
- issuer and audience;
- authenticated application-principal ID;
- local UID;
- explicit read-only scope and allowed resource/session identifier;
- issued-at and short expiry;
- cryptographically unpredictable nonce or unique grant ID;
- server-side one-time consumption/replay rejection.

Signing-key storage, rotation, and verification must be specified before implementation. Do not put signing secrets in frontend code, repository files, environment diagnostics, or Relay payloads. A signed grant is not proof of session ownership unless the server separately verifies the session-to-UID mapping.

### D. Verify native-session ownership separately

- Session ownership must come from a trustworthy runtime-owned source, not a persisted inventory record alone.
- A process snapshot or app-server response is evidence of what was observed, not by itself proof of OS ownership or liveness.
- Never expose prompt text, working-directory paths, environment variables, auth tokens, or arbitrary native metadata in the default read-only projection.
- Unknown, stale, conflicting, or unavailable ownership state must fail closed.

## Required acceptance matrix

| Case | Expected result |
|---|---|
| Missing or unreadable kernel peer credentials | Deny |
| TCP connection presented to Unix-credential helper | Deny |
| Core service UID presented as if it were the browser user | Deny / remain unbound |
| Unauthenticated Core request | Deny |
| Authenticated principal mapped to a different OS UID | Deny |
| Grant has wrong audience or scope | Deny |
| Grant expired, reused, or replayed | Deny |
| Session owner missing, stale, or conflicts with UID | Return unknown/deny; do not expose session data |
| Session belongs to another OS user | Deny |
| Same-UID sibling process cannot be distinguished | Explicitly document residual risk; do not claim per-process isolation |
| Observer returns persisted inventory without runtime proof | Mark unverified; do not claim live/owned |
| Agent/Core restarts during grant use | Reject stale grant; require fresh authenticated issuance |

## Rollout boundary

- First deliver only local-only, read-only discovery for one verified session.
- No prompt submission, approvals, shell execution, remote relay, or mobile action is enabled by this ADR.
- Keep M0 G3–G6 **NO-GO** until exact-SHA Ubuntu VM acceptance, negative security tests, and independent review pass.
- Every PR must report exact candidate SHA, commands and results, plus explicit `NOT RUN` entries for unavailable VM, package-attestation, or independent-review steps.

## Non-goals

This ADR does not implement a grant issuer, session ownership database, browser-to-UID mapping, or runtime authorization. It records the repository-observed gap and a testable direction so that the next code slice does not accidentally promote transport identity into user identity.
