# ADR-0003: Resource identity, scope and single authoritative owner

- Status: **Proposed** (2026-10-15; future API and schema, not deployed)
- Related: [ADR-0002](ADR-0002-HYBRID-PLATFORM.md), [ADR-0001](ADR-0001-FORK-FIRST.md)

## Problem

A Portal displaying Host containers, K8s workloads, model servers and low-code/RAG apps must not become a second uncoordinated reconciler. Existing gpu-compute-platform already has authoritative PostgreSQL desired state and fenced provider reconciliation. Existing agent-control-plane explicitly distinguishes authorized plans, side-effect ownership and independent verification.

## Canonical product references (design contract; no storage migration authorized)

| Concept | Stable key | Scoped by | Authority |
| --- | --- | --- | --- |
| Organization | organization_id | operator deployment | external IdP/GPUPanel policy depending configuration |
| Project | project_id | organization_id | GPUPanel product control |
| Environment | environment_id | project_id | GPUPanel product control |
| Node | node_id | management installation | GPUPanel registry only for registration/capabilities |
| Cluster | cluster_id | management installation | GPUPanel registry as reference; actual K8s owner external |
| ApplicationDefinition | app_definition_id | catalog namespace | catalog maintainer / source license |
| ApplicationPackageRevision | package_revision_id | app_definition_id | immutable signed/reviewed package source |
| ApplicationInstallation | installation_id | project_id + target_id | one deployment provider |
| Workspace | workspace_id | project_id + principal/owner | one workspace manager/provider |
| Workload | upstream workload_id | compute_pool/project mapping | **gpu-compute-platform**, not GPUPanel |
| Operation | operation_id | actor + target scope | authorized operation owner |
| Evidence | evidence_id | operation_id/run_id | append-only evidence record plus observer |

Do not reuse a display name, hostname, IP, Docker container name, Kubernetes namespace or a vendor-provided mutable label as a global stable identifier. Cross-system IDs are **references**; do not silently rewrite them to GPUPanel IDs.

## Proposed resource envelope

The following is a *design example* to test semantics, not a published endpoint or adopted database schema:

~~~json
{
  "resource_id": "install-001",
  "kind": "ApplicationInstallation",
  "organization_id": "org-001",
  "project_id": "proj-001",
  "environment_id": "dev",
  "target": {"type": "Host", "id": "node-001"},
  "owner": {"provider": "host-compose", "external_id": "compose-project-001"},
  "package_revision_id": "maxkb-example-revision",
  "desired_generation": 3,
  "observed_generation": 2,
  "state": "RECONCILING",
  "last_observation_id": "obs-001"
}
~~~

- A resource stores the selected owner at creation/adoption. Owner changes must be explicit migration operations with drain/backup/rollback.
- Product metadata may reference externally authoritative desired state; it must not claim the ability to overwrite it.
- Read models may combine Host and Cluster metrics, but reads cannot silently assume ownership of their underlying workloads.
- Backend authorization evaluates principal, organization/project, target resource, operation, credentials and live policy. A frontend menu filter is not authorization.
- Projects in GPUPanel and gpu-compute-platform require an **explicit versioned mapping** if semantics differ; no implicit same-name equivalence.

## Exactly one write route per resource

| Resource | Read path | Authorized write path |
| --- | --- | --- |
| Host service/Compose installation | Host inventory/provider | 1Panel agent or selected Host owner |
| GPUStack model instance | GPUStack adapter | GPUStack API, if enabled/authorized |
| Kubernetes ComputePool/Workload | gpu-compute-platform API | gpu-compute-platform API only |
| GitOps managed app | GitOps observation | single Fleet **or** Argo CD owner |
| RAG/low-code business objects | app-specific API | app-specific authorization, never Host Root tool |
| Host firewall/OpenResty | designated Host provider | exact reviewed operation + observed verification |

## Concurrency and failure contract

- Each mutation requires an operation_id, target resource ID, expected resource revision/generation, exact bounded intent and idempotency rules.
- State transitions use explicit PREPARED/APPLYING/UNKNOWN/OBSERVING/VERIFIED/FAILED or provider-specific mapped statuses; an HTTP 2xx is not verification.
- On lost ACK, do **not** repeat an unsafe write blindly; reconcile with the resource owner using operation identity and fresh readback.
- Registry stale/offline is UNKNOWN, not empty/healthy/deleted.
- Deletion is a lifecycle with final resource-owner cleanup and separately governed persistent-data retention.

## Scope and next proof

This ADR freezes **language and ownership** for contract reviews only. No GORM migration, new API route, RBAC grant or integration is implied. First validate a single-host ApplicationInstallation against existing 1Panel install identity and status, including failed/retried create. Later validate a Kubernetes Workload reference without bypassing gpu-compute-platform.

Revisit if a concrete second provider shows a schema mismatch; document the migration rather than adding internal aliases or dual writes.
