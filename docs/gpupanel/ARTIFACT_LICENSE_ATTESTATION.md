# Preview archive licensing: Git-anchored attribution check

GPUPanel is still a **GPL-3.0 derivative of 1Panel**, not an Apache-2.0 release. This check is an incremental L1/L4 release-control input. It does **not** establish independent copyright ownership, build provenance, third-party license compliance, SBOM completeness, or permission to replace the project's root GPL license.

## Why this check exists

`scripts/gpupanel-release.py verify` validates the preview archive's internal SHA-256 manifest and member names. A complete archive can nevertheless be repackaged with a changed `LICENSE` and matching new internal hashes. This checker independently ties those legal files to an **existing full Git source commit**:

1. Run the current source-preview archive integrity verifier first.
2. Require a full hexadecimal `source_commit` in the archive's manifest, resolve it in the checked-out repository, and prove the frozen upstream 1Panel baseline is an ancestor.
3. Require the source commit's `LICENSE` to be byte-for-byte equal to the upstream GPL-3.0 baseline; require `NOTICE.md` to retain the 1Panel / GPL-3.0 credit.
4. Compare archive `gpupanel/LICENSE` and `gpupanel/NOTICE.md` byte-for-byte to those legal documents in the recorded Git source revision. Fail closed on missing, modified or unavailable evidence.
5. Emit evidence with a list of things **not proven**.

## Reproduce

With a full Git checkout containing baseline `d9dc5d7aa981c3b04ad284e93420aca9888f7e5a`:

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_artifact_license_audit.py' -v
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
python3 scripts/gpupanel-artifact-license-audit.py \
    --archive dist/gpupanel-preview.tar.gz \
    --output dist/gpupanel-preview-license-attestation.json
```

Building the preview requires the Node/Go toolchains and network/caches; the attestation itself uses only Python stdlib, local Git, and the existing release verifier. `--baseline` is exposed for **synthetic test histories**, not to relax the production upstream baseline. The CI job checks out full history.

A source preview built from a dirty checkout with altered licensing files, or an archive whose `source_commit` cannot be resolved, is intentionally refused. No runtime, user data, privileged service, or production server is touched. On failure, rebuild from a clean committed source rather than rewriting historical attribution.

## Explicit remaining risks

- Git commit identity is **not a signed build claim**; a binary in a properly packaged archive can still originate from some other source. Add reproducible builds / signing and Go binary build-info checks separately.
- The frontend assets may be embedded inside a Go executable; this guard does not inventory or clear those assets.
- Go/npm manifest review is captured separately in `DEPENDENCY_LICENSE_INVENTORY.md`; neither that inventory nor this archive check verifies license text from dependency source tarballs.
- This does not audit OCI image base layers or any future installer; the current archive is explicitly **non-installable**.
- Exact GPL notices are retained only for this fork's current release path. Any Apache-only final release remains blocked until all code/asset rights and full artifact obligations have been reviewed.

## Change and rollback

This adds a read-only verification step to the existing source-release CI and a separate test file. It does not change the packaged archive format or existing `scripts/gpupanel-release.py` behavior. Rollback is reverting the checker, tests, docs and CI hook, without host/data migration.
