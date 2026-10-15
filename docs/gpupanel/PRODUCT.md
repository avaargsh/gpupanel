# GPUPanel product organization

**Target sequence:** Ubuntu developer workstation / single Linux host → enterprise Linux host fleet → optional Kubernetes and GPU provider → AI developer portal.

## User roles

| Role | Default workspace | Main outcome |
| --- | --- | --- |
| Individual developer | My Host | Rebuild development tooling, run containers, inspect terminal and logs |
| Host operator / SRE | Hosts & Operations | Authorized infrastructure changes, backup and recovery |
| AI developer (future) | Project | Persistent workspace, GPU profile, jobs, model and artifact access |
| Platform administrator (future) | Organization | Pools, quotas, policies, installation and audit |

## Suggested portal IA (feature gated)

```
GPUPanel
├── Overview
├── Host
│   ├── Hardware / CPU / Memory / Disk / GPU inventory (GPU extension pending)
│   ├── Files / Terminal / Network / Security
│   └── Diagnostics / Backup / Recovery
├── Containers
│   ├── Docker / Compose / Images
│   └── GPUPanel Catalog (Web discovery; experimental project starter via CLI only) / Installed Apps / Compose
├── AI Workspace [future]
│   ├── Templates / Workspaces / Storage
│   ├── Jobs / Experiments / Models
│   └── Serving
├── Clusters [future, optional Kubernetes provider]
│   ├── Cluster / ComputePool / Queue
│   └── Workloads / Events
└── Platform [future]
    ├── Identity / Projects / RBAC
    ├── Resource Policies / Audit
    └── Integrations
```

Features annotated [future] must remain hidden until backend adapters, RBAC and E2E tests pass. The menu is a product roadmap, not an implemented feature inventory.

## Invariants

1. Preserve upstream `frontend/`, `core/`, `agent/` and working API routes during upstream sync.
2. Linux host operations remain the core product even if Kubernetes is not installed.
3. No hidden bypass around Kueue for Kubernetes workload admission.
4. High-risk changes need explicit authorization, preconditions, idempotency and observable outcomes.
5. Install / upgrade / rollback must work offline or behind restricted networking before public release.
6. Track third-party GPL attribution and distinguish brand changes from runtime compatibility migrations.
