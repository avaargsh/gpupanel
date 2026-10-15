# First-run Host overview — read-only

Run from the GPUPanel checkout on Ubuntu 24.04:

```bash
python3 scripts/gpupanel-first-run-overview.py
python3 scripts/gpupanel-first-run-overview.py
```

The first command provides operator guidance; the second emits a deterministic JSON overview of OS/disk/legacy 1Panel collisions, inherited runtime namespace blockers, and the reviewed user-local Python scaffold. **Nothing is installed or downloaded**; systemd is never invoked. Docker is not contacted unless `--probe-docker` is supplied.

A zero process exit code means only that the **inspection** succeeded. Read `conclusion`, `systemRuntime.installable`, `readyForProduction` and `host.blockers`; the system installer remains blocked until Core/Agent paths, credentials and services are independently migrated and tested. This overview does not prove Docker daemon health or GPUPanel API/RBAC acceptance.


## Current Python / PyTorch developer environment (no installation)

The default first-run report now also reads **only the current Python interpreter** and PyTorch package *distribution metadata*. It does not import PyTorch, open CUDA, pull packages or install anything:

```bash
python3 scripts/gpupanel-python-doctor.py
python3 scripts/gpupanel-first-run-overview.py
```

To opt into an actual import of the installed PyTorch wheel and `torch.cuda.is_available()` with a 12-second subprocess timeout:

```bash
python3 scripts/gpupanel-python-doctor.py --probe-torch
python3 scripts/gpupanel-first-run-overview.py --probe-torch
```

**Important:** PyTorch is third-party code and this explicit probe may initialize a GPU driver/context or create user cache files. Run it only in your intended, trusted virtual environment. The subprocess uses the current interpreter, isolated Python path (`-I`), no bytecode write (`-B`), a timeout and no shell; it never invokes `pip`, `apt`, driver installers or `docker`. The untrusted stderr is not published by the tool.

Distinguish:
- `NOT_INSTALLED` / `INSTALLED_UNVERIFIED`: distribution metadata, **not** functioning torch import.
- `ACCELERATOR_AVAILABLE`: PyTorch sees CUDA/HIP devices; **not** CUDA Toolkit, `nvcc`, cuDNN, kernel execution, multi-GPU, model inference or training readiness.
- `ACCELERATOR_UNAVAILABLE`: PyTorch imports, but cannot see a CUDA/HIP device in this environment. CPU-only wheels and hidden GPUs can both cause this.
- `IMPORT_OR_RUNTIME_FAILED`, `TIMEOUT`, `INVALID_RESPONSE` or `UNAVAILABLE`: explicit failure / uncertainty, never silently interpreted as success.

GPUPanel Home's separately authenticated GPU card reports **provider telemetry**. This local Python CLI is a different signal about the active interpreter; they must not be conflated. Neither unblocks installation gates G3–G6.

## Optional real Docker daemon health

Use `python3 scripts/gpupanel-first-run-overview.py --probe-docker` to opt into a bounded **read-only** `docker info --format '{{.ServerVersion}}'` call. It does not create or delete containers. States are `NOT_CHECKED`, `MISSING_CLI`, `ACCESS_DENIED`, `UNAVAILABLE`, `TIMEOUT`, `INVALID_RESPONSE`, or `READY`. The check targets the **active Docker CLI context**, which may be a remote daemon; inspect your context before opting in. Even `READY` proves only Docker daemon communication, not the GPUPanel Agent API or container permissions.
