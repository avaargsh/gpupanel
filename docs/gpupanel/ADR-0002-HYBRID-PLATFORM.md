# ADR-0002: Hybrid host-first platform boundary

- Status: **Proposed** (2026-10-15; not an implementation approval)
- Depends on: [ADR-0001](ADR-0001-FORK-FIRST.md), [ROADMAP](ROADMAP.md), [AGENTS](../../AGENTS.md)
- Applies to: GPUPanel product boundaries, future enterprise management and app integrations

## Context

GPUPanel is an independent GPL-3.0 fork of 1Panel. The current repository is a **non-production preview**. Its P0 acceptance gates G3 safe installation/rollback, G4 authenticated Host, G5 Docker/App and G6 failure recovery remain BLOCKED or NOT RUN as recorded in ROADMAP. The user wants to eventually manage independent Linux servers, optionally Kubernetes GPU clusters, and self-hosted Jupyter, RAG, low-code, model and Agent applications.

A multi-host estate is not automatically a Kubernetes cluster. Replacing upstream Host management with K3s would lose the single-host user value, introduce operational prerequisites and create two owners for some host operations.

## Decision (target architecture, gated)

1. **Host-first GPUPanel Portal/Core.** Reuse current frontend/core/agent Host, Docker/Compose, Files, Terminal, OpenResty, App Store and recovery workflow. Do not introduce mandatory K3s/Rancher/Temporal/Kafka dependencies in P0.
2. **Future Host Fleet.** Register independent servers, assign a stable Node identity, display observed capabilities and issue narrowly authorized Host operations through one designated Host Provider. Do not equate enrollment with joining a cluster.
3. **Optional Kubernetes Compute Provider.** Integrate existing gpu-compute-platform API for its ComputePool/Workload objects and Kueue admission; Kubernetes remains downstream execution. Do not reimplement the platform's PostgreSQL desired state, leases, finalizers, reconciliation or scheduler.
4. **Applications stay independent products.** Treat Jupyter, VS Code, MaxKB, Dify, BanbanAI, RAGFlow, MLflow and domain apps as managed installations or external integrations, not libraries whose internal tenancy and data are silently moved into GPUPanel.
5. **Agentic Ops is a governed experience.** HolmesGPT/model components investigate via scoped read tools. Sensitive state changes require policy, exact-operation approval, an execution owner and independent verification. Do not deploy agent-control-plane or cloud-agent-runtime as mandatory prerequisites to Host P0.
6. **Deployment independence.** The management plane may go offline while already running applications and customer data remain under their execution/runtime owners.

## Logical plane ownership

| Plane | Product owner | Data/authority |
| --- | --- | --- |
| Experience | GPUPanel frontend | navigation, page context, status and approval UI; no shell credentials |
| Product control | GPUPanel core | product identity, resource references, authorized operation entry, installation intent |
| Host execution | 1Panel agent / explicitly selected Assist HostOps provider | Linux OS, systemd, Docker, Compose, file and network mutations |
| Kubernetes compute | gpu-compute-platform + its cluster agent | ComputePool/Workload desired state, Kueue admission, observation/finalization |
| GitOps app release (future) | one configured Fleet or Argo CD owner per installation | Helm/Kubernetes app desired state |
| App internal domain | each deployed third-party app | app DB, users unless proven SSO, indices and domain workflows |
| Evidence | executor plus independent observer; Core indexes references | observed outcome, provenance, audit and incomplete/UNKNOWN states |

## Deployment modes (not automatically equivalent)

- **Standalone:** GPUPanel Host + Docker/Compose for one Ubuntu host.
- **Fleet:** central GPUPanel Core + independently managed enrolled hosts; node credentials, offline states and revocation required.
- **Cluster integration:** import an existing K3s/RKE2/Kubernetes cluster with least-privilege credentials, or provision it through an explicitly chosen external owner; never silently install K3s on an enrolled host.
- **Hybrid:** a machine can be both a Host and a Kubernetes Node. Host inventory may be joined for display, but Kubernetes Workloads can only be changed through their cluster owner.

## Risks and mitigations

- **Two control planes write the same resource:** require explicit ownership and prohibit cross-provider direct writes (ADR-0003/0004).
- **Implicit tenant authority from 1Panel single admin:** forbid presenting multitenancy as delivered before backend deny tests.
- **Central outage:** avoid tying running app processes to Portal heartbeats.
- **Licenses:** preserve upstream 1Panel GPL notices; third-party code/image redistribution must be reviewed. BanbanAI's public LICENSE has supplemental brand and SaaS/PaaS restrictions, so it is a catalog candidate, **not** a GPUPanel embedded/forked engine by default.
- **K3s storage/network surprises:** no conversion from Compose to Helm without explicit data migration and recovery evidence.

## Acceptance and removal triggers

The proposal does **not** unblock G3-G6. First prove the existing Ubuntu Host -> Docker -> App -> recovery Golden Path on a disposable VM. Then run a two-independent-host inventory and one app installation/recovery E2E with real authorization, revocation and readback. Only after that import a pre-existing Kubernetes cluster and confirm that GPU workloads are exclusively admitted through gpu-compute-platform/Kueue.

Revisit the Host Provider boundary if evidence shows the current 1Panel agent cannot enforce required remote scoping without unsafe privileges. Revisit adding Rancher/GitOps only when a real managed Kubernetes use case requires it.
