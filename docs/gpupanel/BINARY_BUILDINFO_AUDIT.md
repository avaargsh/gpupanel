# Release L4 preview gate: Go binary build metadata

**License status: GPUPanel remains GPL-3.0.** This read-only check extends the existing [Git-anchored archive attribution](ARTIFACT_LICENSE_ATTESTATION.md). It does not relicense the project and does not certify third-party license compliance.

## What is verified

For the existing **non-installable** `gpupanel-preview.tar.gz`, the checker:

1. Requires the existing source-commit-bound GPL `LICENSE` / 1Panel `NOTICE.md` attestation to pass, including upstream baseline ancestry and archive integrity.
2. Extracts each already-verified Core and Agent archive member into a disposable temporary directory, and uses **`go version -m`** to read Go build information without running the executable.
3. Reads `core/go.mod` and `agent/go.mod` from the archive's **recorded immutable Git source commit**, rather than trusting a potentially dirty working tree.
4. Requires each packaged binary's main module and `.../cmd/server` entrypoint to match the corresponding committed Go module name. Records Go compiler version and embedded Go dependency metadata (including `=>` replacements) as **review inputs**.
5. Fails closed on corrupt packages, missing/unreadable build-info, mismatched modules, and unavailable Git evidence.

## Commands

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_binary_buildinfo.py' -v
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-binary-buildinfo.py \
  --archive dist/gpupanel-preview.tar.gz \
  --output dist/gpupanel-binary-buildinfo.json
```

The CI source-release contract job runs offline fixtures, while the full-source-build job runs this on actual built Go binaries. A full checkout with upstream baseline `d9dc5d7aa981c3b04ad284e93420aca9888f7e5a`, Go toolchain, Node and npm are necessary to build and inspect actual production-mode preview binaries. If Go tools are unavailable, fail rather than claiming a scan succeeded.

## What remains unproven

A malicious or inconsistent binary can carry forged Go metadata. A passing module check does **not** establish that the bytes were built from the recorded source commit, or that transitive/vendor dependencies, embedded frontend assets, fonts, OCI layers and installer bundles are license-cleared. This JSON is **not** SPDX/CycloneDX SBOM, a copyright opinion, a signature, or a reproducible-build proof. The root GPL license and credits cannot be replaced with Apache-2.0 on this evidence.

Next: investigate Go/npm license texts and the frontend embedded assets of **actual release output**, then build independent module rights evidence; never make an Apache-only release claim until license owners and distribution boundaries are cleared.

## Changes and rollback

Only a developer audit script, tests, CI contract and this document are added/changed. No runtime code, API, database, installation scripts, host resources or preview archive members are modified. Revert the PR to remove the additional audit; standard GPL attribution remains intact.
