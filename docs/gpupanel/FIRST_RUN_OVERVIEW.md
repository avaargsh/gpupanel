# First-run Host overview — read-only

Run from the GPUPanel checkout on Ubuntu 24.04:

```bash
python3 scripts/gpupanel-first-run-overview.py --human
python3 scripts/gpupanel-first-run-overview.py
```

The first command provides operator guidance; the second emits a deterministic JSON overview of OS/disk/legacy 1Panel collisions, inherited runtime namespace blockers, and the reviewed user-local Python scaffold. **Nothing is installed or downloaded**; systemd is never invoked. Docker is not contacted unless `--probe-docker` is supplied.

A zero process exit code means only that the **inspection** succeeded. Read `conclusion`, `systemRuntime.installable`, `readyForProduction` and `host.blockers`; the system installer remains blocked until Core/Agent paths, credentials and services are independently migrated and tested. This overview does not prove Docker daemon health or GPUPanel API/RBAC acceptance.

## Optional real Docker daemon health

Use `python3 scripts/gpupanel-first-run-overview.py --probe-docker --human` to opt into a bounded **read-only** `docker info --format '{{.ServerVersion}}'` call. It does not create or delete containers. States are `NOT_CHECKED`, `MISSING_CLI`, `ACCESS_DENIED`, `UNAVAILABLE`, `TIMEOUT`, `INVALID_RESPONSE`, or `READY`. The check targets the **active Docker CLI context**, which may be a remote daemon; inspect your context before opting in. Even `READY` proves only Docker daemon communication, not the GPUPanel Agent API or container permissions.
