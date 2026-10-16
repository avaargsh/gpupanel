# GPUPanel Apache-2.0 dependency and distribution gap review — 2026-10-16

> Source base: `main @ 086d79cf10f5879c5521859b15605a1ca16e79bc`. This is **an engineering provenance inventory, not a legal opinion or a license conversion**. Root `LICENSE` and `NOTICE.md` remain GPL-3.0 / 1Panel attribution. Do not change them based on this report.

## Measured source and manifest scope

| Subject | At this base | Interpretation |
| --- | ---: | --- |
| Inherited 1Panel Core / Agent / substantial fork source | GPL-3.0 | **Apache-only release blocked** until rights are obtained or a separately audited independently lawful implementation/distribution exists |
| Explicit file-scoped Apache-2.0 | 4 Python audit source/test files | Defined in `APACHE_FILE_SCOPE.md`; not a project-wide grant |
| pnpm v9 lock package records | **382** | Lock records (367 application package entries + 15 package-manager/bootstrap entries across the lock documents), **not 382 installed/shipped packages**. Existing lock-only audit has no authoritative license text/hints |
| React workspace direct + dev declarations | **15 + 7** | `frontend/apps/panel/package.json`; versions resolve via `frontend/pnpm-lock.yaml` |
| Go `require` records | **131 Core + 218 Agent = 349** | May include duplicate modules and indirect requirements; **not** measured final binary dependency count |
| Go `replace` | **1** | `github.com/go-acme/lego/v5 => github.com/1Panel-dev/lego/v5 v5.3.1` |
| Actual installable bundle | GPL `LICENSE` + fork `NOTICE.md` copied | No verified third-party notices manifest, resolved dependency license texts, code/asset SBOM or all-artifact license sign-off in `deploy/build.sh` |

Evidence is drawn from the pinned `frontend/pnpm-lock.yaml`, `frontend/apps/panel/package.json`, `core/go.mod`, `agent/go.mod`, `deploy/build.sh`, `NOTICE.md`, and the existing license review tooling.

## Real Ubuntu CI evidence (PR #96)

The dependency workflow on 2026-10-16 completed successfully at [run 38833308679](https://github.com/avaargsh/gpupanel/actions/runs/38833308679) after a pinned frozen pnpm install, plus the Go/manifest evidence generator:

| Evidence result | Count |
| --- | ---: |
| pnpm lock identities | **382** |
| Installed identities on Ubuntu runner | **317** |
| Installed packages with at least one top-level LICENSE/COPYING/NOTICE file | **314** |
| Installed packages without a readable matching top-level legal file | **3** |
| Lock identities not installed in this environment (including platform-specific optional dependencies) | **65** |
| Go requires from current manifests | **349** (103 direct entries) |
| Go module replacements | **1** |

These counts are **source-package evidence only**. The 314 files have *not* been reviewed for license compatibility or required redistribution wording; the 3 files without discovered top-level license documents need individual review, and the 65 uninstalled records do **not** mean licenses are violated. Exact per-package hashes are in the workflow artifact `gpupanel-dependency-review`.

## Critical gaps (ranked)

| Priority | Gap | Required acceptance / responsible work |
| --- | --- | --- |
| **P0 – blocking the goal** | GPL derivative work remains the actual product | Identify upstream-owned and derived code/assets and their copyright holders. Keep the GPL distribution, or obtain **documented rights for all affected content**; a renamed/refactored fork does not become Apache-only |
| **P0 – release claims** | Root GPL and file-scoped Apache declarations could be confused | Continue `L0/L2` guards. No Apache-only badges, root license replacement, or release declaration unless L1–L5 verified |
| **P1 – pnpm license evidence** | pnpm lock has versions/integrities, **not actual license texts or clearance** | Run frozen pnpm install in CI and inventory installed package `package.json` license hints and local LICENSE/COPYING/NOTICE document SHA-256, with explicit missing/OS-optional states; see this PR |
| **P1 – Go effective graph** | 349 manifest entries do not prove which Go modules and notices enter the shipped binaries | For each Core/Agent build, save `go list -m -json all` / build info and licenses from the exact resolved module source, including replacements/build tags; compare against binary and copy required notices |
| **P1 – specific fork** | 1Panel-maintained Lego fork is different from upstream module | `1Panel-dev/lego` **tag v5.3.1** contains MIT `LICENSE` (verified via GitHub). Audit its actual changes, third-party files and associated notice obligations before clearing. MIT text is not an Apache relicense of 1Panel-owned additions |
| **P1 – frontend bundle** | Browser bundle embeds React/Semi/assets; package lock scan alone cannot identify licenses in shipped output | Build frontend, map included dependencies/third-party font and icon assets to source packages, record notices/licenses in release payload. `DouyinFE/semi-design` **v2.104.0** repository tag has MIT `LICENSE`; its bundled/third-party notices still require version-specific review |
| **P1 – actual installer artifacts** | `deploy/build.sh` currently copies GPL `LICENSE` and `NOTICE.md` but does not assemble verified third-party notices/SBOM | On an isolated release candidate, inspect exact tar members, Go binaries, embedded web static assets, optional GeoIP, language packs, supplied scripts and dependency license texts. Ship required attribution before any broad release-compliance claim |
| **P2 – contributions** | Added files and future Wails/SDK/Workspace modules require real authorship evidence | For each independent Apache candidate record author, contributor authority, source SHA, copied code review, dependency use, NOTICE obligations and explicit license declaration. The four pre-cleared audit files do **not** automatically extend to neighbors |

## What the new evidence tool adds

```bash
cd frontend
pnpm install --frozen-lockfile
cd ..
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_pnpm_license_evidence.py' -v
python3 scripts/gpupanel-pnpm-license-evidence.py --output pnpm-installed-license-evidence.json
```

The read-only script uses the existing conservative pnpm lock parser. For the **actual installed pnpm store on this runner**, it matches package name+version from `package.json` against lock identities, records declared license hints and exact SHA-256 of top-level `LICENSE`, `LICENCE`, `COPYING`, and `NOTICE` files. It distinguishes missing evidence, uninstalled platform-optional lock records, peer-variant conflicts and extra installed package identities. It refuses unsafe symlinked manifests and never opens symlinked license files. The CI artifact includes this report together with the existing lock/Go report.

**Important limits:** A text hash only proves text was present in a particular installed package; it is not license compatibility or authority verification. `LICENSE_TEXT_FOUND_REVIEW` is still **unreviewed**. No production build, Docker image, binary SBOM, transitive vendored subasset, Go package source audit or Apache release sign-off is produced by this step. Running `pnpm install` is confined to a GitHub runner; no GPUPanel host application is installed or modified.

## Next engineering decisions

1. Finish review of real installed pnpm license hashes and any missing/contradictory documents; do not count uninstalled optional platforms as violations.
2. Verify exact Go `replace` and effective module/build-time source licenses. Prioritize modules actually bundled in Core and Agent.
3. Create **release-candidate-specific** machine-readable bill of materials and `THIRD_PARTY_NOTICES`, generated from verified exact dependency contents, and test they are included in the installable tarball. Do not populate notices from guessed license metadata.
4. Only after release attribution evidence, continue file/module-level Apache candidate clearance, keeping 1Panel GPL distribution truthful.

Sources: [ASF GPL compatibility](https://www.apache.org/licenses/GPL-compatibility), [ASF Apache-2.0 application guidance](https://www.apache.org/legal/apply-license), [GPUPanel file-level Apache scope](APACHE_FILE_SCOPE.md), [existing dependency inventory](DEPENDENCY_LICENSE_INVENTORY.md).

**Rollback:** revert the tool, tests, workflow and this documentation; no runtime/API/DB/install changes.
