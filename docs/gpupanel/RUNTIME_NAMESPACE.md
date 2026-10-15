# GPUPanel standalone runtime collision gate

The GPUPanel fork **is not safe to install alongside 1Panel** yet. Read-only OS/disk preflight is not enough: Core and Agent still reference inherited 1Panel runtime namespaces.

Run:

```bash
python3 scripts/gpupanel-install-preflight.py --human
python3 scripts/gpupanel-runtime-audit.py
```

The second command intentionally exits **2** until the runtime isolation work has been independently reviewed. It does **not** install, fix, migrate or remove anything.

Explicit source-level blockers (2026-10-15):

- Core control CLI reads `/usr/local/bin/1pctl` and inherited `1panel/db`.
- Core Viper dev config reads `/opt/1panel/conf/app.yaml` and installed settings via `ctl_conf.Load`.
- Core DB startup opens `1panel/db/core.db` and `1panel/db/agent.db`.
- Agent master UNIX socket is `/etc/1panel/agent.sock` (startup can replace a stale socket).
- Agent initialization creates `1panel/db`, `1panel/apps` and other inherited directories.
- Agent dev Viper reads the existing `/opt/1panel/conf/app.yaml` path.

**Closing this source gate requires changing every relevant startup, data, app, socket, service and control-CLI path** without breaking legitimate restore behavior. A missing static marker is a *review required* state, not proof that isolation has been achieved. Independent Ubuntu 24.04 VM tests then must establish: two installations do not collide, no foreign user data is modified, first credentials are unique, authentication works, and rollback restores prior state.

CI intentionally asserts the blockers remain visible. It is not a green installer or release approval.
