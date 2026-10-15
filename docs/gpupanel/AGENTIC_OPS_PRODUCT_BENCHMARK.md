# Agentic Ops product benchmark and portal IA (proposal)

> Research date: 2026-10-15. **Design only / NOT IMPLEMENTED**. This document does not claim a deployed Agentic Ops product. GPUPanel's Ubuntu Host G3–G6 release gates remain authoritative; see [ROADMAP.md](./ROADMAP.md).

## 1. Who this is for

| Persona | Job to be done | Required user-visible outcome |
| --- | --- | --- |
| Individual Ubuntu developer | Diagnose an unhealthy local container without corrupting projects | Evidence-linked, read-only investigation; recoverable Host flow |
| On-call SRE | Investigate a real alert across Kubernetes, Prometheus and Loki | Evidence, timestamped hypotheses, affected resources and escalation |
| Service owner | Review a proposed production change | Exact before/after plan, risk, blast radius, approval/deny |
| Platform administrator | Govern integrations and credentials | Inventory, least privilege, health, audit and revocation |
| Auditor | Prove who performed a change | Immutable proof reference, independent verification, actor and outcome |

A chat window and an agent card list alone do **not** satisfy any write-operation outcome.

## 2. External benchmarks (product-shape evidence, not transplant licenses)

| Product | Strongest workflow/interaction | Reuse decision | Limits to verify |
| --- | --- | --- | --- |
| [kagent](https://kagent.dev/docs/kagent/1.x/) | K8s agent/session, MCP tool discovery and human approval | **Adopt/Integrate** for optional K8s diagnostics after Host gates | Deployment, auth boundaries, namespace scoping and version pinning |
| [Agno AgentOS](https://docs.agno.com/agent-os/control-plane) | Agents / Teams / Workflows / traces as a control-plane experience | **Study** resource and execution UX; experiment with adapter only | Hosted control-plane vs OSS runtime/source redistribution |
| [Kubiya](https://docs.kubiya.ai/) | Ops automation UX, task queue, skills and policy | **Benchmark** operator workflows, do not vendor proprietary code | Ownership, authentication, task durability and self-host rights |
| [HolmesGPT](https://github.com/HolmesGPT/holmesgpt) | Evidence-led SRE investigation with read-only tools | **Adopt/Integrate** as diagnostic worker candidate | Sandbox, read-only enforcement and correlation quality |
| [Keep](https://github.com/keephq/keep) | Alert/incident intake and correlation | **Evaluate** for an event-source adapter later | Incident identity, dedupe and evidence freshness |
| [MaxKB](https://github.com/1Panel-dev/MaxKB) | Enterprise RAG and agent builder | **Integrate** optional knowledge app; no second RAG engine | License, tenant/ACL propagation and upgrade path |
| Existing [1Panel AI Agent & MCP](https://github.com/1Panel-dev/1Panel) | Agent/model/MCP/Skills/permissions in the GPUPanel fork | **Adopt existing code**; don't add parallel CRUD | Distinguish upstream chat agents from operational authority |

Evidence references are upstream project documentation; this is not an independently operated deployment comparison. Recheck APIs and licenses against a pinned upstream revision before integration.

## 3. Screenshot-inspired navigation translated into GPUPanel

The screenshot's top-level IA: Dashboard / AI Chat / Agents / Assets / Tasks / Observability / Configuration. Keep the following feature-gated. No empty navigation items, fake counters or demo tasks on the production Host path.

| Navigation and concrete page | Core interaction | Source of truth | Existing vs planned |
| --- | --- | --- | --- |
| **Overview**: My Host, recent investigations | Filter by project, time, observed health; open source record | GPUPanel Core + Host Agent | Existing Host data; investigation widgets **future** |
| **AI Assistant**: context-aware diagnosis | Choose scope; attach resource + alert; run **read-only**; inspect cited evidence | External kagent/HolmesGPT runtime, not the browser | **Future** adapter; no unrestricted shell from LLM |
| **Agents**: catalog, detail, tool access | Search, filter readiness and role, view runtime/skills/permissions/version | Existing /ai/agents & /ai/mcp; optional external runtime registry | Existing upstream Agent CRUD ≠ operational execution |
| **Assets**: Host, containers, cluster, service | Scope to project and resource; open host/cluster observed status | Host Agent; separate gpu-compute-platform for cluster workloads | Host existing; cluster integration **future** |
| **Tasks**: investigation / proposed change / operation | Timeline; exact plan diff; approve/deny; retry rules; evidence; recovery | Execution authority is **agent-control-plane**, not LLM | **Future**; don't persist shadow authoritative state in GPUPanel |
| **Observability**: alerts, investigations, tool trace | From incident to telemetry/execution/verification; separate data freshness | Prometheus/Loki/OTel + ACP evidence | External connectors **future** |
| **Configuration**: integrations, project access, policies | Connector test, credential ref, scopes, enabled/disabled, audit | Core identity and explicit policy provider | Existing partial settings; Ops policy **future** |

### Reuse already present in frontend

- `frontend/src/routers/modules/ai.ts`: AI Agents / AI Models / MCP Servers / GPU navigation with permission metadata.
- `frontend/src/api/modules/ai.ts`: Agent CRUD/search, MCP CRUD/test/status, model accounts, Skills, channel and security config.
- Existing routes are neither a stable general-purpose AgentOps API nor proof of an authorized infrastructure change. **Do not** relabel them as such.

### Agent card content contract

| Display | Meaning / failure-safe behavior |
| --- | --- |
| Name, role, version, owner | Agent definition metadata, not execution identity |
| Configured / enabled | Desired configuration, not current availability |
| Health: healthy / degraded / unknown | Derived from recent independent probe, with observed timestamp |
| Tool inventory | Grouped read-only / mutating / external; permissions and auth mode |
| MCP / RAG / Skill counts | Derived from versioned capability references; counts are secondary |
| Latest investigation | Linked to actual task; show **no data** when not present |
| Execute/diagnose | Disabled without scoped identity, healthy adapter and backend capability |

Do not collapse "enabled", "ready" and "healthy" into the screenshot's single green label.

## 4. Page behavior and empty states

1. **Overview**: preserve existing Host cards; show future Ops integration as "Not connected" rather than fabricated availability.
2. **Agents**: existing Agents route stays canonical; optional "Operations" tab appears only after backend feature discovery, with model/tool read access and versioned agent definitions.
3. **Investigate**: choose exactly one resource scope; pin telemetry query timeframe and data source; display source links and a confidence/uncertainty statement, never silent automatic remediation.
4. **Proposal**: display target identity, live resourceVersion/generation, before/after diff, denied operations and requested scope. Show no active "Approve" action unless ACP accepts the exact plan.
5. **Task details**: separate investigation (reasoning) from authorized execution (side effect). Keep UNKNOWN as unresolved and auditable.
6. **Evidence**: show independent observation and verification result, never infer proof from a 2xx HTTP acknowledgement.

## 5. Product ladder & experiment decision

| Gate | Capability | Acceptance (must have evidence) | When |
| --- | --- | --- | --- |
| A0 | IA, benchmark, contract, explicit no-op boundaries | Design review, references and no production route changes | Now |
| A1 | Host read-only investigation | Real authenticated disposable Ubuntu VM, scoped metrics/logs, safe tool failures | After Host G3–G4 |
| A2 | Kubernetes incident read-only investigation | Disposable kind with bounded kagent/HolmesGPT tool permissions; correlated logs/metrics | After Host G3–G6 |
| A3 | Human-approved exact transition via ACP | IndependentExecutionProof/v1; stale version/UNKNOWN/takeover negative tests | After identity/RBAC and ACP adapter E2E |
| A4 | Fleet / project-level AgentOps | Multi-project isolation, audit, OIDC, RBAC, retention, rollback rehearsals | Later |

### Decisions

- **Adopt** existing 1Panel routes/models/MCP tools and Host agent wherever applicable.
- **Integrate** only the minimal read-only diagnostic workers and external evidence links first.
- **Contribute** upstream if generic diagnosis/tool-discovery gaps are confirmed in a POC.
- **Build** only the GPUPanel cross-system view/adapters absent from external products; never a second execution authority or orchestration framework.

## 6. Explicit non-goals

- No new kagent/Agno/Kubiya frontend fork, no second Agent CRUD service.
- No production write access via LLM/MCP/Chat UI.
- No AgentOps feature advertised as shipped until actual backend, RBAC and E2E evidence exist.
- No Kubernetes or GPU dependency imposed on standalone Ubuntu Host.
- No GPL/commercial-license mixing without attribution and distribution review.
