# OS-principal binding: first implementation slice

Status: **credential primitive only; not an authorization boundary**.

The new `scripts/gpupanel_os_principal.py` helper reads Linux `SO_PEERCRED`
from an already-connected Unix-domain socket. It rejects unavailable/malformed
kernel credentials, invalid PID/GID values, UID 0, non-integer expected UIDs,
and UID mismatches. It never falls back to loopback HTTP, a bearer token,
environment variables, PID files, or caller-provided peer identity.

## What this proves

For a Linux AF_UNIX connection, the kernel reports the peer process PID, UID,
and GID associated with that socket connection. The helper can require the
peer UID to equal an explicit, non-root expected UID. Its unit tests cover
socket-pair credentials, wrong UID, root, malformed payloads, and socket errors.

## What this does not prove

- It does not bind a signed-in GPUPanel web principal to an OS UID.
- It does not prove a Codex CLI or VS Code process owns a persisted session.
- It does not issue, sign, expire, or revoke grants.
- It does not authorize a session read or any action.
- Same-UID processes are not isolated from one another by this primitive alone.
- It is not wired into Core, Agent, app-server export, or the frontend yet.

## Required next steps before use

1. Define a narrow local IPC endpoint with a pinned owner/mode and lifecycle.
2. Establish the authenticated application principal independently; never derive
   it from socket credentials alone.
3. Bind that principal to the kernel-reported UID using a short-lived,
   server-issued grant with audience, scope, expiry, nonce, and replay rejection.
4. Keep session scope explicit and read-only; unknown ownership/status fails closed.
5. Add cross-principal, stale/replayed grant, wrong-session, and service-restart
   tests, then wire the primitive into the actual endpoint.
6. Run the exact-candidate Ubuntu VM acceptance and obtain independent security
   review before changing any release gate.

Until those steps are implemented and verified, this helper is only a tested
low-level primitive. GPUPanel G3–G6 M0 remains **NO-GO**.
