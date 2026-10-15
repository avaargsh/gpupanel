# GPUPanel source preview staging — not a system installation

**Scope:** the source preview tarball produced by `scripts/gpupanel-release.py build` can now be unpacked into a **private user-home inspection slot**. It is not registered with systemd and does not initialize or start Core/Agent. The inherited `1panel` directories are still a release blocker. Do not execute the preview binaries on a host with important data.

```bash
# Ubuntu 24.04, non-root, in the repository checkout
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-preview-stage.py plan dist/gpupanel-preview.tar.gz
# Review destination, version and archive digest:
python3 scripts/gpupanel-preview-stage.py stage dist/gpupanel-preview.tar.gz --approve
python3 scripts/gpupanel-preview-stage.py status dev
python3 scripts/gpupanel-preview-stage.py list
# Optional removal; refuses modified/unknown files:
```

**Optional cleanup: run separately; never paste with the creation commands.**

```bash
python3 scripts/gpupanel-preview-stage.py remove dev --approve
```

The tool validates the archive's *self-contained* manifest and SHA-256 hashes, copies the approved bytes to a private temporary snapshot, verifies that snapshot matches the planned archive digest, and extracts **only from the verified snapshot**. It refuses root/symlinked and existing targets, and stages files atomically to `~/GPUPanel/previews/source-<version>`. Bundled Core/Agent files are deliberately staged **without executable permissions**. Files in the slot are monitored against a receipt, and deletion is limited to the exact known members; user-changed files or unexpected additions block removal. It never touches `/etc/1panel`, `/opt/1panel`, `1pctl`, `/.1panel_clash`, Docker or systemd.

**Trust limit:** a self-contained checksum does not authenticate the publisher. This is an engineering preview with no signed provenance or secure first-admin setup. No system installation, upgrade, network endpoint, server health check or production readiness is implied.

To understand why a safe system installer is still blocked:
```bash
python3 scripts/gpupanel-install-preflight.py
python3 scripts/gpupanel-runtime-namespace.py --strict
```

The namespace audit intentionally exits nonzero until an independently verified Core/Agent namespace migration exists.

Status also detects permission drift: all staged files and the management receipt must stay mode 0600. Marking a Core/Agent binary executable causes `DRIFT` and blocks automatic removal until manually restored. This does **not** make the preview an installer.

## Read-only inventory

`python3 scripts/gpupanel-preview-stage.py list` shows only reserved `source-<version>` preview slots under the current user's `~/GPUPanel/previews/`, whether the staged files still match their private receipts, and counts of `STAGED` vs `DRIFT`. It ignores unrelated user directories and never runs or removes a staged binary. Symlinked slots are reported as drift and are never traversed. The inventory does not assert that the underlying Core/Agent services are installable.
