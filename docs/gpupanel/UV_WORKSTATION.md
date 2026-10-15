# GPUPanel uv developer environment (single Ubuntu user)

**Status: implemented as user-local CLI only.** No GPUPanel web installer, model training stack, GPU driver installation, Jupyter or Torch dependency install is claimed. The Core/Agent G3–G6 gates are still open.

## One useful workflow

Install **uv from a trusted source first**, then enter the GPUPanel checkout as a regular Ubuntu user (never root). An installed Python interpreter is also required.

```bash
python3 scripts/gpupanel-env.py plan
python3 scripts/gpupanel-env.py create --approve
python3 scripts/gpupanel-env.py status
```

Default target: `~/GPUPanel/environments/python-local`. To use a different directory **inside your own home**:

```bash
python3 scripts/gpupanel-env.py plan --target ~/GPUPanel/environments/research
python3 scripts/gpupanel-env.py create --approve --target ~/GPUPanel/environments/research
python3 scripts/gpupanel-env.py status --target ~/GPUPanel/environments/research
```

This creates a genuine virtual environment using the already installed **uv**, not Python's `venv`/`ensurepip` module. The target is entirely new; if it already exists, the tool refuses rather than repairing, clearing or overwriting it. It never deletes an environment or edits another project. A failed uv subprocess leaves no published target directory. User-created ancestor directories can remain after a failed attempt.

It uses `uv venv --no-project --no-config --offline --no-python-downloads --no-managed-python --relocatable --python <current-interpreter>` on a private staging path, verifies the new Python process, then atomically renames into the chosen location with no-replace behavior. This is intentionally **not an automatic Python installer**, so Python and uv must already be present. The installed environment contains **no PyTorch, CUDA Toolkit, or Jupyter** unless the user adds them later using a separately reviewed dependency lock and uv workflow.

## See installed packages without changing the environment

After creating a verified uv environment, list the packages really installed in it:

```bash
python3 scripts/gpupanel-env.py packages
python3 scripts/gpupanel-env.py packages --json
```

This calls `uv pip list --python <environment>/bin/python --format json --offline --no-config` using the existing uv executable, with a timeout and bounded output. The command is read-only: it neither resolves dependencies nor downloads wheels. Unverified environments refuse inventory; external subprocess errors and private stderr are not surfaced. The package list **does not mean a compatible or reproducible dependency lock exists**. Installing, pinning and caching reviewed PyTorch/Jupyter dependencies remain a separate approval-gated slice.

## A runnable offline uv Python project

After creating or inspecting your standalone uv environment, you can now create a **real, independently runnable project** from uv's own generator:

```bash
python3 scripts/gpupanel-uv-project.py plan
python3 scripts/gpupanel-uv-project.py create --approve
python3 scripts/gpupanel-uv-project.py status

cd ~/GPUPanel/projects/uv-python-starter
uv run --locked --offline python main.py
```

The script uses `uv init --app` and `uv lock --offline` with the already installed Python, then checks the exact generated `pyproject.toml`, `uv.lock`, `main.py` and `README.md` before publishing atomically into a **new** directory. This is a project, not a second Python package manager. The starter contains **no third-party dependencies** yet; after the user edits or installs packages, `status` reports `MODIFIED` (not corruption), and GPUPanel never overwrites or uninstalls those files.

Defaults to `~/GPUPanel/projects/uv-python-starter`. To select another destination use `--target` after the command. `--json` selects machine output; otherwise users see the next action immediately.

The source contract does not include a trusted locked **PyTorch/Jupyter** dependency profile, pre-populated wheel cache or local mirror. `uv run --offline` may fail for projects that subsequently add dependencies unless they are already available from a trusted local cache. That absence must not be concealed as success. A future template step should add curated version-specific locks and verified offline artifacts without creating another installer.

## Check locked dependencies before offline setup

GPUPanel adds **two distinct operations** for a Python uv project that contains `pyproject.toml` and `uv.lock`. These do not install anything into the original project:

```bash
# Read only: parse/validate the lock and review package sources.
python3 scripts/gpupanel-uv-lock-check.py check

# Explicit opt-in: try a REAL offline uv sync in a disposable directory.
python3 scripts/gpupanel-uv-lock-check.py probe-offline --approve

# Alternate project under your own home; structured output for automation.
python3 scripts/gpupanel-uv-lock-check.py check --project ~/GPUPanel/projects/my-project --json
```

The **check** reports `REVIEWED_LOCK` if the TOML structure, source boundaries and wheel hashes meet the initial policy. Crucially, this status says **nothing about whether an offline wheel cache exists**, nor does it verify the `uv.lock` is fresh with respect to `pyproject.toml`. It is not an install approval.

The **probe-offline** action copies only those two regular metadata files to an isolated temporary directory, then runs `uv sync --locked --offline --no-build --no-install-project --no-default-groups` through installed uv, with config/Python downloads disabled and a timeout. A success `OFFLINE_SYNC_VERIFIED` demonstrates that the currently selected Python/platform can use the *current uv cache* to synchronize these dependencies. It does **not** import third-party packages, validate PyTorch GPU kernels, certify the lock's provenance or make any claim about future cache retention. A failed result (`OFFLINE_SYNC_FAILED`, `TIMEOUT`, etc.) remains a failure; private uv stderr is not returned. The original project's `.venv`, sources, lockfile and any user files are never modified.

For this early slice, local/git/direct-URL sources, arbitrary build systems and uv-specific project overrides are refused with `UNREVIEWED_SOURCE`. Registry entries must have HTTPS URLs and SHA-256-pinned wheel candidates. Source-only packages are blocked to avoid executing unreviewed builds. A vetted PyTorch/Jupyter lock and regional/offline mirror provisioning are **not** delivered by these checks; do not confuse a syntactically acceptable lock with a secure, approved software supply chain. Approved installation into a user-selected project will be a later, separate workflow.

## CLI output for people and tools

All primary diagnostics are now readable without a special flag. For scripts, choose `--json` explicitly:

```bash
python3 scripts/gpupanel-bootstrap.py doctor
python3 scripts/gpupanel-python-doctor.py
python3 scripts/gpupanel-first-run-overview.py
python3 scripts/gpupanel-install-preflight.py
python3 scripts/gpupanel-runtime-namespace.py
python3 scripts/gpupanel-env.py plan

python3 scripts/gpupanel-env.py status --json
python3 scripts/gpupanel-bootstrap.py doctor --json
python3 scripts/gpupanel-python-doctor.py --json
python3 scripts/gpupanel-first-run-overview.py --json
```

The retired `--human` option is no longer accepted in the five affected first-run/diagnostics CLI entrypoints. JSON structure is the same as before, unless a separate versioned interface change is documented. Report exit codes continue to signal diagnostics or refused actions according to each tool's established contract: a zero result is **not** permission to deploy Core/Agent or run containers.

## Security and recovery

- The source path is a local Python executable; no managed-Python download or package index access occurs.
- The uv process gets a restricted environment rather than arbitrary `UV_*` variables from a caller. Temporary staging and the target stay within the authorized user's home.
- The approval flag `--approve` is explicit; planning never creates the target or launches uv.
- Unknown/unsupported target or already existing files always fail closed.
- `status` uses a bounded Python subprocess, and is not evidence of complete model/GPU compatibility. A user who changes an environment after creation owns its contents; it will not be removed by GPUPanel.
- Fresh disposable Ubuntu 24.04 VM acceptance remains required before calling the full GPUPanel product installable.
