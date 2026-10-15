# ADR-0004: Application catalog and multi-runtime delivery ownership

- Status: **Proposed** (2026-10-15)
- Related: [Hybrid platform](ADR-0002-HYBRID-PLATFORM.md), [Ownership](ADR-0003-RESOURCE-IDENTITY-OWNERSHIP.md)

## Decision: catalog intent is distinct from package and installed runtime

- **ApplicationDefinition**: what users choose (JupyterLab, MaxKB, MLflow, Dify, low-code platform); license and integration claims require evidence.
- **ApplicationPackageRevision**: immutable, reviewed delivery recipe, compatible platform/environment constraints, exact image digests, provenance, health/backup/upgrade hooks. Version labels are not immutable identities.
- **ApplicationInstallation**: one project-scoped deployed instance with a selected target (Host or Cluster) and exactly one deployment owner.
- **WorkspaceTemplate/Workspace**: user-specific development environment and persistent project data. A global App Store installation is not a per-user Workspace.
- **ProjectTemplate**: starter Git/Notebook content with fixed origin and revision, distinct from app installation and machine runtime.

## Delivery modes

| Mode | Owner | Desired state source | Admission / lifecycle | P0 readiness |
| --- | --- | --- | --- | --- |
| Host Docker/Compose | current 1Panel Host app manager | existing 1Panel install/config persistence | reuse current install/upgrade/remove/observe; respect data backup | inherited code only; G5 NOT RUN |
| Kubernetes Helm app | one Fleet/Argo CD or designated Helm owner | that owner's Git/release store | namespace/service account/ingress/storage controls | future |
| Kubernetes GPU compute | gpu-compute-platform | its PostgreSQL | Kueue-only Workload path, finalizer and evidence | future integration |
| External managed service | external product | remote provider | integrate with explicit read/write API rights | future |

Do not automatically transform Compose into Helm, or convert an installed Docker app into K8s by changing a provider flag. Migration requires separate backups, secrets ownership, storage move, service address cutover, rollback and operator approval.

## Publish/installation lifecycle

**Package:** DRAFT -> VALIDATING -> VERIFIED (for a specified platform profile) -> PUBLISHED -> DEPRECATED -> RETIRED. VERIFIED is evidence for a concrete package digest, architecture, driver/runtime, product version and smoke test, not a permanent global certification.

**Install operation:** PREPARED -> (approval if required) -> APPLYING -> VERIFYING -> READY | FAILED | UNKNOWN. A failed installer is not a successful deployment. For removal, distinguish **remove runtime** from **destroy data**; latter requires separate scope and confirmation.

### Template compatibility matrix

Admin declares and validates image architecture, CPU/RAM limits, required ports/volumes, GPU vendor/runtime/device mapping when relevant, healthcheck, failure signatures, artifact digests and backup semantics. Unsupported combinations must not appear as available to users.

The P0 examples are CPU Jupyter and one mature RAG app. MetaX, NVIDIA fine-tuning, GPUStack, SGLang and vLLM profiles remain gated until the corresponding real hardware/runtime tests exist. This does not cancel future GPU development; it prevents claiming vendor support based only on package metadata.

## Isolation and network

- Workspace/Notebook and low-code app container code is untrusted. Do not mount docker.sock, host root, Control Plane secrets or run privileged by default.
- Use authenticated, scoped Workspace/App access; a reverse proxy route is not SSO by itself.
- Prefer a separate trusted access gateway for WebSocket/IDE session proxying. Do not assume every app supports a sub-path or iframe.
- Database and vector index state remain **app-owned**; GPUPanel tracks install metadata, backup references, status and observability.
- Existing services continue if GPUPanel Core is unavailable; reconcile when it returns.

## License and supply-chain gate

Track each candidate's source license, source/build origin, transitive image license, redistribution rights, version, digest and source attribution before inclusion in a distributable catalog.

BanbanAI/BanbanAI currently advertises Electron client source and a license file with extra branding/SaaS/PaaS restrictions; GPUPanel must not fork/relabel or advertise embedded enterprise server support absent a rights review and real server-side API/deploy acceptance. Prefer independent installation or an authorized link.

An internal/community Catalog and a packaged third-party app are legally and operationally different. Never publish vendor MetaX binary images or SDK to a public registry without explicit redistribution rights.

## Acceptance

1. On disposable Ubuntu, after P0 G3/G4, install and remove one real Compose application via existing 1Panel APIs; verify service health and persisted data by independent readback.
2. Fail image pull, port collision, bad environment variable and Core restart; verify truthful state, no orphaned secret in logs, no destructive retry.
3. Restore the app and data from a tested backup before claiming managed recovery.
4. For future Kubernetes release, verify the single Owner can adopt/rollback and detects drift; do not let GPUPanel directly mutate its managed Pod.
