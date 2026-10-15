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
