# GPUPanel independent HTTP API v1 (ADR)

Status: **Accepted for implementation; no runtime route migration is claimed by this ADR.**
Date: 2026-10-20
Scope: GPUPanel backend, Web, Wails desktop, CLI and external integrations.

## Decision

GPUPanel is a separately maintained product. Compatibility with upstream 1Panel HTTP endpoints, payloads, error codes, and SDKs is explicitly **not** a goal. Reuse internal implementation where valuable; do not expose upstream contracts as the stable GPUPanel interface.

Canonical public prefix remains `/api/v1`. GPUPanel independently owns its API contract and may intentionally diverge from upstream 1Panel **where a specific endpoint is poorly designed**. Upstream-compatible paths with clear semantics (for example `POST /api/v1/apps/install`) remain unchanged. Do not rename routes merely to signal independence. Existing callers and real-VM tests remain authoritative during selective migrations.

## HTTP conventions

- Prefer consistent resource naming for **new or demonstrably problematic** endpoints. Existing clear endpoints (such as `/apps/install`) are grandfathered; do not require a wholesale REST rename.
- `GET` reads, `POST` creates/starts commands, `PATCH` applies partial changes, `DELETE` requests deletion. Mutating operations with durable effects return a stable task reference when asynchronous.
- API error response: `{"error":{"code":"RESOURCE_CONFLICT","message":"...","requestId":"..."}}`. Never place secrets, shell output, token values, container identifiers or raw upstream errors in client-facing messages.
- Async operations: response contains `taskId` and resource identifier if known; `GET /tasks/{taskId}` exposes pending/running/success/failed/unknown. A timeout or lost acknowledgement **must not** be interpreted as failure or trigger blind retry.
- Mutations with retry risk must define an idempotency key and ownership semantics before migration. Keep existing TaskDB, resource identity and evidence checks as authority; do not substitute HTTP success for runtime convergence.
- Authentication and authorization apply at router and service boundaries; desktop localhost is not an implicit authentication bypass. SSE/WebSocket routes must enforce the same principal and scope as HTTP.
- OpenAPI is the contract source for generated TypeScript/Go clients; check generated code drift in CI. Deprecation is governed by GPUPanel's own version policy, not upstream releases.

## Migration gates

1. Inventory all registered backend routes and every Web/Wails/CLI consumer; record method, auth middleware, request/response schemas and side effects.
2. Publish a reviewed OpenAPI v1 spec and golden contract tests for errors, auth, async tasks, retries and pagination.
3. Classify each endpoint as KEEP, REFACTOR or DEFER based on concrete defects: generic operation dispatch, inconsistent HTTP methods, ambiguous side effects, weak error semantics, or unsafe retries.
4. Preserve clear existing endpoints and the `/api/v1` prefix; implement narrowly scoped replacements for REFACTOR endpoints, delegating to existing services and authorization.
5. Migrate only affected Web/Wails/CLI callers and run real Ubuntu install, AppInstall, Compose, uninstall and rollback tests. Verify TaskDB, Docker and evidence consistency.
6. Remove each superseded endpoint only after all callers and recovery flows have moved, with a separately reviewed breaking-change PR. Do not promise upstream compatibility.

## Explicit non-goals

- No database rewrite as a side effect of changing URL paths.
- No weakening of AppInstall `CONSISTENT` evidence, fail-closed outcomes, or release NO-GO gates.
- No mandatory Kubernetes, remote Core, or Docker dependency for desktop-only baseline functionality.
- No automatic migration of external clients without documented breaking changes.

## Acceptance criteria

- Requests to the documented v1 API satisfy OpenAPI and negative contract tests.
- Only clients of explicitly refactored endpoints must move; retained endpoints continue working unchanged.
- Superseded route shutdown is gated on a complete caller inventory, real VM lifecycle evidence and independently reviewed rollback path.
- The repository README, upgrade notes and licensing continue to acknowledge inherited GPL-3.0 obligations where applicable.
