# GPUPanel L1: reproducible license provenance inventory

**Legal state remains GPL-3.0.** This tool never licenses or approves any file. See [license migration plan, PR #58](https://github.com/avaargsh/gpupanel/pull/58).

This stage provides a deterministic, *read-only* file-level view of **the tracked Git commit**, not of a compiled release, Go/npm dependencies, downloaded binaries, or actual rights ownership. The baseline is the frozen 1Panel `dev-v2` ancestor `d9dc5d7aa981c3b04ad284e93420aca9888f7e5a`, and the scanned revision defaults to `HEAD`. CI checks out complete history; no implicit network fetch or stale-tree fallback occurs.

## Run (Python standard library + Git)

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_license_audit.py' -v
python3 scripts/gpupanel-license-audit.py --verify-gpl --output license-inventory.json
```

By default JSON is emitted to stdout. With `--output`, only the designated JSON report path is written; the source working tree, index, branches and Git history are not changed. Missing or unrelated baseline fails closed: fetch the trusted upstream baseline as part of a reviewed checkout rather than weakening the check. `--verify-gpl` verifies that the root `LICENSE` Git blob still matches the baseline and that `NOTICE.md` retains basic 1Panel/GPL-3.0 attribution. It is **not** a full license-text or copyright review.

## Interpret the report conservatively

| Origin | What is actually proven | Review label |
| --- | --- | --- |
| `INHERITED_UNCHANGED` | same file path and Git tree entry at upstream baseline | `KEEP_GPL` |
| `INHERITED_MODIFIED` | same path, changed file blob/mode/type | `KEEP_GPL` |
| `EXACT_UPSTREAM_BLOB` | added path whose content SHA equals an upstream tracked blob | `KEEP_GPL` |
| `NEW_PATH_UNVERIFIED` | path not at upstream, without exact blob match | `UNKNOWN_BLOCK` |
| `SUBMODULE_REVIEW` | external submodule commit; license not checked | `UNKNOWN_BLOCK` |

A new path, an `SPDX-License-Identifier` header, a GPUPanel author name, or a different hash does **not** demonstrate independent rights or permission to relicense. The header scanner reads at most the first 16 KiB of regular UTF-8 files up to 256 KiB. `HEADER_ONLY`, `OVERSIZE`, `BINARY`, `NON_REGULAR` and `NON_UTF8` are visibility states, not license decisions.

Subsequent manual L1 work must investigate copyright holders, copied/adapted code beyond exact-blob matches, generated files, fonts/logos, npm/Go packages and files in actual release images/archives. Document explicit approvals and license obligations before any Apache-2.0 file-level changes. Do **not** assume a separate service/binary makes a GPL derivative legally Apache-only.

This CI deliberately does **not** fail because new files are unknown; that would block legitimate product development. It fails when the baseline cannot be checked, attribution guard fails, or the audit tests fail. The JSON report is a **review input**, not SPDX/SBOM certification.
