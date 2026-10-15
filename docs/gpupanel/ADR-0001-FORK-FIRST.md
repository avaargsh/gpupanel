# ADR-0001: Fork-first reuse and staged replacement of 1Panel implementation

- Status: **Accepted for product engineering direction** (2026-10-15)
- Scope: GPUPanel codebase and Ubuntu development workstation milestone
- Context: `docs/gpupanel/ROADMAP.md` and `AGENTS.md`

## Context

GPUPanel is a GPL-3.0 fork of 1Panel. The target user needs a usable Ubuntu Host/Docker/App Store/GPU workstation now. Upstream Core/Agent/Vue already contain substantial tested functionality. Earlier plans treated a fully separate runtime path, binary/CLI rename and independent service installer as prerequisites to *any* fork feature development; this delayed the most valuable workflows while source builds and isolated catalogs were labeled preview-only.

The owner has now explicitly chosen to **directly modify or replace upstream 1Panel source within the fork**, defer extensive deletion/restructuring, and prioritize functional use. This decision does not constitute permission to destroy a user's installed 1Panel data.

## Decision

1. Keep the existing Core + Agent + Vue and ordinary Host, Docker/Compose, Files, Terminal, App Store and GPU views as the short-term product substrate.
2. Modify existing 1Panel implementation directly where it improves the user flow. For internal code, remove obsolete branches rather than creating aliases, dual writes, parallel adapters or a second control plane. Follow bounded-context and interface rules in `AGENTS.md`.
3. Do **not** gate every product feature on a fully independent GPUPanel runtime namespace. The previous experimental `feat/g3-core-config-isolation-20261015` branch is not a prerequisite and is not an accepted installer. Do not accidentally merge it as though isolation had been decided.
4. On a **fresh disposable development VM**, inherited service/CLI/path naming is acceptable for prototyping and acceptance experiments. For a VM or host with existing 1Panel state, inventory, backup, explicit operator authorization, integrity checks and tested rollback are prerequisites to any conflicting installation. Never silently overwrite existing data.
5. Retain stable external `/api/*` and database contracts until reviewed migration, negative auth tests and rollback proof. Preserve upstream GPL-3.0 licensing and attribution. Fork independence in branding does not erase legal provenance.
6. Shift delivery emphasis toward one complete path: sign in -> Host health/files/terminal -> Docker container -> application Catalog install/uninstall -> observed status -> failure recovery; keep the floating AI shortcut optional and honest (no fake LLM response).
7. Delay removal of broad legacy 1Panel code until actual route usage, domain ownership, licenses, data and dependency graph have been audited. Do not delete a module merely because it is not present in the current navigation.

## Architecture / data flow

`Browser (Vue, view state) -> Core (authentication, scoped operation and receipt) -> Agent (host execution) -> OS/Docker (source of truth) -> observation/evidence -> Core -> Vue`.

- Protocol DTOs are not domain/persistence models. Boundary validation and conversion are explicit.
- Existing single-host deployment does not automatically enforce per-project multi-tenancy. New routes and mutation surfaces must prove scopes and denial even when the first user is an admin.
- Catalog definitions are untrusted data: no dynamic shell commands from YAML/JSON. A code-reviewed executor requires explicit consent, replay protection, operation ID and observed completion.
- GPU scheduling and Agent execution proof remain optional external integrations, not prerequisites for the Host workflow.

## Trade-offs and risks

- Reusing inherited `/usr/local/bin/1pctl`, `/etc/1panel`, `<base>/1panel` and service names accelerates development **but is incompatible with unreviewed coexistence on an already-installed machine**.
- Inherited application paths and settings may contain implicit cross-module dependencies; test affected read/write paths before deletes or renames.
- Vendor sync may conflict with fork changes; merge with code review, never force-reset the product branch.
- Existing release tooling produces a checksummed source preview, **not** a validated installer; this ADR does not change release status to installable.

## Acceptance / reversal

This decision succeeds only when a disposable Ubuntu 24.04 VM completes authenticated login, Host, Docker/App workflow, bounded recovery and release rollback with retained evidence. Production/personal-real-machine installation remains blocked until operator-safe install/upgrade handling is proved. At that point reevaluate whether explicit GPUPanel paths are worth migrating.

Reverse or revise this ADR if real co-installation becomes a target requirement, if upstream path collisions cause unsolved data corruption risk, or if migration evidence disproves safe reuse. Record such a change in a new ADR rather than a silent compatibility shim.
