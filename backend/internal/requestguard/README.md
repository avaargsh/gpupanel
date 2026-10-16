# `backend/internal/requestguard` — protected boundary candidate

Original, Apache-2.0 (file-level `SPDX-License-Identifier: Apache-2.0`),
standard-library-only candidate for the **first protected boundary slice** of a
future Host diagnosis endpoint. It imports nothing from `core/` or `agent/`, copies
no inherited GPL/third-party source, and adds no dependency or `go.mod` change.

**Not wired.** This package has no server, router, startup path, `/api/v1` route,
schema or persistence. It changes no existing auth API. Nothing calls it yet.

## What the middleware does

`Guard` protects one server-configured **fixed target resource**. On each request:

1. Refuse a canceled context (`503`) before any work.
2. Resolve the request through the injected, trusted `Authenticator` to an
   immutable `Principal`. Anonymous (`ErrUnauthenticated`) -> `401`; any other
   authenticator error, including `ErrBackend`, -> `503` (message never echoes
   the error).
3. Enforce the principal: explicit provider `Authenticated`, non-empty bounded
   `Subject` (no surrounding whitespace/control chars), `Admin`, and **exact**
   `Resource` equal to the configured target. No wildcard, no implicit
   current-node fallback. Any failure -> `403`.
4. Re-check cancellation, then for every **non-safe** method require the injected
   trusted `CSRFValidator` (POST is unsafe, including a "read-only" diagnosis
   POST). Invalid/missing CSRF -> `403`. Only exact `GET`/`HEAD`/`OPTIONS` are
   safe; unknown, lowercase and empty methods are fail-closed as unsafe.
5. Optional `OriginValidator` runs only after CSRF passes, only for this
   endpoint's non-safe requests. It must not be used as, or weaken, the existing
   terminal websocket Origin gates; **no websocket/upgrade handling exists here**.
6. Copy the authorized principal into a private typed context key;
   `PrincipalFromContext` returns deep copies. Downstream code cannot mint a
   principal and a caller-supplied context identity never overrides the verifier.

Every refusal is the controlled JSON envelope `{code,message,data}` with a fixed,
non-diagnostic message; responses set no cookies/auth headers and the package logs
no headers or secrets.

## Configuration and trust

`New` fails when the target is missing, padded, oversized or wildcarded, or when
`Authenticator` or `CSRF` is nil, so no Guard can exist without session and CSRF
enforcement. There is no built-in login and no default identity. Self-reported
`X-Panel-Local-Token`, `API_AUTH`, `owner`/`role`/`subject` headers and browser
`user_approved` cookies grant no authority and are ignored for identity.

## Auth equivalence — BLOCKED before routing

The authenticator is an **injected existing/future authoritative session
provider**, not a delivered auth replacement. Before any route uses this Guard,
RSA, captcha, MFA, passkey, API-key, entrance, password-expiry and session
persistence equivalence must be independently proven against Core. Until then,
wiring is **BLOCKED**.

## Tests

`go test -race ./internal/requestguard/` uses synthetic authenticator/CSRF fakes
to prove boundary orchestration and negative ordering only. It never proves real
login. Covered: construction failure, anonymous, authenticator error, redaction,
principal checks (resource/admin/subject), tampered identity/local-token headers,
context override, missing/invalid CSRF, method classification, cancellation,
origin ordering, single downstream call, principal immutability. Threat model:
single-host actor/resource scope; tenant isolation is **not** proven; secrets are
excluded from responses and logs.

## Rollback / removal trigger

Delete this directory and revert its single commit; no runtime state is touched.
Replace with the Core integration slice once real-session equivalence tests and
independent review pass.
