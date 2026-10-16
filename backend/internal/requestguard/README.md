# `backend/internal/requestguard` — protected boundary candidate

Original, Apache-2.0 (`SPDX-License-Identifier: Apache-2.0` at file level),
standard-library-only candidate for the **first protected boundary slice** of a
future Host diagnosis endpoint. It imports nothing from `core/` or `agent/`,
copies no inherited GPL/third-party source, and adds no dependency or `go.mod`
change. **Not wired:** no server, router, startup path, `/api/v1` route, schema,
persistence, or existing auth API change. Every refusal is the controlled
`{code,message,data}` envelope with a fixed, non-diagnostic message; responses
set no cookies/auth headers and the package logs no headers or secrets.

## What the middleware does

`Guard` protects one server-configured **fixed target resource**. Per request:

1. Refuse a canceled context (`503`) before any work.
2. Resolve the request through the injected, trusted `Authenticator` to an
   immutable `Principal`. Anonymous (`ErrUnauthenticated`) -> `401`; any other
   error, including `ErrBackend`, -> `503` (message never echoes the error).
3. Enforce the principal: explicit provider `Authenticated`, non-empty bounded
   `Subject` (no surrounding whitespace/control chars), `Admin`, and **exact**
   `Resource` equal to the target. No wildcard, no current-node fallback.
   Any failure -> `403`.
4. On every **non-safe** method require the injected trusted `CSRFValidator`
   (POST is unsafe, including a "read-only" diagnosis POST). Ordinary
   invalid/missing CSRF -> `403`; CSRF/origin `ErrBackend` (wrapped or not)
   -> `503`. Only exact `GET`/`HEAD`/`OPTIONS` are safe; unknown, lowercase
   and empty methods fail closed.
5. Optional `OriginValidator` runs only after CSRF passes and only for this
   endpoint's non-safe requests. It must not be used as, or weaken, the
   terminal websocket Origin gates; **no websocket/upgrade handling here**.
6. Re-check cancellation immediately before downstream, so a CSRF/origin
   callback that canceled the context cannot reach it.
7. Copy the authorized principal into a private typed context key;
   `PrincipalFromContext` returns deep copies. Downstream cannot mint a
   principal and caller-supplied context identity never overrides the verifier.

## Configuration and trust

`New` fails when the target is missing, padded, oversized or wildcarded, or when
`Authenticator`/`CSRF` is nil — including a **typed-nil** pointer or nil function
adapter (non-nil as an interface, panics when invoked). A typed-nil optional
`Origin` is normalized to absent, so it is never invoked. A Guard cannot exist
without working session+CSRF enforcement and does not panic per request because of a typed-nil required dependency. There is
no built-in login or default identity; `X-Panel-Local-Token`, `API_AUTH`,
`owner`/`role`/`subject` headers and `user_approved` cookies grant no authority
and are ignored for identity.

## Auth equivalence — BLOCKED before routing

The authenticator is an **injected authoritative session provider**, not a
delivered auth replacement. Before any route uses this Guard, RSA, captcha,
MFA, passkey, API-key, entrance, password-expiry and session-persistence
equivalence must be independently proven against Core. Until then, wiring is
**BLOCKED**.

## Tests

`go test -race ./internal/requestguard/` uses synthetic fakes to prove boundary
orchestration and negative ordering only; it never proves real login. Covered:
construction failure (incl. typed nils), anonymous, authenticator error, redaction,
principal checks, tampered identity headers, context override, missing/invalid
CSRF, `ErrBackend`->503, method classification, cancellation (incl. by CSRF/origin
callbacks), origin ordering, single downstream call and principal immutability.
Threat model: single-host actor/resource scope; tenant isolation is **not** proven;
secrets are excluded from responses and logs.

## Rollback / removal trigger

Delete this directory and revert its commit; no runtime state is touched. Replace it once real-session equivalence tests and independent review pass.
