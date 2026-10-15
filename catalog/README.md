# GPUPanel Catalog Contract — Phase 0 (no installer yet)

The 1Panel App Store remains the **real** Docker/Compose applications user entry at `/apps/all`. It already implements catalog search, sync, version details and installation routes.

This directory is a separate, versioned **GPUPanel Catalog contract** for planned developer-environment and application templates. It does NOT replace 1Panel App Store, the model provider catalog (`agent/app/provider/catalog.go`) or any Kubernetes controller.

## Three separate entities

- `ApplicationDefinition`: stable identity, category (application/devtool/workspace/model/workflow), supported targets, descriptions and maturity.
- `PackageRevision`: immutable revision, provider adapter and preapproved recipe ID, pinned HTTPS artifact with SHA-256; must refer to an existing definition.
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

A Catalog entry **cannot** supply shell commands, URLs with credentials, unverified HTTP downloads or new Provider implementations. Recipe IDs are allowlisted *in executable code* (`APPROVED_RECIPES`, initially empty), not granted by the downloaded index. ModelScope/ACR are optional source adapters after origin policy, digest and failover tests; they are not default package repositories. OCI images require digest-based deployment through the existing Docker/Compose App Store; no digest-free `latest` assumption.

Target order: Host / Docker App Store product loop → pinned personal Ubuntu dev environment → optionally workspace / GPU compute via external platform.

## Next acceptance gate

Add **one** real pinned application revision from a trusted source, approved Python/OS/Docker recipe with no dynamic shell injection, authentic artifact signature/digest, install + remove + reconcile and rollback on a disposable Ubuntu 24.04 VM. An installed process exit code of zero is not independent outcome proof.
