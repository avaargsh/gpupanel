# GPUPanel single-host pre-install preflight (read only)

For the Ubuntu 24.04 Host-first Golden Path:

```bash
python3 scripts/gpupanel-install-preflight.py
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

**These commands do not install GPUPanel.** The separate `gpupanel-preview-stage.py` only stages source-preview files in the user home for inspection, not a system service. See [preview staging](PREVIEW_STAGING.md). Preflight checks OS, free space and known 1Panel collision paths without using root or executing shell commands. A legacy 1Panel `/usr/local/bin/1pctl`, `/etc/1panel`, `/opt/1panel`, or systemd service is a **BLOCKED** condition; GPUPanel must never overwrite another running panel. The check also blocks already-existing GPUPanel executables, `/etc/gpupanel`, `/opt/gpupanel`, `/var/lib/gpupanel`, and systemd units. It additionally rejects known legacy/current unit names under `/usr/lib/systemd/system`, `/run/systemd/system` and dangling or valid enablement links under `/etc/systemd/system/{multi-user,default,sockets}.target.wants`, even when no matching `/etc/systemd/system/*.service` exists. It rejects symlinked **parent directories** of any known target even when the leaf file does not exist (for example, a redirected `/etc/systemd/system`). These are conservative candidate target names, **not** proof that current Core/Agent binaries use them.

Important: PASS means the limited metadata checks succeeded; it does not mean the current binaries will run standalone or are safe for production. Unit checks inspect known disk paths and process detection performs a bounded, read-only scan of `/proc/<pid>/comm` for exact legacy/current panel task names. **This is not live `systemctl` state, generator/service ownership, executable-path verification, process command-line evidence or arbitrary custom units**; a clean result cannot prove no panel is running. Docker CLI/socket presence is not Docker daemon health.

## Developer-only system installation gate (not a public installer)

`deploy/install.sh` is **not** a released safe installer. It previously accepted a read-only diagnostic's process exit status 0 as permission to start mutating host state, even though the JSON explicitly has `installable=false` and `safe_to_install=false`. The install script now treats that status as diagnostics **only**:

- **Default invocation refuses before loading or executing any package-supplied Python/checker.** Even the diagnostic file inside an unverified release archive is executable code and must not run implicitly as root. Run `python3 scripts/gpupanel-install-preflight.py --json` from a trusted source checkout (or review the extracted checker) separately as an unprivileged user, then assess the result; the installer itself never silently grants write permission.
- For a **disposable, isolated Ubuntu 24.04 VM only**, after separate human review of VM identity, target/data ownership, trusted payload (including the executable preflight) and snapshot/recovery procedure, the experimental `--approve-disposable-vm-install` flag allows the existing installer to execute its packaged checker as root and proceed **only** when the diagnostic report has the required clean PASS states and no blockers. This is an operator declaration, **not** independently verified VM isolation, package authenticity or release acceptance.
- Unexpected/missing/malformed report fields, any BLOCKED check, UNKNOWN OS/disk/path checks or Ubuntu 26.04 experimental diagnostics **never** authorize installation. `--experimental-ubuntu-26` remains a diagnostics option, not a second write-authority flag.
- Historical/ongoing 1Panel or GPUPanel ownership, in-place upgrades and partial installs remain **NO-GO**. Do not run the developer flag on a real work or production host. This flag does not validate installer rollback, first-user identity, HTTPS, Core/Agent/Kubernetes or app lifecycle.
- `deploy/build.sh` and package/source pipelines can be used to inspect artifacts, but running unverified source or payload as root is inherently unsafe. Record exact SHA, manifest/hash, VM snapshot and complete G3–G6 release evidence before promotion.

The parser and installer shell-order contract are tested without root or system installation in `scripts/tests/test_gpupanel_local_deploy_contract.py`; such source-level tests are **not** evidence of a successful Ubuntu install/rollback.

Next engineering gate: a **reviewed fork-first runtime path/service ownership plan** (inherited or new paths), explicitly approved migration when existing state is found, signed/reproducible package, reviewed systemd units, backup/rollback, first-admin initialization, HTTPS/auth, Core/Agent health checks and Docker lifecycle verified through authenticated GPUPanel APIs on disposable Ubuntu 24.04. A fully separate namespace is not mandatory for source development, but neither a clean metadata preflight nor a new service name authorizes touching existing 1Panel data.

No GPU vendor-specific work belongs to this milestone.
