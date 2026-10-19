# G3: In-app upgrade runtime ownership (Draft, M0 NO-GO)

The real Ubuntu 24.04 QEMU job #140 installed Core and Agent into
`/opt/gpupanel/gpupanel-{core,agent}`, with systemd `ExecStart` directly
using those paths. The installer also creates compatibility symbolic links at
`/usr/local/bin/gpupanel-{core,agent}`.

**Previously** the in-app Upgrade/Rollback code passed the symbolic link path
to `CopyFileWithRename`, which copies to `destination.tmp` and then calls
`mv destination.tmp destination`. That operation **replaces the symbolic
link** rather than replacing its original executable target. A successful
upgrade could therefore leave the original Core/Agent binaries running and
make any later downgrade ambiguous.

## Scope of this Draft

- Preflight the default `/opt/gpupanel` install identity before upgrade:
  actual Core/Agent files must be executable regular files, the installation
  root must resolve to itself, systemd unit files must be ordinary files and
  contain exactly one `ExecStart` and `WorkingDirectory` pointing to
  their corresponding owned paths.
- Require the **default Ubuntu/systemd** installation (`/opt` and
  `/etc/systemd/system`) during this initial pilot. Different base
  directories/managers fail closed, instead of writing to a guessed path.
- Back up, install and roll back the **same validated runtime targets**.
  Never write either compatibility symlink in `/usr/local/bin`.
- Correct the original backup path to `BackupFile/original`, rather than
  the transaction parent. **The running Core API now refuses an online manual
  Rollback after read-only snapshot validation**. Writing SQLite files and
  executables while the owning services run is not an offline restore; no
  safe API-triggered rollback exists in this Draft. The earlier handler is
  retained for future stopped-service integration only.
- Make the rollback handler accumulate and return restoration errors instead
  of logging them and returning implicit success. Automatic rollback failures
  are explicitly surfaced in service logs; this is not proof of guest health.
- Reject release-version inputs that are not bounded conventional version
  tokens **before constructing any filesystem path**. The old upgrade code
  interpolated an API-provided version directly into a path and recursively
  deleted that path. The new stage is created only with `mkdir` and will
  **refuse to reuse an existing version stage**, preserving earlier rollback
  snapshots and in-flight failure evidence.
- Validate UpgradeLog's stored backup path as a canonical **single version
  component within the owned upgrade root**. Reject path traversal, foreign
  backup roots and symlinked backup directories before attempting restore.
  The rejected inputs never authorize deleting or replacing host files.
- Protect these contracts with disposable Go tests for symlinks, mismatched
  service units, missing executable, unit ambiguity, wrong paths and aliases.
- No Agent installation change; no live customer host action.

## Remaining blockers

**Operators must not use an in-app Rollback button or HTTP request to
restore live databases.** The current in-app handler returns a fail-closed
error until a separate authenticated, stop-verified offline recovery tool
can restore DB/binaries/service units, restart both services and validate
original state. This is intentionally an availability limitation for safety.

This does **not** establish a complete safe upgrade/rollback. The in-app
upgrade still downloads asynchronously, modifies service files, copies DB
backup directories while the server is running, relies on a remote
artifact feed, and does not yet prove digest+signature authenticity,
transactional DB recovery, complete rollback verification or service health after
restart. In particular, even with propagated file-level rollback errors, this
does not prove an offline-consistent SQLite database restore, complete
runtime health, or safe rollback ordering. Those behaviors must be audited
and corrected before a production-ready G3 GO.

Next: run a **fresh** disposable Ubuntu 24.04 VM, build two pinned
release candidates, preserve machine/data fingerprints, apply one upgrade,
inject interruption after binary/DB staging, verify rollback and original
login/settings/agent health. Do not test on an existing 1Panel installation
or on the user workstation; no `--approve-disposable-vm-install` outside
the one-purpose guest.

The proven #140 VM workflow only covered **fresh install**, Chromium login
and partial Agent restart/recovery. **G3 upgrade/rollback remains NOT RUN and
M0 remains NO-GO** until independent evidence is reviewed.
