# GPUPanel → Apache-2.0: incremental licensing plan

> Status: **PLAN / NOT A RELICENSING EVENT**  
> Decision: 2026-10-15  
> Repository review baseline: `dev-v2` at `c9c5cb02e286673b3d3ac3a83ac64a5312fb11d7`  
> Upstream reference already recorded in this fork: `1Panel-dev/1Panel dev-v2 @ d9dc5d7aa981c3b04ad284e93420aca9888f7e5a`

## Decision and current legal status

**Long-term product preference:** GPUPanel should use the Apache License, Version 2.0 where the project has the necessary rights. Make progress incrementally, without slowing the Ubuntu Host → Docker → App Store → recovery product loop.

**Present-day fact:** GPUPanel is derived from 1Panel, whose source is licensed GPL-3.0. The fork's root `LICENSE`, `NOTICE.md`, README, and contributor guidance currently represent it as GPL-3.0. **The GPUPanel fork/distribution remains GPL-3.0; this plan does not alter any code's license.** Keep required original attribution, copyright notices, and GPL obligations.

Only the applicable copyright holders may grant Apache-2.0 terms to code that is currently GPL-covered. Renaming files, rewriting surface syntax, moving code to new directories, using an AI refactor, or deleting Git history is **not** evidence that the original copyrighted expression or license duties disappeared.

Apache-2.0 code can be incorporated into GPLv3-covered work, but that does **not** make the resulting GPLv3-covered work an Apache-only distribution. In particular, an Apache file header is not a solution to inherited GPL source or a tightly integrated derivative work. See [ASF GPL compatibility guidance](https://www.apache.org/licenses/GPL-compatibility) and [ASF application guidance](https://www.apache.org/legal/apply-license).

The scope of a derivative/combined work and any separate-process/service boundary depends on the actual code and distribution arrangement; architecture alone is not a legal conclusion. Review non-obvious cases with qualified legal counsel before a relicensing announcement.

## Migration gates

| Gate | Goal | Evidence / acceptance | Current status |
| --- | --- | --- | --- |
| L0 | Preserve truthful licenses and upstream attribution | Root `LICENSE` stays GPLv3; `NOTICE.md` retains 1Panel credit and baseline; no claims of Apache-only project licensing | **PASS (document check only)** |
| L1 | Establish file-level provenance | Inventory all shipped source/assets/generated files, origin SHA and copyright holder; mark copied/derived/modified/independent/third-party/unknown; audit every exception | **NOT STARTED** |
| L2 | Introduce clearly owned independent components | File-level Apache-2.0 declaration **only after** provenance + contributor authority + dependency review; preserve prior third-party license texts; include official Apache license copy when used | **NOT STARTED** |
| L3 | Remove inherited GPL implementation from intended Apache distribution | Replace or omit GPL-derived components with independently authored, reviewed code or secure explicit rights-holder permissions; review linking, packaging and process boundaries | **NOT STARTED** |
| L4 | Scan the actual release artifact | Source + dependency/asset/SBOM inventory, license/NOTICE completeness, packaged binaries/static frontend, reproducible CI report with no unresolved restricted content | **NOT STARTED** |
| L5 | Change release-wide license declarations | Written sign-off on all rights, code and artifacts; legal review; only then change root `LICENSE`, README, package metadata, badges and release claims in a dedicated PR | **BLOCKED until L1–L4** |

Do not treat `L0` as evidence of conversion. A passing build or a file's presence in a fork-specific Git diff does not prove independent copyright ownership.

## File classification and decision rubric

Track inventory with at least these fields:

`path | origin (upstream/new/third-party/unknown) | baseline/blob evidence | copyright holder(s) | dependency/combined-work relationship | currently applicable license | Apache rights evidence | proposed action | reviewer/status`

Allowed decision labels:

- **KEEP_GPL**: inherited/derived 1Panel implementation or otherwise GPL-covered source; retain notices and GPL terms.
- **CANDIDATE_APACHE**: apparently independent original work; needs evidence of authorship, contributor authority, and a legal/dependency review; do not pre-label as Apache.
- **THIRD_PARTY_REVIEW**: downloaded dependency, artifact, font, icon, asset, bundled copy, generated code, or vendored component; inspect its real license and redistribution conditions.
- **UNKNOWN_BLOCK**: origin or rightsholder unverified; cannot count toward an Apache-only release.
- **REPLACE_OR_REMOVE**: inherited GPL code no longer needed for the target product, replace through independent implementation or remove after behavior and compatibility tests.
- **RIGHTS_GRANTED**: explicit written rights from all relevant rightsholders allow Apache-2.0 for specified files/versions; preserve proof and attribution conditions.

Do not assume any `added` file in `git diff upstream..HEAD` is Apache-eligible: additions can copy third-party or GPL code. Likewise, contributor-owned patches to GPL files do not relicense the underlying original code. For owned original work, document inbound contribution terms prospectively rather than claiming consent from prior contributors.

### Initial review candidates (NOT an audited inventory)

| Area | Immediate handling | Why |
| --- | --- | --- |
| `core/`, `agent/`, inherited `frontend/` | KEEP_GPL until reviewed/replaced | Existing fork relies on 1Panel Core, Linux Agent, Vue views, API behavior and module imports |
| `frontend/src/assets/` and branding | THIRD_PARTY_REVIEW / CANDIDATE_APACHE | Confirm each image/font/logo's origin and creator; product trademarks are a separate matter |
| `catalog/`, `profiles/`, `scripts/`, `docs/gpupanel/` | CANDIDATE_APACHE *per file only* | Newer project-specific material exists, but Git-added status does not prove all rights |
| Future separately authored desktop tooling, SDKs, provider integrations | Prefer independent Apache-2.0 deliverables after review | Can establish clean ownership early without promising the original 1Panel-based binary is Apache-only |
| npm, Go, vendored assets, build outputs and images | THIRD_PARTY_REVIEW | Distribution permissions are not determined solely by the main repo's root license |

## Practical implementation order (product-first)

1. **No disruption:** preserve 1Panel code as GPL-3.0 and continue Host/Docker/App Store/backup and Ubuntu VM acceptance. Do not block feature PRs on a speculative rewrite.
2. **Provenance and tooling:** obtain the full fork/upstream file diff and copyright header scan, record dependency licenses, and build a reviewable manifest with UNKNOWN as the default. Automate checks; do not automate legal conclusions.
3. **New modules first:** where ownership is independently proved, publish new desktop/workstation tooling, profile/schema utilities, integration adapters and SDKs under Apache-2.0 with file-level SPDX identifiers and a correct license text. Document their repository/package and combination boundaries.
4. **Selective inherited-code replacement:** replace tightly coupled frontend/Core/Agent features **only when product-driven** and backed by API/DB/host behavior tests, security gates, and independent implementation provenance. No copy-paste-based or purely cosmetic relicensing.
5. **Release audit:** run license checks on *actual* release archives/images, include all license and attribution materials, and document unresolved GPL scope. Keep distribution GPLv3 until every blocker is resolved or rights-holder permissions exist.
6. **Final license PR:** perform the Apache-only root license change *last*. If full conversion proves impractical, keep the inherited GPL edition and distribute verified independent Apache-2.0 modules separately, without mislabeling the whole product.

## Standing engineering / review rules

- **Never** replace the root GPLv3 `LICENSE` with Apache-2.0 while inherited GPL-covered components remain in the distributed combined work.
- **Never** remove 1Panel copyright notices to satisfy an automated scanner, or equate a branding change with a license change.
- Each proposed Apache-licensed file needs documented ownership, dependency/combination boundary, and reviewer approval before an SPDX Apache-2.0 header is added.
- Third-party dependencies, binaries, fonts and generated assets are individually reviewed; recording a lockfile is not enough for license compliance.
- Any GPL-to-independent replacement preserves original API, stored data and on-host behavior by explicit acceptance and recovery evidence.
- Do not claim ASF affiliation or endorsement: *using the Apache License* is distinct from *being an Apache Software Foundation project*.
- Every stage should provide a reproducible inventory delta and blocking reason; do not advertise an Apache-only GPUPanel while any unknowns remain.

## Next bounded PR

**L1 provenance inventory (read-only):** add a deterministic inventory generator that walks the tracked files, compares against the frozen upstream baseline when available, detects known license headers, and reports `UNKNOWN_BLOCK` rather than guessing. Add fixtures for copied third-party content, modified upstream content, fresh standalone code, and unclassified assets. Review the manifest before granting any Apache-2.0 file status.

This file is a project governance plan, not legal advice or a grant of rights.
