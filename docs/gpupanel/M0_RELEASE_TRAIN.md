# GPUPanel M0 release train — review and promotion ledger

> Governance snapshot: 2026-10-15; base `dev-v2` at `ef61f42dbe7074351c6617d7a72be29d37684248`.
> **Status: NOT RELEASE READY.** This is a proposed integration plan, not proof that any runtime or VM was exercised.
>
> Source-of-truth acceptance criteria stay in [ROADMAP](ROADMAP.md), [GOLDEN_PATH](GOLDEN_PATH.md), and [AGENTS](../../AGENTS.md). This ledger manages **PR dependencies, ownership, evidence and promotion decisions**, and must not be used to relax those contracts.

## Product and authority boundary

- **P0 user goal:** one Ubuntu 24.04 owner can safely review the host, log in, manage Docker and a local app, inspect uncertain operations, and recover from failure without losing unrelated user state.
- `frontend` owns view state, `core` owns authenticated entry/scope, `agent` owns local side effects and observations. Neither the browser nor an LLM grants host mutation authority.
- External `gpu-compute-platform` (Kueue scheduling) and `agent-control-plane` (controlled operations) remain optional, downstream integrations. No multi-host, K3s, OpenBao, RAG, extra accelerator vendor or autonomous remediation work is required to pass M0.
- Preserve inherited GPL-3.0 notices, copyright and root `LICENSE`. Independently owned Apache-2.0 files have separately audited scope (see [LICENSE_MIGRATION](LICENSE_MIGRATION.md)); a source manifest is not binary/package attribution proof.

## Candidate queue and order

| Order | Candidate | Domain / expected value | Required review before merge |
| --- | --- | --- | --- |
| 1 | [#56](https://github.com/avaargsh/gpupanel/pull/56), [#57](https://github.com/avaargsh/gpupanel/pull/57) | Agent AppInstall uncertain receipt + same-name serialization | Verify distinct task IDs cannot race into duplicate Docker side effects; compare SQLite and process-lock semantics; rerun exact combined head |
| 2 | [#60](https://github.com/avaargsh/gpupanel/pull/60) | Restart interruption becomes UNKNOWN, not fabricated failure | Crash at each side-effect boundary; block start/stop/delete/upgrade on UNKNOWN; no implicit operator bypass |
| 3 | [#61](https://github.com/avaargsh/gpupanel/pull/61) | Read-only TaskDB receipt when AppInstall linkage/log is absent | TaskDB admission status is not Docker outcome; no dangerous retry, no raw error/secrets; verify with #60 combined |
| 4 | [#64](https://github.com/avaargsh/gpupanel/pull/64) | Read-only redacted AppInstall evidence snapshot | `CONSISTENT` means observational agreement only; not readiness, authorship, recovery success or permission to mutate |
| Independent | [#55](https://github.com/avaargsh/gpupanel/pull/55) | Proposed Host-first M0 architecture | Keep ADR status PROPOSED; do not implement Host Fleet until G3–G6 standalone gates are independently accepted |

**Queue semantics:** these PRs are not assumed to be stacked on each other, and their independent green CI results are **not** a combined green release. Maintain their original branches; do not force-push or merge Drafts merely to reduce the count. First calculate patch overlaps and rebase/cherry-pick as appropriate into a reviewed short-lived integration candidate; compare semantic effects, not only file conflicts. Require CI and negative controls at the resulting exact SHA.

## M0 stop-ship ledger

| Gate | State at snapshot | Live exit proof |
| --- | --- | --- |
| G0–G2 | PASS for scoped source diagnostics/preview only | Recheck the actual packaged Core/Agent buildinfo and immutable upstream attribution on release candidate |
| G3 install/rollback | **BLOCKED** | Disposable clean Ubuntu VM; preflight, install, backup, collision denial, interruption and lossless rollback |
| G4 login/Host | **NOT RUN** | Real Core/Agent + browser; authenticated Host/File/Terminal operations and negative authorization |
| G5 Docker/App | **NOT RUN** | Real Docker/Compose; install→observe→stop→restart→uninstall; duplicate IDs, different IDs, lost ACK, crashed Agent, partial container state, unavailable DB |
| G6 recovery | **NOT RUN** | Service restart, disk full, invalid archive, port conflict, interrupted upgrade and verified retained workspaces/data |

Do not convert `NOT RUN` into PASS because unit tests, static checks, source builds or synthesized fixtures passed. An operator-facing `UNKNOWN` needs a **reviewed manual resolution runbook and live evidence**; fail closed meanwhile.

## Minimum evidence record for each gate

- Exact base/head commit SHAs, repo + PR, affected contract, reviewer and evidence timestamp.
- Environment: disposable Ubuntu/CPU/GPU if relevant, Docker/Compose/Go/Node versions; source/package SHA-256.
- Copyable commands and sanitized stdout/stderr; each test annotated `LIVE`, `CI`, `SIMULATED`, `NOT RUN`, `PASS`, `FAIL`, or `BLOCKED`.
- Negative controls: unauthorized caller, overlapping same-name install, retry/replay, stopped daemon, DB unavailability, process loss, stalled install and ambiguous ACK.
- Observed Docker/Host effect and exact operation ownership, or an explicit `UNKNOWN`; no fabricated rollback or success.
- Recovery/rollback playbook; retained evidence artifact digests, protection of secrets and test fixture cleanup.
- Promotion decision `GO` only after G3–G6 and independent review at a single pinned integrated SHA. Otherwise `NO-GO` with a named blocker and smallest corrective step.

## Repository governance / escalation

- Default `dev-v2` was reported unprotected on 2026-10-15. Configure PR-only merge, required Go + frontend + acceptance status checks, no force push, no deletion and no bypass. This requires **GitHub repository administration**; this document does not claim the ruleset was changed.
- Issues are disabled in this repository (GitHub REST returned 410 on 2026-10-15). Use this Draft PR and the existing PR threads as the temporary release ledger; re-enable Issues later if wanted.
- Once the full single-host proof is independently accepted, open a separate M1 work item for read-only second-host inventory, followed by one scoped authorized mutation. Do not fold M1 features into M0.

## Decision at this snapshot

**NO-GO for installable or production-ready release.** Continue source-level feature work in small slices, but do not loosen UNKNOWN, identity or license guards for convenience.
