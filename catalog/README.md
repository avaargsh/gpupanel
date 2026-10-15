# GPUPanel Catalog — first offline user-local project scaffold

The original 1Panel remote App Store is **retired** from GPUPanel discovery and background sync. The `/apps/all` entry now renders this GPUPanel Catalog index as a read-only preview. Installed applications remain under `/apps/installed`; the inherited app management backend is retained for safe uninstall and recovery. New Catalog definitions generally do not yet install software. The explicit exception is the **experimental Python stdlib project scaffold**, installed only via an offline user-local CLI (not the web Host agent).

This directory is a separate, versioned **GPUPanel Catalog contract** for planned developer-environment and application templates. It does NOT replace 1Panel App Store, the model provider catalog (`agent/app/provider/catalog.go`) or any Kubernetes controller.

## Three separate entities

- `ApplicationDefinition`: stable identity, category (application/devtool/workspace/model/workflow), supported targets, descriptions and maturity.
- `PackageRevision`: revision ID must equal the SHA-256 of canonical revision JSON (excluding the ID), with provider adapter and preapproved recipe ID, pinned HTTPS artifact and checksum; must refer to an existing definition. Changing source, version, recipe or digest invalidates the revision ID.
- `Installation`: mutable execution/observed state owned by the actual Host or Docker provider, with authorization and independent verification. **Never store installation ownership or success in this static Catalog index.**

CLI commands (Python stdlib, offline, no root):

```bash
python3 scripts/gpupanel-catalog.py verify
python3 scripts/gpupanel-catalog.py list
python3 scripts/gpupanel-catalog.py show gpupanel.dev.python
python3 scripts/gpupanel-catalog.py plan gpupanel.dev.python
```

`plan` deliberately exits 2 (BLOCKED): no executable package revision/recipe has been approved. Neither `verify` nor a package SHA-256 provides artifact provenance or signature/trust-root verification. `indexSha256` is for reproducibility only, **not a trusted signature**.

## Future delivery workflow

Discover → Plan → Resolve trusted source → Approve RBAC → Download → Verify digest / signature → Execute through allowlisted Provider → Independent observation → Reconcile/rollback → Audit.

A Catalog entry **cannot** supply shell commands, URLs with credentials, unverified HTTP downloads or new Provider implementations. Recipe IDs are allowlisted *in executable code* (`APPROVED_RECIPES`, initially empty), not granted by the downloaded index. ModelScope/ACR are optional source adapters after origin policy, digest and failover tests; they are not default package repositories. One code-reviewed bundled **project scaffold** is approved: `python-stdlib-scaffold-v1`, loaded only from the exact repository path, SHA-256 checked file manifest, and published to the user's home directory by a separate Python adapter. This is NOT an OS package, Python distribution, signed third-party binary or privileged installer. Other offline bundles still require an approved source adapter. OCI images require digest-based deployment through the existing Docker/Compose App Store; no digest-free `latest` assumption.

Target order: Host / Docker App Store product loop → pinned personal Ubuntu dev environment → optionally workspace / GPU compute via external platform.

## Next acceptance gate

Add **one** real pinned application revision from a trusted source, approved Python/OS/Docker recipe with no dynamic shell injection, authentic artifact signature/digest, install + remove + reconcile and rollback on a disposable Ubuntu 24.04 VM. An installed process exit code of zero is not independent outcome proof.

## Working Golden Path: first user-local Python starter

On Linux/Ubuntu, with Python 3.12+ already installed and as a normal user:

```sh
python3 scripts/gpupanel-catalog.py verify
python3 scripts/gpupanel-catalog.py plan gpupanel.dev.python-stdlib
python3 scripts/gpupanel-catalog-workspace.py plan
python3 scripts/gpupanel-catalog-workspace.py install --approve
python3 scripts/gpupanel-catalog-workspace.py status
python3 ~/GPUPanel/projects/python-stdlib-starter/main.py
python3 scripts/gpupanel-catalog-workspace.py uninstall --approve
```

The installer refuses root, outside-home destinations, symlinks, existing projects and unverified files. Planning creates no directories; after explicit approval it creates missing user-home parent directories with private permissions (never deletes them on uninstall). It publishes through Linux atomic no-overwrite rename, records a receipt, and refuses removal if the user has modified/added content. **No shell commands or third-party installers are executed by GPUPanel.** The user explicitly runs the starter code separately.

The web Catalog card intentionally remains **non-installable** until the authenticated Host execution/observation adapter is integrated and independently acceptance-tested.
