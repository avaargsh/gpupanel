# Native Linux Principal Proof — isolated verification primitive

- Date: 2026-10-20
- Status: **EXPERIMENTAL / NOT WIRED** — Go package + tests, no live API
- Product: [Mobile Agent Workbench #164](https://github.com/avaargsh/gpupanel/issues/164)
- Background: [ADR-0002 proposal](https://github.com/avaargsh/gpupanel/pull/165)
- Depends on **none** of Draft PR #165–#167 (independent main branch)

## What has been implemented

`core/app/principalproof` supplies a short-lived evidence contract for a
future *actual* GPUPanel browser login session and the kernel-observed UID of a
local Unix socket peer. It does NOT start a process, impersonate a Linux user,
read a Codex transcript, grant access to a home directory or authorize execution.

- `Store.Begin(sessionDigest, requestedUID)`: generate an unpredictable
  one-time 32-byte challenge (base64url), bounded to 64 pending requests.
  `sessionDigest` MUST be an SHA-256 digest of the **current server-validated
  session instance**, not the shared `__super_admin__` account ID, arbitrary
  browser parameter, raw cookie, API key or `LOCAL_REQUEST` flag.
- `Store.VerifyUnixPeer(acceptedConn)` on Linux: obtain `SO_PEERCRED` from
  an accepted local AF_UNIX stream socket, read at most a 128-byte challenge,
  match it to the requested UID (1000–60000), consume it once and create only a
  5-minute `IdentityObserved` proof with `ExecutionAuthorized=false`.
- `Store.Lookup(sessionDigest)`: provide a short-lived **observation only**,
  after the caller independently revalidates the same browser session.
- `Store.Revoke(sessionDigest)`: deny pending and verified state immediately.
- Expiry: challenge 60 seconds, proof 5 minutes. Restart drops all memory.
  Issuing another challenge for a session revokes its previous proof.
- Non-Linux builds explicitly refuse the peer credential operation.

## Future integration path — required before any user-visible claim

1. Resolve exact **live browser session instance** from existing Core session
   middleware, including session rotation/CSRF policy. Superadmin **account ID**
   alone is too broad; only the opaque session-instance digest is a suitable key.
2. Serve authenticated/CSRF-checked `begin` on **local node only**. Reject
   API keys, proxy/LOCAL_REQUEST shortcuts, ambiguous principals and root.
   Existing `InspectLinuxPrincipal` preflight is a suitability check, not proof.
3. Introduce a carefully managed Core-owned AF_UNIX listener at a trusted
   filesystem path with explicit access and cleanup rules. **Never** listen
   on TCP, reverse proxy this socket, trust a JSON `uid`, or read challenge
   strings from arbitrary root-owned filesystem paths.
4. Run the pairing CLI as the user's existing non-root Ubuntu login. Send the
   challenge once through the Unix socket; the server verifies SO_PEERCRED.
   Keep nonce and socket paths out of logs and persistent evidence.
5. Wire HTTP status/revoke to the exact current browser session. Logout,
   MFA/password/session rotation, Core restart and changing UID revoke proof.
   No proof can outlive authentication.
6. Only after live end-to-end testing: use the proof as **one prerequisite** for
   a separate, minimal read-only Codex adapter *running as that user*.
   Native app-server authorization, socket ownership, specific Thread IDs,
   process liveness and any write permissions are independent gates.

## Threat model and explicit nonclaims

- Attacker supplies `uid=1001` in an HTTP body or pretends to be the local
  user via headers: denied by separate HTTP auth and kernel socket UID.
- A different Linux UID holding the nonce cannot make a matching proof;
  the mismatched challenge is consumed and denied.
- A replayed, timed-out, revoked, expired or superseded challenge cannot bind.
- The Unix peer credentials attest the process that opened the socket
  connection. A privileged actor or one intentionally passed a socket
  descriptor may require stronger safeguards; this is not a proof of human
  identity or hardware origin.
- No completed browser-session binding exists in this PR. No attached Codex
  runtime, event stream, mobile approval, relay, E2EE or enterprise multi-user
  authorization is implemented.
- This package MUST NOT be wired to a privileged Agent shell, sudo, broad
  local file reader or automatic native `thread/resume`.

## Verification

From `core/`:

```bash
go test ./app/principalproof -count=1
go test -race ./app/principalproof -count=1
```

Unit tests exercise replay, rotation, TTL, capacity and denial. Linux tests use
a *real AF_UNIX connection* and `SO_PEERCRED`; wrong-user coverage targets a
different UID than the current test process. It is **not** a two-account
Ubuntu real-world run.

Real Core HTTP authentication, Linux user login, actual Codex execution, and
GPUPanel G3–G6 candidate acceptance are **NOT RUN**. Retain NO-GO status.
