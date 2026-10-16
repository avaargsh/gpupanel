# GPUPanel: product-first execution roadmap

Decision date: 2026-10-15. Delivery decision: **fork-first direct reuse of inherited 1Panel source**, with staged cleanup of obsolete internals. Details: [ADR-0001](ADR-0001-FORK-FIRST.md) and [engineering contract](../../AGENTS.md). Modifying 1Panel files *in this repository* is allowed now; overwriting a live installed 1Panel instance without backup, approval and recovery proof is not. G3 still requires evidence for real installation, but a fully separate runtime namespace is no longer a prerequisite for building Host features.

**Freeze new GPU vendor integrations**, including MetaX and any other new driver, until the Ubuntu Host product loop is independently accepted. Existing upstream GPU monitoring can remain available; it is not the focus of this milestone.

## Product definition and strict boundaries

- **Host (GPUPanel's core)**: Ubuntu/Linux host health, files, disk, SSH/terminal, network, security, Docker/Compose, App Store, backup, upgrade and recovery.
- **Personal development environment**: trusted, reproducible software templates, profile/lock, China-network-friendly package mirrors, offline cache, backup and host re-provisioning.
- **Enterprise Host (later)**: enrollment, fleet inventory, role restrictions, authorized maintenance and audit.
- **Kubernetes / AI workloads (optional integration later)**: use external gpu-compute-platform with Kueue as the unique admission path.
- **Agent operations (later)**: reuse agent-control-plane for authorization, CAS, independent execution observation and audit. Do not build a second control plane.
- **GPU adapters**: no new vendor CLI parsers, driver management or scheduling work in this stage.

## vNext personal workstation baseline

The 2026-10-16 UI/product baseline is [vNext Workbench](VNEXT_WORKBENCH.md). Deliver a unified React shell and truthful capability states first, then the persistent Project → Workspace → Session developer loop. Existing Linux management remains reachable; GPU/AI/enterprise claims require their own live gates. See [domain language](../../GLOSSARY.md).

## P0 — 以单一最新状态页作为裁决

唯一当前状态： [docs/STATUS.md](../STATUS.md)。既有 Ubuntu 24.04 VM、Ubuntu 26.04 实验宿主及 CI 证据绑定不同版本，不得累加。

| Gate | 发布裁决 |
| --- | --- |
| G0–G2 源码、前端、预览 | 旧固定版本 CI/源码证据已通过；发布候选重跑 |
| G3 新装、升级、回滚 | PARTIAL / NO-GO |
| G4 鉴权 Host/终端/文件 | PARTIAL / NO-GO |
| G5 Docker + AppInstall/UNKNOWN 全链路 | PARTIAL / NO-GO |
| G6 故障注入、数据保存与恢复 | PARTIAL / NO-GO |

## P1 — repeatable developer workstation after P0

- Choose Python/Node/Docker/AI Coding software profiles; include exact version, provenance, license and SHA-256.
- Build a local/mirror cache for restricted network access, with clear offline status and no silent insecure fallbacks.
- Save and restore profile, project mounts and settings; avoid copying secrets into portable bundles.
- UX: select template → preview changes → authorize → install → verify → recover or roll back.
- Reuse OS package managers and native installers; do not reinvent a package manager.

## P2 — enterprise Host and optional providers

Build only after non-Kubernetes Host workflow works reliably; multi-host identity, audit, secrets and permissions before adding workloads. Kubernetes remains optional and should reuse the user's external compute/control-plane projects.

## Quality rules

1. Direct modification/removal of inherited internal 1Panel source is allowed. Any change to installed runtime paths, externally visible APIs or stored data still requires versioned migration, negative tests and rollback evidence.
2. No fake "success" when an API is accepted but a service is not running; record desired/observed states separately.
3. No hard-coded vendor-specific hardware assumptions.
4. No upstream paid/proprietary code or assets inherited by implication of GPL fork.
5. Distinguish source-preview artifacts from installable signed artifacts in UI, documentation and release metadata.
6. Adopt → Integrate → Contribute → Build; avoid expanding scope without a measurable user workflow.
