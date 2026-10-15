# GPUPanel roadmap and acceptance gates

## Gate 0 — Brand foundation (this branch)
- [x] Independent GPUPanel SVG identity and first-party favicon
- [x] Sidebar and login-page brand fallbacks
- [x] Repository positioning, GPL attribution and product organization
- [x] Static brand verifier
- [ ] GitHub repo description/topics update (requires repository settings API)
- [ ] Real frontend build and screenshot acceptance (requires dependency availability)
- [ ] Audit bundled backend/login images and every inherited visible string

## Gate 1 — Single-host golden path (P0)
- [ ] Fresh Ubuntu install, agent/core startup and health probes
- [ ] Login, host health, disk, files, terminal and Docker lifecycle
- [ ] Application install, update, uninstall and persisted-state recovery
- [ ] Authorized high-risk actions + regression for RBAC, audit and error handling
- [ ] Offline-friendly installer / mirror / updater and rollback

## Gate 2 — GPU host (P1)
- [ ] Vendor-neutral GPU discovery, driver and runtime compatibility matrix
- [ ] GPU workload profile and deployment template
- [ ] Model inference with reproducible serving profile and metrics
- [ ] No unsupported claims for AMD / MetaX / NVIDIA capabilities

## Gate 3 — Optional enterprise platform (P2)
- [ ] Kubernetes provider and multi-host enrollment
- [ ] Project OIDC/RBAC, ComputePool and Kueue-managed workloads
- [ ] Persistent workspaces, model lifecycle and artifact lineage
- [ ] CAS-guarded operations with independently verified outcomes

Acceptance policy: no milestone becomes DONE based only on route existence, screenshots or YAML. Require runnable tests, evidence, rollback and security checks.
