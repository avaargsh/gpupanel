# Architecture (first-pass, non-breaking)

```text
Browser / GPUPanel UI (Vue 3)
       |
       v
Core API (Go, upstream routes preserved)
       |
       +------ Linux Agent (Go) --> host OS / Docker / storage / terminal
       |
       +------ Provider SPI [future] --> Kubernetes cluster
       |                               |-- Kueue (single queue admission)
       |                               |-- GPU Workloads / KServe / model endpoints
       |
       +------ Agent Control Plane adapter [future]
               Authorization --> CAS --> Execute --> Independent observation --> Audit
```

## Existing code boundaries

- `frontend/`: Vue routes, components, API clients, styles. Branding only in first pass.
- `core/`: API control-plane and persistence; preserve `1Panel-dev/1Panel/core` Go import path for now.
- `agent/`: host-level functionality and Docker; preserve `1Panel-dev/1Panel/agent` Go import path for now.
- `scripts/`: developer and packaging utilities. New GPUPanel brand verifier lives here.
- `docs/gpupanel/`: independent product/architecture roadmap alongside original upstream documentation.

## Planned integration rather than reimplementation

- GPU inventory: discover via vendor adapter; no NVIDIA-only assumptions.
- K8s provider: explicit cluster credentials, namespace boundaries, no default install of K3s.
- AI workspace: templates + persistent project storage; compose upstream tools.
- Training / model lifecycle: integrate MLflow and relevant Kubeflow components instead of building trackers from scratch.
- Agent Operations: call agent-control-plane as an external verified operation authority, not pretend a successful desired-state write is execution proof.

## Migration gate

Do not rename binaries, default storage directories, CLI names, Go module paths, updater URLs, database names or Kubernetes objects in a brand-only change. Each requires compatibility tests, backup/rollback plan and artifact/release ownership transfer.

Do not upstream-sync using a force push over GPUPanel changes. Keep fork default branch stable; prepare reviewable feature branches.
