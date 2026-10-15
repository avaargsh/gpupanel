# GPUPanel: a practical first start (Ubuntu 24.04)

> Development preview, **not a production one-click installer**. Do not use the official 1Panel installer to install GPUPanel.

## See what is supported

This independent GPL-3.0 fork currently reuses Linux Host, Docker, terminal, files, and existing accelerator monitoring from upstream. GPUPanel adds its own branding, Host-first dashboard shortcuts, Ubuntu doctor and verified offline bundle tools. Enterprise multi-host, Kubernetes/Kueue, ML workspaces and MetaX acceleration are roadmap-only until independently tested.

## Read-only system check

```bash
git clone --branch dev-v2 https://github.com/avaargsh/gpupanel.git
cd gpupanel
python3 scripts/gpupanel-bootstrap.py doctor
python3 scripts/gpupanel-bootstrap.py plan
python3 scripts/gpupanel-bootstrap.py self-test
```

FOUND is **executable presence only**, not a version or driver health check. The lock contains no approved downloadable software initially. No packages or executables are installed by these commands. Self-test is an isolated offline bundle roundtrip with synthetic bytes.

## Create a Python environment with uv

Use an existing trusted `uv` and a regular Ubuntu user to create a **new offline environment**. No driver, Python or PyTorch packages are downloaded:

```bash
python3 scripts/gpupanel-env.py plan
python3 scripts/gpupanel-env.py create --approve
python3 scripts/gpupanel-env.py status
```

Readable output is the default. Add `--json` after a command for scripts, e.g. `python3 scripts/gpupanel-env.py status --json`. Existing directories are never overwritten. See [uv workstation](UV_WORKSTATION.md).

### Start a runnable offline uv Python project

```bash
python3 scripts/gpupanel-uv-project.py plan
python3 scripts/gpupanel-uv-project.py create --approve
python3 scripts/gpupanel-uv-project.py status
cd ~/GPUPanel/projects/uv-python-starter
uv run --locked --offline python main.py
```

This uses uv's native `init` and `lock` with no third-party dependencies or downloads. Modified projects are never overwritten; PyTorch/Jupyter dependency profiles are not yet included.

## Two separate installation-like workflows

**A. The available Python standard-library starter creates only project files, not Python:**

```bash
python3 scripts/gpupanel-catalog.py plan gpupanel.dev.python-stdlib
python3 scripts/gpupanel-catalog-workspace.py plan
# Review the target and explicitly approve:
python3 scripts/gpupanel-catalog-workspace.py install --approve
python3 scripts/gpupanel-catalog-workspace.py status
python3 scripts/gpupanel-catalog-workspace.py list
python3 ~/GPUPanel/projects/python-stdlib-starter/main.py
```

**Optional cleanup: run separately; never paste with the creation commands.**

```bash
python3 scripts/gpupanel-catalog-workspace.py uninstall --approve
```

**B. A source-build preview can only be staged for inspection, not installed as a system service:**

```bash
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
python3 scripts/gpupanel-preview-stage.py plan dist/gpupanel-preview.tar.gz
# After reviewing destination and checksum:
python3 scripts/gpupanel-preview-stage.py stage dist/gpupanel-preview.tar.gz --approve
python3 scripts/gpupanel-preview-stage.py status dev
```

**Optional cleanup: run separately; never paste with the creation commands.**

```bash
python3 scripts/gpupanel-preview-stage.py remove dev --approve
```

The staged binaries are **non-executable**, and no Core/Agent process, systemd service, initial administrator or listener is configured. Embedded SHA-256 proves internal integrity **not** publisher authenticity. See [preview staging](PREVIEW_STAGING.md). The strict namespace audit `python3 scripts/gpupanel-runtime-namespace.py --strict` intentionally blocks system installation until migration is accepted.

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
