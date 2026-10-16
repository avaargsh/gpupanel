# GPUPanel's first file-scoped Apache-2.0 components (L2 pilot)

**This is a strictly limited exception to the GPL-3.0 fork distribution—not a conversion of 1Panel or the complete GPUPanel release.** Original `LICENSE` stays GPL-3.0 and all upstream 1Panel notices and attribution remain in `NOTICE.md`.

## Specifically Apache-2.0 files

The following six standalone Python scripts/tests are licensed under Apache-2.0 at the **file level**, with matching SPDX headers and the full terms in `LICENSES/Apache-2.0.txt`:

1. `scripts/gpupanel-license-audit.py`
2. `scripts/tests/test_gpupanel_license_audit.py`
3. `scripts/gpupanel-dependency-audit.py`
4. `scripts/tests/test_gpupanel_dependency_audit.py`
5. `scripts/gpupanel-pnpm-license-evidence.py`
6. `scripts/tests/test_gpupanel_pnpm_license_evidence.py`

All other files retain their existing terms unless separately and explicitly reviewed and marked; this document is **not** a blanket grant for `scripts/`, `docs/`, `frontend/`, `core/`, `agent/`, brand assets, or dependencies. In particular, all inherited GPL-3.0 1Panel files and modifications remain governed by their applicable upstream terms.

## Evidence for this narrow change

| Question | Evidence and limitations |
| --- | --- |
| Were these four files present in 1Panel baseline? | No. The L1 source provenance tool marks the first audit pair as added; the dependency audit pair was subsequently introduced in #62; the installed-pnpm evidence pair was introduced in [#96](https://github.com/avaargsh/gpupanel/pull/96). This fact alone does **not** prove original authorship. |
| Where were they authored? | Independently developed as standalone review tooling during GPUPanel's Apache transition, introduced in [#59](https://github.com/avaargsh/gpupanel/pull/59), [#62](https://github.com/avaargsh/gpupanel/pull/62), and [#96](https://github.com/avaargsh/gpupanel/pull/96), with GPUPanel owner requesting Apache-2.0 migration and continued development. |
| Did they copy GPL-covered implementation? | Source review: they use Python standard-library Git subprocess/JSON/digest utilities and synthetic fixtures, without importing or embedding 1Panel Core, Agent or frontend code. This is a bounded technical/source review, **not a comprehensive copyright opinion**. |
| Is this code distributed as a separate Apache-only GPUPanel product? | No. These files may be independently reused under their file-level Apache-2.0 terms, but the inherited 1Panel-based fork/combined GPUPanel distribution remains GPL-3.0. |
| What proof still remains? | Subsequent outside contributions to these files require per-contribution permissions; future packaging/attribution and any work derived from GPL code must be reviewed separately. |

## Boundaries for future changes

- Do not convert neighboring `scripts/` files by directory, presumed authorship or historical `git added` status.
- Do not copy/adapt GPL 1Panel implementation into these files without reassessing their licensing and the combined work.
- Preserve the 1Panel fork's GPL-3.0 and attribution obligations. A separately Apache-licensed file can still be distributed within a GPL-3.0 aggregate; license compatibility does **not** reverse the derivative-work relationship.
- Do not claim that GPUPanel is an Apache Software Foundation project or endorsed by the ASF.
- Any added file-level Apache scope requires recorded review evidence, explicit owner permission, an updated test scope and a focused PR.
- Root `LICENSE` may become Apache-2.0 only after the entire distributed work is properly cleared or reimplemented through an independently lawful process.

## CI check

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_apache_scope.py' -v
```

The test pins the four scoped files and verifies their explicit SPDX headers, bundled Apache terms, and continued GPL/1Panel attribution. It does **not** make a legal determination or supersede L1 provenance, dependency review or release artifact scanning.
