# GPUPanel: product-first execution roadmap

Decision date: 2026-10-15. **Freeze new GPU vendor integrations**, including MetaX and any other new driver, until the Ubuntu Host product loop is independently accepted. Existing upstream GPU monitoring can remain available; it is not the focus of this milestone.

## Product definition and strict boundaries

- **Host (GPUPanel's core)**: Ubuntu/Linux host health, files, disk, SSH/terminal, network, security, Docker/Compose, App Store, backup, upgrade and recovery.
- **Personal development environment**: trusted, reproducible software templates, profile/lock, China-network-friendly package mirrors, offline cache, backup and host re-provisioning.
- **Enterprise Host (later)**: enrollment, fleet inventory, role restrictions, authorized maintenance and audit.
- **Kubernetes / AI workloads (optional integration later)**: use external gpu-compute-platform with Kueue as the unique admission path.
- **Agent operations (later)**: reuse agent-control-plane for authorization, CAS, independent execution observation and audit. Do not build a second control plane.
- **GPU adapters**: no new vendor CLI parsers, driver management or scheduling work in this stage.

## P0 acceptance ladder — single Ubuntu 24.04 host

| Gate | User outcome | Evidence required | Current status |
| --- | --- | --- | --- |
| G0 Brand & frontend baseline | GPUPanel name, branding and compilable web | real Vue build/type-check CI | PASS (source) |
| G1 Read-only environment review | check local tools, collision risk and trusted cache | fixture tests + Ubuntu CI, no side-effects | PASS (diagnostics only) |
| G2 Source build + artifact | Vite assets embedded in Go Core, agent built, verified tarball | full Ubuntu Node/Go build, archive checksum and attribution | IN PROGRESS; not installable |
| G3 Safe installer/upgrade/rollback | fresh Ubuntu install, explicit data namespace, no legacy collisions | disposable VM, systemd/service setup and rollback | BLOCKED |
| G4 Login and Host | authenticate then observe host, file, disk, terminal | browser + API, negative auth & RBAC tests | NOT RUN |
| G5 Docker + app | container create/start/log/stop/delete and application install/uninstall | live Docker engine and authenticated API | NOT RUN |
| G6 Failure and recovery | stop services, malformed package, interrupted update and restore | evidence, repeatability and independent verification | NOT RUN |

Only **G3–G6 passing** authorizes a release candidate advertised as installable. A successful source build is not a release.

## P1 — repeatable developer workstation after P0

- Choose Python/Node/Docker/AI Coding software profiles; include exact version, provenance, license and SHA-256.
- Build a local/mirror cache for restricted network access, with clear offline status and no silent insecure fallbacks.
- Save and restore profile, project mounts and settings; avoid copying secrets into portable bundles.
- UX: select template → preview changes → authorize → install → verify → recover or roll back.
- Reuse OS package managers and native installers; do not reinvent a package manager.

## P2 — enterprise Host and optional providers

Build only after non-Kubernetes Host workflow works reliably; multi-host identity, audit, secrets and permissions before adding workloads. Kubernetes remains optional and should reuse the user's external compute/control-plane projects.

## Quality rules

1. Never globally rename 1Panel binary paths, Go import modules, config keys and data directories without a proven migration.
2. No fake "success" when an API is accepted but a service is not running; record desired/observed states separately.
3. No hard-coded vendor-specific hardware assumptions.
4. No upstream paid/proprietary code or assets inherited by implication of GPL fork.
5. Distinguish source-preview artifacts from installable signed artifacts in UI, documentation and release metadata.
6. Adopt → Integrate → Contribute → Build; avoid expanding scope without a measurable user workflow.
