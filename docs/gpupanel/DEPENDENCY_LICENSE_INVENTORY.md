# L1.1 — third-party dependency review (Go and current pnpm / historical npm)

This audit supplements [file-level Git provenance](LICENSE_INVENTORY.md) and the [Apache migration plan (PR #58)](https://github.com/avaargsh/gpupanel/pull/58). **The GPUPanel distribution remains GPL-3.0.** No metadata field, dependency name, or tool output constitutes permission to relicense a file or distribute an Apache-only GPUPanel release.

## Run without network or dependency installation

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_dependency_audit.py' -v
python3 scripts/gpupanel-dependency-audit.py --output dependency-license-inventory.json
```

The read-only script parses. **The current `main` uses React 19 + a pnpm v9 lock, not the historical Vue/npm tree.**

- **Current:** `frontend/pnpm-lock.yaml` + workspace package manifests, parsed by `scripts/gpupanel-pnpm-inventory.py`. Importer specifiers are checked against workspace manifests. pnpm lock metadata does not carry conclusive license texts: all installed-package evidence must be obtained separately.
- **Historical-only fixture fallback:** `frontend/package.json` with npm v3 `frontend/package-lock.json`, for previous baselines and synthetic tests. That is **not the present product dependency graph**.
- **New L1.2:** after `pnpm install --frozen-lockfile` on an isolated CI runner, `scripts/gpupanel-pnpm-license-evidence.py` records hashes of installed package LICENSE/COPYING/NOTICE files, license metadata hints and unavailable/optional/conflicting entries. This remains human-review input; details in [current Apache dependency gaps](APACHE_DEPENDENCY_GAPS_2026-10-16.md).
- `core/go.mod` and `agent/go.mod`. It lists their direct and indirect `require` declarations and all `replace` directives. A `replace` targeting another module is explicitly `FORK_REPLACEMENT_REVIEW`; a local path is `LOCAL_REPLACEMENT_REVIEW`. Neither is an automatic license violation nor an Apache grant.
- SHA-256 of those four manifests and basic counts; records are sorted for deterministic diffs.

This is a **manifest inventory, not a runtime dependency graph or complete SBOM**. The original manifest-only tool does not retrieve a dependency's actual license file, account for build tags, transitive packages absent from `go.mod`, generated code, Docker bases, Python distributions, JavaScript assets, source archives, fonts or release binaries. No network downloads, package installs, `go list`, `npm install` or privileged operations are performed.

The CI job generates a JSON artifact for manual review. Missing license hints do not fail CI; malformed manifests and lock drift fail closed. Every dependency entry remains `THIRD_PARTY_REVIEW`, even when the lockfile carries an apparently permissive license expression. Validate against the real distributed artifact in a later milestone (L4).

## Next human review order

1. **High-risk origin:** inherited 1Panel Core/Agent/frontend sources and any 1Panel-forked Go replacement. Confirm real source license/copyright and distribution obligations.
2. **Integrated dependencies:** compare npm lock/Go manifests against actual release contents; confirm licenses from installed package sources, upstream repositories and notices.
3. **Owned independent candidates:** triage `catalog/`, `profiles/`, `scripts/`, new desktop tooling and external adapters per file. Git-added path or author credit alone is insufficient; document rights-holder clearance and any copied snippets.
4. **Artifact-level proof:** attach per-release SBOM/attribution verification, exact versions, source URLs and any reviewed exceptions. Apache-only root switch remains blocked pending comprehensive review.

For the historical Git file-provenance CI snapshot created with #59's merge candidate: **1,989 files** comprised 1,830 unchanged upstream, 36 modified upstream and 123 new-path unverified entries. Those numbers are tied to the exact audited Git revision, **not** an independently verified number of Apache-eligible files.

## Review/rollback

No source code, production host data, runtime service, API, database schema, current GPL `LICENSE` or `NOTICE.md` are changed. Revert the auditing PR to remove the inventory. Keep the current GPL attribution intact until all applicable owners permit a different distribution and the full release has passed L4–L5.
