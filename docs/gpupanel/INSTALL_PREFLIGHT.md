# GPUPanel single-host pre-install preflight (read only)

For the Ubuntu 24.04 Host-first Golden Path:

```bash
python3 scripts/gpupanel-install-preflight.py
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

**These commands do not install GPUPanel.** The separate `gpupanel-preview-stage.py` only stages source-preview files in the user home for inspection, not a system service. See [preview staging](PREVIEW_STAGING.md). Preflight checks OS, free space and known 1Panel collision paths without using root or executing shell commands. A legacy 1Panel `/usr/local/bin/1pctl`, `/etc/1panel`, `/opt/1panel`, or systemd service is a **BLOCKED** condition; GPUPanel must never overwrite another running panel. The check also blocks already-existing GPUPanel executables, `/etc/gpupanel`, `/opt/gpupanel`, `/var/lib/gpupanel`, and systemd units. It rejects symlinked **parent directories** of any known target even when the leaf file does not exist (for example, a redirected `/etc/systemd/system`). These are conservative candidate target names, **not** proof that current Core/Agent binaries use them.

Important: PASS means the limited metadata checks succeeded; it does not mean the current binaries will run standalone or are safe for production. Docker CLI/socket presence is not Docker daemon health.

Next engineering gate: a **reviewed fork-first runtime path/service ownership plan** (inherited or new paths), explicitly approved migration when existing state is found, signed/reproducible package, reviewed systemd units, backup/rollback, first-admin initialization, HTTPS/auth, Core/Agent health checks and Docker lifecycle verified through authenticated GPUPanel APIs on disposable Ubuntu 24.04. A fully separate namespace is not mandatory for source development, but neither a clean metadata preflight nor a new service name authorizes touching existing 1Panel data.

No GPU vendor-specific work belongs to this milestone.
