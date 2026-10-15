<p align="center"><img src="frontend/src/assets/images/gpupanel-logo.svg" width="260" alt="GPUPanel logo" /></p>

# GPUPanel

**Host first. AI ready.** An independent GPL-3.0 fork of [1Panel](https://github.com/1Panel-dev/1Panel) for Linux host operations today and GPU/AI platform integrations later.

> Status: **Brand foundation / non-production preview**. This repository retains the upstream Core + Agent + Vue 3 structure. GPU scheduling, training workspaces, multi-node control and production Agent Ops are **roadmap items**, not delivered features.

## What exists now

- **Host**: reuse upstream host, disk, files, network, security and terminal management.
- **Containers**: reuse upstream Docker, Compose, images and application lifecycle.
- **Portal**: GPUPanel brand entry points, with Host management as the first product focus (live standalone deployment is not yet accepted).
- **Integrations (planned)**: optional Kubernetes provider; GPU Compute Platform for compute queues and workloads; Agent Control Plane for authorized operations.

## Architecture and boundaries

| Layer | Responsibility | Source |
| --- | --- | --- |
| Portal | Navigation, design system, workspace and project entry points | `frontend/` |
| Control API | Identity, policy, cross-resource inventory, operations | `core/` |
| Linux Host | System, disk, network, Docker, terminal, backup, recovery | `agent/` |
| Kubernetes Provider (future) | Workloads, GPU pools, scheduling observation; Kueue remains the admission path | Separate adapter, **not** a replacement for Linux Host |
| AI Applications (future) | Workspaces, model serving, MLflow links, RAG integrations | External products/adapters, not duplicated engines |
| Audit (future) | Authorization, CAS, independent observation, operation evidence | Adapter to agent-control-plane |

See [architecture](docs/gpupanel/ARCHITECTURE.md), [product organization](docs/gpupanel/PRODUCT.md) and [roadmap](docs/gpupanel/ROADMAP.md).

## Quick start (Ubuntu 24.04)

A new contributor can check their environment **without root access or downloads**:

```bash
python3 scripts/gpupanel-bootstrap.py doctor --human
python3 scripts/gpupanel-bootstrap.py plan --human
python3 scripts/gpupanel-bootstrap.py self-test --human
```

This does not install GPUPanel. An offline Python starter can create user-local project files; a separately verified Core/Agent source bundle can be staged for inspection, **not** installed as a service. See [preview staging](docs/gpupanel/PREVIEW_STAGING.md) and [中文上手指南](docs/gpupanel/GETTING_STARTED.zh-CN.md) or [English quick start](docs/gpupanel/GETTING_STARTED.md) for the currently supported entry points and limits.

## Development

The current upstream baseline is **1Panel dev-v2 @ d9dc5d7aa981c3b04ad284e93420aca9888f7e5a** (2026-10-15). The upstream runtime identifiers, Go module paths, settings keys, on-disk paths and API routes remain unchanged until a migration plan and compatibility tests exist.

```bash
git remote add upstream https://github.com/1Panel-dev/1Panel.git
npm --prefix frontend ci
npm --prefix frontend run build:pro
npm --prefix frontend run type-check
node scripts/verify-brand.mjs
```

The Go modules currently request Go **1.26.6**. Do not claim a full build succeeded without that toolchain and resolved dependencies. Development builds need the supported 1Panel system services; installing the frontend alone does not provision a host agent.

**Do not use 1Panel's official one-click install script as a GPUPanel installer.** A dedicated GPUPanel build, upgrade, and rollback path must be verified before distribution.

## What “install” means today

| Operation | Verified boundary |
| --- | --- |
| Ubuntu diagnostics | Read-only, no software changes |
| Python stdlib starter | Local CLI creates, verifies and removes **project files**, not Python itself |
| Source build | Compiles a checksummed **non-installable** preview archive |
| Preview staging | Explicit approval copies inspected files under `~/GPUPanel/previews/` without starting services |
| GPUPanel system installation | **BLOCKED:** Core/Agent still depend on inherited 1Panel paths and lack independently accepted systemd/first-admin/rollback |
| Standalone browser/API Host + Docker | **NOT ACCEPTED** on a disposable Ubuntu VM |

Archive SHA-256 is an internal consistency check, not publisher signature verification. Never overwrite an existing 1Panel installation to test this fork. Refer to [installation constraints](docs/gpupanel/RUNTIME_ISOLATION.md).

## Attribution and licensing

GPUPanel is an independent derivative, **not an official 1Panel release or endorsed by the original project**. The original 1Panel copyright notices and `LICENSE` (GPL-3.0) are retained. This fork's new brand assets are identified separately; the upstream 1Panel name must remain in attribution, license notices, and compatibility context rather than being indiscriminately erased. See [NOTICE.md](NOTICE.md).

## Scope of first round

Brand assets, portal fallbacks, architecture boundaries and verification script. No existing user data, production cluster, Git history, binary names, on-disk data directories or upstream-specific integration endpoints are migrated by this change.
