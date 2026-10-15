# M0 Hybrid Foundation: implementation slices and acceptance ledger

- Date: 2026-10-15
- Status: **PLAN ONLY**; no backend/API/schema/runtime change in this branch.
- Target repo: GPUPanel dev-v2; base G3-G6 are not yet accepted.
- Read first: [ROADMAP](ROADMAP.md), [GOLDEN_PATH](GOLDEN_PATH.md), [LOCAL_APP_STORE](LOCAL_APP_STORE.md), [AGENTS](../../AGENTS.md).

## 0. Source-of-truth inventory at review

| Existing project | Actual direction from its README | Integration rule |
| --- | --- | --- |
| GPUPanel | 1Panel fork; Host/Docker/App Store source and CLI/preview scaffolding; G3-G6 open | product shell and single-host operations; no false installer claim |
| gpu-compute-platform | Go/PostgreSQL desired-state control plane, cluster agent and Kueue admission | future Kubernetes Compute API Provider; do not create second Workload store |
| agentaliyun | registration/heartbeat, task/list, running/finish, result streaming and reconciliation | future bounded HostOps adapter, not a blanket Root shell |
| agent-control-plane | Plan authorization, CAS, side-effect ownership, independent evidence | use as constrained proof boundary, not generic IAM/runtime |
| agentic-aiops | Golden Incident investigation, approval, Temporal and verification | optional incident reference flow; no mandatory Host P0 service |
| cloud-agent-runtime | durable Agent session/run/sandbox reference | external experimental runtime, not default GPUPanel dependency |
| temp-runner | pinned multi-repo disposable E2E and evidence | integration harness, not product code |
| GRPO-Rag | early RAG storage/task baseline; real inference/production app not yet accepted | domain product, not production RAG service claim |
| lerobot-data-platform / scgpt | domain dataset/evaluation/research tools | apps/templates, independent domain DB and evidence |
| BanbanAI | low-code public Electron client repository and separately restricted license | external candidate pending rights + server/API/deploy validation |

All status statements above concern **readme-level evidence** checked for planning, not fresh end-to-end certification.

## 1. Execution sequence and cut lines

### Slice 0 — protect Host release boundary (**highest priority**)

Owner: GPUPanel core/agent/release maintainers.

- On fresh disposable Ubuntu 24.04: implement/prove reviewed installer, first-admin, explicit inherited-path collision handling, upgrade/rollback and data preservation. Follow G3.
- Run authenticated Host, File, Terminal positive/denial E2E (G4); preserve exact logs.
- Run local App Store/Compose install, task-ID reconciliation, stop/restart/uninstall and actual observed state (G5). Existing [local app workflow](LOCAL_APP_STORE.md) includes UI single-flight and durable task UUID claim, **not** complete live E2E.
- Inject failure/recovery: image unavailable, port bound, Core/Agent restart and interruption (G6).
- Do not ship this proposal as a production installer or broaden GPU vendor scope to bypass these gates.

Exit: G3-G6 evidence references, true/false outcomes, exact HEAD and rollback proof. A passed Docker-only smoke is not G5.

### Slice 1 — Enterprise Host Fleet thin slice (after G3-G6)

Owner: new scoped GPUPanel Core module; reuse the chosen existing Host/Assist executor.

- Target: **two independent Linux Docker hosts, no K3s**.
- Implement Node record/enrollment, machine credential lifecycle, capability inventory + freshness, scoped project read and limited authenticated operation.
- Bind each Node to one designated HostOps owner. Never expose host Docker TCP/root shell to arbitrary catalog apps or AI.
- One remote operation: read service/container health, followed by an approved harmless, reversible operation on a disposable service. Test offline/reconnect, duplicate operation ID, lost ACK, revoke and cross-project denial.
- Separate management plane outage from application availability.

Exit: verified true Node/Provider readback and auth-negative tests, not just two dashboard cards.

### Slice 2 — Managed App installation (after Slice 1)

Owner: existing App Store Agent for Host package lifecycle; GPUPanel tracks project/target/installation references.

- Pick **one** distribution-friendly app with public verified container instructions: CPU Jupyter or MaxKB; do not adopt BanbanAI code/branding without license review.
- Freeze approved source image digest, ports, volumes, integration claims, app DB/backup method, health checks and rollback.
- Create from a reviewed PackageRevision, install on Node B, expose via authenticated route or explicitly documented app-native login.
- Prove restart, data restore, app upgrade plan, Core outage survival and deletion-with-data-retention.
- Never claim authentication federation from a mere reverse-proxy URL.

Exit: admin can install, use, diagnose, back up and restore a real app on another enrolled host.

### Slice 3 — Kubernetes provider import (separate, optional)

Owner: gpu-compute-platform or preexisting cluster platform, not GPUPanel Pod CRUD.

- Register a preexisting disposable K3s/Kubernetes cluster read-only; prove Cluster/Node identity mapping.
- Use the gpu-compute-platform API to create Project/ComputePool/Workload, **Kueue as sole admission path**, then observe, release and clean up.
- Exercise denied Project/Cluster scope; test provider offline, eventual observation and deletion finalizer.
- Add Fleet/Argo CD only for a concrete App installation use case, and select one GitOps owner per installation.

Exit: zero direct cross-owner Kubernetes writes by GPUPanel; independent observed cleanup.

### Slice 4 — Agentic Ops and advanced products (separate)

- AI assistant initially suggests/read-only investigates based on Node, Installation, logs and evidence; no live Root access.
- Add exact operation approval and independently verified bounded remediation, not autonomous direct shell.
- Workspace / RAG / low-code are managed Application or domain Product modules; reuse existing stacks. No duplication of their internal DB or model serving system.

## 2. Golden paths to record

| Path | Starting state | Action | Independent observation | Negative/failure cases |
| --- | --- | --- | --- | --- |
| GP-0 Host | fresh disposable Ubuntu 24.04 | safe install; sign-in; Host/Files/Terminal; Compose app | systemd, HTTP, Docker and data restore | existing 1Panel; denied API; interrupted upgrade |
| GP-1 Fleet | 2 Docker servers not in K3s | enroll B and inspect capability; scoped service operation | Node cert, target host actual service status | revoked cert; wrong project; offline; duplicate ID |
| GP-2 App | target Node B enrolled | install MaxKB or CPU Jupyter from pinned verified package | real login/health and test data recover after restore | pull failure; port occupied; Core restart; unapproved deletion |
| GP-3 GPU Compute | separate disposable K8s cluster | Project -> ComputePool -> Workload -> Kueue -> Job | gpu-compute-platform observed generation, finalizer and provider resources | rejected quota; lost ACK; admission denied; cleanup mismatch |
| GP-4 Ops | existing observed service error | read-only diagnosis -> exact action proposal -> approve | independently measured repaired state + audit proof | prompt injection; forged approval; changed parameters |

GP-0 is a **prerequisite** for GP-1/GP-2 product release, even if future adapter designs can be reviewed in parallel. GP-3 and GP-4 do not become implicit G3 release requirements.

## 3. Engineering and code-change map (after this docs PR)

1. GPUPanel Host/release: use existing INSTALL_PREFLIGHT/GOLDEN_PATH scripts and maintain exact upstream-safe install collision rules. Deliver G3-G6 in small focused PRs.
2. Core API: first add Node Registry read-only DTO, scoped permissions and tests; avoid a new generic Resource CRUD abstraction until both Host and Cluster providers prove concrete need.
3. Host/Assist: explicitly agree on a single remote service operation and ownership/protocol compatibility. No silently shared root credentials.
4. App Catalog: keep current upstream local App Store install flow; add reviewed package compatibility metadata and project/target mapping only when the second real application requires it.
5. Kubernetes: integrate existing gpu-compute-platform API and Kueue, not a separate workload scheduler. Do not claim GPU vendor support without hardware proof.
6. UX: one Product Portal with Workspaces/Apps for users and Hosts/Policies/Installations for operators; disabled/unavailable features stay hidden until real backend and RBAC E2E.

## 4. Evidence checklist for every future implementation PR

- Base/head SHAs, owner/worktree, affected API and persisted schema.
- Readable user workflow with actual source of truth and observed status.
- Authentication/authorization positive and **negative** cases and exact resource scope.
- Idempotency keys, resource revision/CAS rule, retry, timeout, cancel and UNKNOWN handling.
- Secret treatment, side-effects, recovery, backup and rollback.
- Source unit/static checks **and** live E2E where applicable; if not run, mark NOT RUN.
- G3/G4/G5/G6 and GP-0..GP-4 must remain separate labels; no implied acceptance.

## 5. Acceptance of this planning change

This docs branch is ready for review if the four ADRs agree on one owner per resource, preserve inherited P0 semantics and distinguish roadmap from delivery. It does not change source imports, Go paths, Docker, app-store state, databases, auth, permissions, CI, systemd or existing hosts.

Next engineering action after review: finish GP-0 on disposable Ubuntu, then implement GP-1 as the smallest two-node observable Host operation.
