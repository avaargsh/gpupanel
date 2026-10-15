# GPUPanel single-host pre-install preflight (read only)

For the Ubuntu 24.04 Host-first Golden Path:

```bash
python3 scripts/gpupanel-install-preflight.py --human
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

**These commands do not install GPUPanel.** Preflight checks OS, free space and known 1Panel collision paths without using root or executing shell commands. A legacy 1Panel `/usr/local/bin/1pctl`, `/etc/1panel`, `/opt/1panel`, or systemd service is a **BLOCKED** condition; GPUPanel must never overwrite another running panel.

Important: PASS means the limited metadata checks succeeded; it does not mean the current binaries will run standalone or are safe for production. Docker CLI/socket presence is not Docker daemon health.

Next engineering gate: independent namespace for GPUPanel runtime; signed/reproducible package; reviewed systemd units; backup and rollback; fresh first-user initialization; HTTPS/auth; server/agent health checks; Docker create/start/log/stop/remove verified by real API tests on disposable Ubuntu 24.04.

No GPU vendor-specific work belongs to this milestone.
