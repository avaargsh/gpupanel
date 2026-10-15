# Contributing to GPUPanel

GPUPanel is an **independent GPL-3.0 fork** of [1Panel](https://github.com/1Panel-dev/1Panel). We prioritize Linux Host usability, safe development environments and integrations instead of duplicating mature AI runtimes. See [中文入门](docs/gpupanel/GETTING_STARTED.zh-CN.md) or [English quick start](docs/gpupanel/GETTING_STARTED.md).

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
- Do not globally replace `1panel` in Go import paths, runtime data paths, installer binaries or API routes without a migration and rollback plan.
- Do not copy upstream paid/proprietary features or bundled branding without permission.
- No unreviewed `curl | bash` installation recipes; externally downloaded binaries must have immutable version, source/provenance, license and SHA-256 verification.
- New GPU integrations must be read-only until hardware fixtures and live tests exist; Kueue stays the single admission path for Kubernetes workloads.

## Issue reports

Use the repository's bug form, redact passwords, access tokens, node addresses, hostnames, serial numbers, tenant identifiers and private process arguments. If a screenshot contains user data, remove it before uploading. A minimal local reproduction is usually more helpful than a full production log.
