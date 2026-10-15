# GPUPanel Engineering Contract (for humans and coding agents)

This contract applies to this fork. Read it before implementation, review, migrations or releases. Product priorities are in `docs/gpupanel/ROADMAP.md`; the fork-first decision is in `docs/gpupanel/ADR-0001-FORK-FIRST.md`. Repository evidence overrides assumptions about upstream 1Panel.

## 0. Product, domains and dependency direction

- **Current customer outcome**: a usable single-Ubuntu GPU/developer workstation with conventional Host, Files, Terminal, Docker/Compose, App Store/Catalog, GPU observation and model-related UI. Optional bottom-right AI entry must not block ordinary operations or pretend an unimplemented chat service exists.
- **Domain ownership**: `frontend/` owns presentation/state and API view adapters; `core/` owns authenticated entry, user/project resource scope, orchestration and operation receipts; `agent/` owns Linux host execution, Docker and independently observable local effects. `catalog/` holds reviewed software definitions, not executable authority; `scripts/` holds developer/release utilities.
- **Flow**: Browser -> authenticated Core API -> scoped application operation -> Agent/host provider -> actual outcome observation -> Core response/audit -> view. Separate request DTO, domain command, storage record and view DTO. Never have Vue submit a privileged shell command directly to Agent/Docker.
- **Optional later boundaries**: Kubernetes scheduling stays in the separate gpu-compute-platform (Kueue as admission authority); controlled external remediation can integrate agent-control-plane. Neither may be silently introduced as a dependency of a single-host workflow.
- In design, specify goal, actors, bounded context, owners, trust boundaries, allowed dependency direction, state machine, data flow and failure/recovery. Design completely; implement only the vertical slice supported by a real user case. Do not create abstraction before a second materially different usage exists.

## 1. Implementation constraints

1. Favor cohesive modules and short stable interfaces; one responsibility per file. **New source files <= 500 physical lines**. Refactor before a file approaches the limit; do not copy a pre-existing oversized 1Panel file to a new location or claim old files satisfy the limit.
2. Existing oversized upstream files are tracked legacy debt: in any touched area avoid making them larger without justification, and split along real domain responsibilities where feasible. Do not attempt an unreviewed global rewrite just to pass a numeric lint rule.
3. Validate external input at every trust boundary; transform DTO -> domain -> persistence -> view explicitly. Do not share mutable structs/objects across layers as a convenience.
4. Default to authentication, project/user resource ownership, least privilege, and scoped authorization. The current single-host phase does **not** prove tenant isolation: every new endpoint/operation must state who may invoke it, on which resource, and what test enforces denial. Hide secrets from logs, exceptions, API responses, browser state and evidence bundles.
5. Mutations need an explicit owner, idempotency/replay decision, concurrency guard, operation identity, bounded timeout, cancellation/rollback behavior and independently observed outcome. No infinite retries, silent fallback, swallowed errors or global unbounded queues. HTTP 2xx/Desired state alone is not proof of completed execution.
6. Frontend work needs loading, empty, unavailable, error, retry, in-progress and completed states, async request cancellation/stale response fences, clear navigation and keyboard accessibility. Backend authorization remains authoritative; hidden links/menu entries are not access control.
7. Before adding a dependency, inspect actual `frontend/package.json` and installed versions/types, or Go module manifests and upstream docs. Prefer existing maintained libraries. Do not unify look-alike components until their second genuine use case requires a shared abstraction; document deliberate duplication when its lifecycle differs.
8. Record non-obvious design decisions and temporary constraints with reason, effects, risk and *removal trigger*. Put architectural choices in ADRs and leave linked issues for deferred work, not context-free TODOs.
9. Each change must have reproducible tests, observable failures, a rollback/recovery story, and honest evidence (exact commit, test command, outcome and NOT RUN blockers). Maintain external APIs, persisted schemas and stored user data by their explicit contracts.
10. **Delete obsolete internal implementation instead of introducing compatibility shims, deprecated aliases or dual writes.** This does not authorize breaking external `/api/*` contracts, changing schema without migration or deleting live user data. Assess those contracts separately.

## 2. Fork-first reuse, not global overwrite of live hosts

- Edit/replace inherited 1Panel **source files in this fork** as needed; preserving every internal upstream implementation is not a goal. Reuse upstream Host/Docker/App Store now, simplify/remove unused modules later after usage and dependency audits. Keep required GPL-3.0 notices and `NOTICE.md`.
- **Do not equate source replacement with approval to overwrite a running 1Panel installation.** Installation on a disposable machine may target inherited paths after operator approval and proven backup/recovery; detection of an existing live installation requires an explicit backup, data ownership/migration decision, and a tested rollback before any overwrite or deletion.
- No independent parallel GPUPanel runtime namespace is required **solely to permit early fork development**. However identity/authorization, state safety and real installation evidence are still mandatory before release. Refer to ADR-0001; obsolete isolation experiments are not a deployment recipe.
- Avoid speculative adapters, cross-platform distribution and extra GPU vendors until the Host -> Docker -> App Store -> recovery workflow works.

## 3. Actual repository gates (do not invent Bun commands)

Verified manifests: `frontend/package-lock.json` + `frontend/package.json` (npm), and separate `core/go.mod` / `agent/go.mod` (Go 1.26.6 declared in both). There is **no established root Bun workspace or Bun precheck/db migration task** at this revision. Never report `bun run precheck`, `bun run build:web`, `bun run db:generate`, `bun run db:migrate` or `bun run run-data-migrations` as completed unless the actual project has gained those scripts and they were executed.

For every change:
- Check existing tests and affected API contract; run the smallest focused suite, then any relevant CI workflow.
- Python tooling change: `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v` (or more specific focused pattern).
- Frontend change: `cd frontend && npm ci && npm run type-check && npm run build:pro`. Run visual/keyboard/API-negative checks for UI behavior.
- Core change: `cd core && go test ./<affected-package>`, followed by broader `go test ./...` as feasible; Agent change: same in `agent/`. Record dependency/environment failures rather than pretending a passing build.
- Release packaging change: `python3 scripts/gpupanel-release.py build --version dev` then `python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz`; this remains **a non-installable preview** until VM gates pass.
- Schema change: identify the **actual Go/GORM migration owner and storage type**, apply forward migration in a disposable database, test old/new data and rollback/recovery. If data must move/backfill, separately run and record bounded idempotent migration evidence. Do not imply a Bun migration utility exists.
- Installation or host mutation: on an explicitly disposable Ubuntu 24.04 VM, prove preflight, backup, install, first login, permission denial, Docker/App lifecycle and interrupted-upgrade restore. Never use a production server as a smoke fixture.

## 4. Review / PR completion contract

A PR must include:
- user workflow and product value; architecture/domain impact and whether new abstractions are justified;
- path-by-path change summary, base/head SHA, interface and DB contract impact, upstream attribution;
- threat model (actor, resource, tenant/project scope, secrets and untrusted input), concurrency/idempotency and failure states;
- test commands with actual outputs, skipped/blocked cases, UI accessibility checks, observed runtime outcome and rollback evidence;
- known limitations, linked issue/ADR for intentional debt, and exact criterion for later deletion.

**Do not mark G3-G6, real AI chat, production multi-tenancy or installation as delivered on the strength of docs-only, mocks-only or source-build evidence.**
