# Container operation recovery slice — 2026-10-17

## Problem and precise claim

Previously `ContainerList.runOperate` showed `Started/Stopped/Restarted/Deleted` after HTTP acknowledgement. Such a response does **not** prove Docker terminal state, particularly after response loss. The UI had no recovery hint after reload and allowed an accidental duplicate request.

## Behavior introduced

1. Capture **Host scope + operation + names + local timestamp**; write a validated, non-secret *per-tab* recovery hint to sessionStorage **before the POST**.
2. Refuse a new mutation if the receipt cannot be persisted, another receipt exists (including malformed), a request is in flight, or current list is fetching/error. No token, env or command output is stored.
3. After an ACK, display **acknowledged but unverified**. After timeout/error, display **unknown**, not `failed`. Neither automatically replays.
4. Refresh current list and container counts read-only. This is **observation**, not proof: a filtered/paginated list cannot establish deletion, and a running state alone cannot establish that restart happened.
5. Present an explicit receipt bound to the original Host. Only the user on that Host may acknowledge manual checking and clear the recovery hint; clearing does **not** retry or roll back.
6. The saved hint survives reload in the same tab and prevents repeat action until reviewed.

## Safety limits

- This is **not server-side idempotency, an exactly-once guarantee, a lease, nor a durable audit journal**. Session storage is tab-scoped and can be cleared outside the product; cross-device duplicate protection is not established.
- Existing Go Core / Docker operation endpoint is unchanged. All other container operations, such as create/rename/prune and actions from other clients, are outside this slice.
- A real production-grade completion claim requires an operation ID from Core, server-side idempotency, authoritative Docker state observation, ownership proof, and reconciliation against expected target states.
- A browser fixture is **not** a live Docker acceptance. Keep the real Docker integration run as a release gate.

## Acceptance

- `pnpm --dir frontend typecheck`, build and test; GitHub CI.
- `scripts/browser/container-operation.py` simulates a request with a lost ACK: asserts one POST, recovery hint across reload, no duplicate POST when clicked again, read-only refresh, explicit manual clear.
- `scripts/browser/vnext-shell.py` continues enforcing remote Terminal Host scope, disabled/unknown observations and visual layout.
- Check Host switching, two browser tabs, storage disabled, long batch name lists and actual Docker operations separately before claiming production acceptance.
