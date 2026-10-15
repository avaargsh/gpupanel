# GPUPanel single-host source release gate

Scope: first-party build reproducibility for **Ubuntu 24.04 / Linux amd64** source preview. This is one stage in a longer Golden Path. It does not install, upgrade, start, or overwrite Host services.

## How it works

```bash
python3 scripts/gpupanel-bootstrap.py doctor --human
python3 scripts/gpupanel-bootstrap.py self-test --human
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

Build order: `npm ci` → `vite build` (writes Go embed assets in `core/cmd/server/web/`) → `vue-tsc` → `CGO_ENABLED=0 go build` both Core and Agent → bundle GPL license, notice and SHA-256 manifest → verify resulting archive. The script uses subprocess argument vectors, no shell interpolation and no root privileges. `--offline` sets npm offline and GOPROXY=off; all required dependencies must already be in trusted caches.

Archive contents: `gpupanel/bin/1panel-core`, `gpupanel/bin/1panel-agent`, LICENSE, NOTICE.md, and manifest.json. Names intentionally remain inherited. The archive is **NOT AN INSTALLER**; it contains no systemd files, initialized database, 1pctl configuration, operator approval, rollback or data migration.

## Blocking product contracts for an actual installer

Current Go startup still assumes data/CLI paths including `/usr/local/bin/1pctl`, `/etc/1panel` and baseDir/1panel. Blindly installing fork binaries would risk collision and mutable state with existing 1Panel installations.

- [ ] Independent GPUPanel runtime data/root namespace and safe configuration/migration design
- [ ] Detect existing 1Panel installation and refuse side-by-side collision until isolation is proven
- [ ] Fresh-install first-admin credentials, authenticated API/CSRF and secure default bind
- [ ] Systemd services, restart supervision, health checks, application environment and rollback
- [ ] Docker daemon/Compose/Pod permissions and host operator least privilege
- [ ] Online mirror and offline artifact integrity, signed provenance and version-locked upgrades
- [ ] Restore a backup after interrupted upgrade; standalone Ubuntu 24.04 VM test
- [ ] Login -> Host -> Docker create/start/logs/stop/delete end-to-end acceptance

Release manifest uses `status=source-preview-not-installable` and verifies every included file. Do not publish it as a production distribution. The full source build runs in CI on PRs alongside hermetic contract tests; successful compilation is still not proof that installation or first-login succeeds.
