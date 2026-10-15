# GPUPanel runtime namespace isolation ledger

Run `python3 scripts/gpupanel-runtime-namespace.py --human` to review inherited 1Panel paths. Use `--strict` in any future installer/release gate: it exits **2 until a separate independently reviewed isolation proof exists**. It does not create, overwrite, migrate or back up host data.

## What this means for shipping

The existing Core/Agent binaries can compile, and the source preview tarball passes checksum validation. They still share startup assumptions with upstream 1Panel:

- Core reads environment/credentials through `/usr/local/bin/1pctl`; config dev path `/opt/1panel/conf/app.yaml`.
- Core DB uses `$BASE_DIR/1panel/db/` (Core and related DBs).
- Master Agent socket remains `/etc/1panel/agent.sock`.
- Agent installation, Docker Compose, resource, database and log directories remain within `$BASE_DIR/1panel/`.
- Agent recycle directory still uses global `/.1panel_clash`.

A rename of the binary, Docker Compose app name, or the systemd service is **not enough**. There is no approved GPUPanel installation path until these are safely separated and the old 1Panel state is preserved.

## Migration sequence

1. Decide independent runtime root and socket namespace; define compatibility contracts between Core, Agent and CLI.
2. Review every direct reader/writer path and choose **no-side-by-side** refusal until coexistence can be proven.
3. Add explicit immutable config, first admin initialization, authentication and service identity.
4. Implement rollback/backup and crash recovery; default to stopping without data mutation on collision.
5. Verify fresh disposable Ubuntu 24.04 host end-to-end including Host/Docker CRUD, negative RBAC and restart.
6. Update this fixed evidence inventory only with actual source references and passing VM acceptance evidence.

The audit intentionally reports `UNKNOWN`, not PASS, when a hard-coded signature disappears: source movement alone cannot establish that writes are isolated.
