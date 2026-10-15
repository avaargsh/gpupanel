# GPUPanel: a practical first start (Ubuntu 24.04)

> Development preview, **not a production one-click installer**. Do not use the official 1Panel installer to install GPUPanel.

## See what is supported

This independent GPL-3.0 fork currently reuses Linux Host, Docker, terminal, files, and existing accelerator monitoring from upstream. GPUPanel adds its own branding, Host-first dashboard shortcuts, Ubuntu doctor and verified offline bundle tools. Enterprise multi-host, Kubernetes/Kueue, ML workspaces and MetaX acceleration are roadmap-only until independently tested.

## Read-only system check

```bash
git clone https://github.com/avaargsh/gpupanel.git
cd gpupanel
python3 scripts/gpupanel-bootstrap.py doctor --human
python3 scripts/gpupanel-bootstrap.py plan --human
python3 scripts/gpupanel-bootstrap.py self-test --human
```

FOUND is **executable presence only**, not a version or driver health check. The lock contains no approved downloadable software initially. No packages or executables are installed by these commands. Self-test is an isolated offline bundle roundtrip with synthetic bytes.

## Frontend preview

```bash
cd frontend
npm ci
npm run build:pro
npm run type-check
```

This validates the frontend, not Core/Agent service startup. Use a non-production Ubuntu machine for initial experiments. Do not blindly execute curl-piped shell scripts. For offline distribution, require immutable version, SHA-256, licensing and provenance before adding artifacts to `profiles/ubuntu24-dev.lock.json`.

## Troubleshooting and feedback

Unsupported OS means outside current test scope. Missing tools are not automatically installed. A missing accelerator does not invalidate Host functionality. Feature visibility may depend on user permissions. File sanitized GitHub issues (remove credentials, IPs, serials and customer data).

Roadmap: Ubuntu Host → enterprise Host → optional Kubernetes Provider → AI workloads. See [product boundaries](PRODUCT.md) and [roadmap](ROADMAP.md).
