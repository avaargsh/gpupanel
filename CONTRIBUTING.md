# Contributing to GPUPanel

GPUPanel is an **independent GPL-3.0 fork** of [1Panel](https://github.com/1Panel-dev/1Panel). We prioritize Linux Host usability, safe development environments and integrations instead of duplicating mature AI runtimes. See [中文入门](docs/gpupanel/GETTING_STARTED.zh-CN.md) or [English quick start](docs/gpupanel/GETTING_STARTED.md).

## Engineering architecture and evidence contract

Read [AGENTS.md](AGENTS.md) before any design or code change and [ADR-0001: fork-first reuse](docs/gpupanel/ADR-0001-FORK-FIRST.md) before changing inherited 1Panel paths or modules. The fork prioritizes **product domain boundaries, multi-user scope, safe execution, complete UI states and independently observed outcomes**, not speculative architecture.

- First document user workflow, domain ownership, trust boundaries, data flow, failure semantics and a minimal falsifiable acceptance slice.
- Directly modify or replace inherited **source code in the fork** when appropriate; delete obsolete internal branches rather than adding compatibility shims or dual writes. Preserve public API/database migration contracts and GPL notices.
- A source edit is **not** consent to overwrite a live 1Panel system. Tests that change inherited data/service paths require a disposable VM, explicit backup and recovery evidence; co-installation on an existing machine remains blocked without a migration.
- New implementation files should be at most 500 physical lines. Pre-existing oversized files are legacy debt; split along real responsibilities as affected behavior evolves.
- Record non-obvious trade-offs and deletion triggers in an ADR or linked issue. State every unverified/release-blocked fact honestly.

### Verified command mapping

Current repository: **npm** frontend (not a root Bun workspace), plus separate **Go** modules and Python developer checks. The example `bun run precheck`, `bun run build:web`, `bun run db:generate`, `bun run db:migrate` and `bun run run-data-migrations` commands from other stacks are **not provided here**; do not claim they ran.

| Change type | Minimum local gate |
| --- | --- |
| Python utilities / catalog | `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v` |
| Frontend | `cd frontend && npm ci && npm run type-check && npm run build:pro` |
| Core | `cd core && go test ./<affected-package>` then broader `go test ./...` when environment permits |
| Agent | `cd agent && go test ./<affected-package>` then broader `go test ./...` when environment permits |
| Schema / stored data | Locate actual Go/GORM migration ownership; test forward migration, deterministic backfill if any, rollback/recovery on disposable DB |
| Release / installation | Separate source build/verify from authenticated Ubuntu VM install/login/Host/Docker/App/recovery acceptance |

Report NOT RUN instead of substituting a passing unit test for a real browser/API/host integration gate.

## Scope and issue routing

- For GPUPanel branding, onboarding, Host UX, Ubuntu bootstrap, provider adapters or integration issues, [file an issue here](https://github.com/avaargsh/gpupanel/issues).
- For bugs reproducible in unmodified 1Panel, link to a relevant upstream issue where appropriate. Do not assume GPUPanel maintainers can fix upstream releases.
- For security vulnerabilities, follow [SECURITY.md](SECURITY.md) and **never publish exploit details, tokens or customer data**.
- Prioritize one outcome per PR; discuss large breaking changes or unverified vendor drivers before implementation.

## Before your first PR

On Ubuntu 24.04, without root privileges:

```bash
python3 scripts/gpupanel-bootstrap.py doctor --human
python3 scripts/gpupanel-bootstrap.py self-test --human
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v
```

Frontend development (requires Node/npm and dependencies):

```bash
cd frontend
npm ci
npm run build:pro
npm run type-check
```

Go changes: run focused tests against the module, and record the exact Go version and any hardware dependencies. Do not claim a production-ready feature from a compiled package alone.

## Acceptance evidence

Every PR should state: base branch and commit, changed paths, end-user outcome, automated test output, manual smoke status, security impact, rollback path, and remaining limitations. UI pages require permission-aware routing, keyboard/navigation smoke checks and responsive behavior. High-risk Host actions require authorization and observable outcome contracts.

Do not mask failing type checks with `any`, `@ts-ignore` or ignored CI. Where a baseline problem is unrelated, create a separate small repair PR.

## Compatibility and licensing

- Preserve GPL-3.0 notices and the upstream attribution in NOTICE.md; do not claim endorsement by 1Panel.
- Internal upstream code in this fork can be modified or deleted directly. Changes to public API/data contracts, actual installed service identifiers or user data still require explicit migration/rollback evidence. Do not globally rename running host paths via an unreviewed source-only patch.
- Do not copy upstream paid/proprietary features or bundled branding without permission.
- No unreviewed `curl | bash` installation recipes; externally downloaded binaries must have immutable version, source/provenance, license and SHA-256 verification.
- New GPU integrations must be read-only until hardware fixtures and live tests exist; Kueue stays the single admission path for Kubernetes workloads.

## Issue reports

Use the repository's bug form, redact passwords, access tokens, node addresses, hostnames, serial numbers, tenant identifiers and private process arguments. If a screenshot contains user data, remove it before uploading. A minimal local reproduction is usually more helpful than a full production log.
