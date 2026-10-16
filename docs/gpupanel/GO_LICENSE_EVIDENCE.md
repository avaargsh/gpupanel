# Binary-bound Go dependency license evidence — L1/L4 partial

**Scope:** GPUPanel Git source-preview builder's two compiled Go executables (`gpupanel-core` and `gpupanel-agent`). This is **review evidence**, not an Apache-2.0 clearance, complete SBOM or verification of the installable `deploy/build.sh` package.

## Existing evidence contract

1. `gpupanel-release.py verify`: preview archive member hashes and structure.
2. `gpupanel-artifact-license-audit.py`: preview GPL `LICENSE` / 1Panel `NOTICE.md` bound to immutable source commit and upstream baseline.
3. `gpupanel-binary-buildinfo.py`: Go `go version -m` dependency metadata extracted from **both actual binaries** in the same preview, with the expected committed Core/Agent module identities and entrypoints checked. This doesn't execute the binaries.
4. **This change**: for each binary's declared dependency module and version, compare the corresponding `go list -m -json all` graph for the matching Core/Agent source module. Compare any `replace` target+version exactly, resolve the Go module cache `Dir`, hash readable top-level `LICENSE`, `LICENCE`, `COPYING` or `NOTICE` files. Emit missing, untrusted/unsafe, local replacement or out-of-cache source paths as unresolved, not approved.

Go metadata is produced in CI **after building**. This tool only reads module-cache metadata and license files; it does not execute a Go dependency's code or write to user hosts. Existing full-source-build CI already compiles the binaries; no third installer or privileged operation is added.

## Reproduction

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_go_license_evidence.py' -v
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
python3 scripts/gpupanel-artifact-license-audit.py \
  --archive dist/gpupanel-preview.tar.gz \
  --output dist/gpupanel-preview-license-attestation.json
python3 scripts/gpupanel-binary-buildinfo.py \
  --archive dist/gpupanel-preview.tar.gz \
  --output dist/gpupanel-binary-buildinfo.json
python3 scripts/gpupanel-go-license-evidence.py \
  --buildinfo dist/gpupanel-binary-buildinfo.json \
  --output dist/gpupanel-go-license-evidence.json
```

Run from the same clean source checkout and module caches used for the binary build, with Go and Node/pnpm dependencies available. CI provides an artifact `gpupanel-preview-go-license-evidence` holding the three JSON receipts (not executable binaries or credential-bearing logs).

## State and failure semantics

- `LEGAL_FILE_HASH_REVIEW`: at least one readable top-level legal document in the exact resolved cached module. **Still unreviewed**; no automatic SPDX classification or redistributed-notice permission.
- `LEGAL_FILE_MISSING_REVIEW`: no matching top-level legal file. Check parent module, embedded packages and actual copyright notices; not automatically incompatible.
- `LEGAL_FILES_UNREADABLE_REVIEW`: only unsafe/oversized/symlinked legal files; refuse reading them.
- `MODULE_SOURCE_NOT_PRESENT`: Go graph describes a module but no checked local source path. Missing cache is missing evidence, not a distribution-license violation.
- `LOCAL_REPLACEMENT_REVIEW` / `MODULE_SOURCE_OUTSIDE_CACHE` / `MODULE_SOURCE_UNSAFE`: module source needs explicit owner/context review.
- Exact binary/graph module-version mismatch, missing verified archive build-info, or replacement-target mismatch: **fails**, rather than producing a reassuring report.

The 1Panel-maintained fork replacement `github.com/go-acme/lego/v5 => github.com/1Panel-dev/lego/v5 v5.3.1` receives its own original+effective identities and remains a review item even if its MIT legal file is present.

## Remaining blockers

- GPLv3 derivation of the existing 1Panel code, rights-holder grants for an Apache-only distribution.
- Version-specific copyright and notice obligations from **all** effective Go and frontend transitive dependencies and bundled assets (not just top-level files).
- The *installable* tarball's binary/embedded frontend/resource/NOTICE inventory and exact bill of materials, unlike the **non-installable** source preview covered here.
- Binary reproducibility, signature/SLSA attestations, actual code inclusion analysis and release-wide SPDX/SBOM review. Go binary build-info lists module dependencies, not the linked object file inventory. Absent module directories may need a separately approved download/cached-source gate.

No root license change, no new Apache-scoped file declaration, no released binary signing. Rollback: revert this script, synthetic tests, document and CI job steps, without data or runtime changes.
