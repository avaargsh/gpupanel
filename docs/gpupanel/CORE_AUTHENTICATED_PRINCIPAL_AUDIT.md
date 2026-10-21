# Core-to-Agent Authenticated Principal Audit

Status: source audit only; no runtime authorization behavior changed.

## Decision

**Do not propagate an end-user OS principal to the Agent yet.** The current Core-to-Agent Unix socket identifies the connecting Core process, not the authenticated browser user. A browser-authenticated principal is available in selected Core handlers, but the reviewed proxy path does not yet define a signed, audience-bound, one-time assertion that the Agent can independently verify.

This audit does not authorize any host operation and does not change the M0 gate: G3–G6 remain NO-GO.

## Reviewed source paths

- `core/middleware/session.go`
- `core/init/router/proxy.go`
- `core/init/router/proxy_host_operations.go`
- `core/init/proxy/proxy.go`
- `agent/server/server.go`
- `agent/server/unix_peer_identity_linux.go` (PR #175)

## Findings

1. **Core has an authenticated session source, but only in the Core trust domain.** `SessionAuth` loads the session via `global.SESSION.Get(c)` and places the session object in Gin context. The proxy path separately calls `checkSession` for relevant requests and has narrow admin checks for host-operation paths. This is a potential source for a future assertion only after auditing route-specific auth modes and bypasses; it does not prove the Agent receives or verifies that identity.

2. **For the proposed app/session projection, the reverse proxy does not establish an Agent-verifiable principal assertion.** `core/init/proxy/proxy.go` rewrites requests for the Unix-socket transport and preserves/rewrites forwarding metadata. The reviewed code does not add a cryptographically authenticated, short-lived assertion with explicit audience, resource/scope, nonce, and replay policy. Client-supplied headers such as `X-Panel-User` are not an acceptable substitute.

3. **Agent-side `SO_PEERCRED` is transport evidence only.** The peer UID/PID/GID belong to the process that opened the Unix connection (normally Core). They must not be interpreted as the browser's user or used to choose a desktop session. The captured identity is not an end-user authorization check.

4. **An existing Core-derived identity-header path exists for terminal sessions, but it is not a general Agent principal assertion.** `core/init/router/proxy.go` clears terminal identity headers before routing, then calls `terminalsession.FromContext` and forwards `X-Panel-User-ID`, `X-Panel-Auth-Session-ID`, and optional lease-expiry headers. `terminalsession.FromContext` derives identity from server-side session context and, for browser sessions, hashes the session cookie; API-key identities have a separate key-derived session ID and lease. Agent terminal handlers consume these as trusted Core-forwarded identity over the private socket. This is a terminal-subsystem trust convention, not a cryptographically verifiable, audience/scope-bound, one-time assertion for the proposed app/session projection. Do not generalize it to new endpoints without auditing route auth modes, socket access controls, header stripping, lease/revocation behavior, and the threat model for a compromised Core process.

5. **Route guards are narrow and do not generalize to every proxied endpoint.** `authorizeHostOperations` and `authorizeLocalAppEvidence` impose explicit local/admin restrictions on their own path families. They are not a global policy for all Agent APIs. Any future assertion must be minted only after the relevant route has completed authentication and authorization.

6. **No safe shortcut was found.** Forwarding a session cookie as a standalone credential, trusting client-supplied user headers, mapping the Core service UID to a local account, or trusting persisted observer/session inventory would create a false identity binding. Existing terminal-specific headers are derived in Core and have their own lease/session lifecycle, but they are not sufficient evidence for the new Agent app/session authorization contract. Until the chain is complete, use `UNKNOWN/UNBOUND` and deny the proposed session projection.

## Required design before wiring identity

- Define a single Core helper that accepts only server-derived session context and an already-authorized, narrowly scoped operation; reject API-key/local-request/anonymous paths unless their authority is separately specified.
- Define an Agent-verifiable assertion format and key lifecycle (issuer, audience, subject/principal ID, local UID, resource/session ID, explicit read-only scope, issued-at, short expiry, random nonce/JTI, signing-key rotation).
- Store and verify the signing key outside client-controlled configuration; reject missing keys, invalid signatures, wrong issuer/audience/scope, expired/future-issued assertions, UID mismatch, and reused/replayed IDs. Do not add a permissive fallback.
- Bind the assertion to the accepted connection/request and consume it once server-side; document the threat model for a compromised Core process and the fact that signatures do not protect against a fully compromised issuer.
- Independently verify the native runtime's session owner and current liveness. A valid app assertion plus a valid Unix peer credential still does not prove a Codex/VS Code session belongs to that user.
- Add negative tests for forged headers, unauthenticated/API-key requests, cross-user session selection, wrong audience/scope, expiry, replay, restart, stale/unknown session state, and Core service UID masquerading as a user.
- Complete exact-SHA Ubuntu VM acceptance and independent review before changing M0 status.

## Explicit non-claims

This audit does not prove end-user-to-UID binding, native session ownership/liveness, same-UID isolation, package signature/attestation, or production readiness. No runtime tests were run for this documentation-only change.
