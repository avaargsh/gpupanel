# First-run Host overview — read-only

Run from the GPUPanel checkout on Ubuntu 24.04:

```bash
python3 scripts/gpupanel-first-run-overview.py --human
python3 scripts/gpupanel-first-run-overview.py
```

The first command provides operator guidance; the second emits a deterministic JSON overview of OS/disk/legacy 1Panel collisions, inherited runtime namespace blockers, and the reviewed user-local Python scaffold. **Nothing is installed or downloaded**; neither Docker nor systemd is invoked.

A zero process exit code means only that the **inspection** succeeded. Read `conclusion`, `systemRuntime.installable`, `readyForProduction` and `host.blockers`; the system installer remains blocked until Core/Agent paths, credentials and services are independently migrated and tested. This overview does not prove Docker daemon health or GPUPanel API/RBAC acceptance.
