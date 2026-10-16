# GPUPanel vNext — Visual hierarchy audit & polish

> 2026-10-16. Code-level visual review of the unmerged vNext shell PR #92, not an assertion of a production visual acceptance. Base: `19a4d5bca4199012d8aa43e10425a9f1c3b689d0`.

## References & product goal

- [Linear UI refresh (2026-03-12)](https://linear.app/changelog/2026-03-12-ui-refresh): consistent headers/navigation, calmer sidebar emphasis and icon alignment.
- [Vercel Geist typography](https://vercel.com/geist/typography): small, purpose-specific type hierarchy for dashboard surfaces.
- [shadcn/ui tokens](https://ui.shadcn.com/docs/theming): component framework migrated from Semi Design to shadcn/ui + Tailwind; semantic theme abstraction retained via `theme/globals.css` and `html.dark`.
- Goal: **developer workbench first, Linux management always reachable**; not a chatbot-first or GPU readiness marketing landing page.

## Code-evidenced issues before this patch

| Severity | Location | Before | After |
| --- | --- | --- | --- |
| P0 | `layout/workspace.css` | 88px brand block vs 56px header visually misaligns the shell | 56px brand/header baseline |
| P0 | `pages/workbench.css` | 28px between all sections; 3px blue hero top border; three bordered primary tiles | 20px section rhythm, flatter hero, 2 subdued primary tiles + inline unavailable-project note |
| P0 | `components/FirstRun.tsx` | Additional full-sized `Card`, `Banner`, and seven redundant nav links below the dashboard | Small observed-Docker status strip with links to Host and Containers |
| P1 | `components/StatCard.tsx` | Home shares default 26px metric treatment with dense management contexts | Explicit `compact` variant **only** on home; other consumers unchanged |
| P1 | `layout/Sidebar.tsx` | Repeated 'Developer workspace' and 'vNext Development' chrome competes with navigation | Concise product mark, no duplicated development label |
| P1 | `pages/HomePage.tsx` | Real system observations appear after unavailable-project and tool panels | Observed GPU/CPU/memory/disk summary moves immediately after quick actions |

## Behavioral contract preserved

- No fake Project/Workspace/Session records, no enabled project create action, and no fabricated GPU metrics.
- Keep `/host?tab=terminal`, `/apps`, `/logs?tab=task`, `/gpu` and existing navigation.
- Dashboard values retain existing error/unknown semantics. No new backend/API or persistent data change.
- Keep 240/64px sidebar widths, 56px header height, light/dark themes, assistant privacy/draft behavior, and accessible tab/keyboard flows.
- Docker status shows only observations; its badge never implies a completed installation or workstation readiness proof.

## Visual QA gate — required before merge

1. Compare before/after at **1440×900**, **1280×800**, **1024×768**, **640×900** in Chinese and English, light and dark. Visual snapshots should be reviewed by a human, especially top baseline, edge alignment, hierarchy, and clipping.
2. Run `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm build && pnpm test`.
3. Run the existing simulated browser coverage with `python3 scripts/browser/run-react-tests.py` per `docs/engineering/testing.md` and ensure all vNext checks still pass.
4. Assert exact visible text 'Workbench', disabled 'New project', unknown CPU on failed refresh, and deep links for terminal/tasks/installed applications.
5. Check DOM focus, keyboard search, modal assistant focus containment, host scope resets, reduced-motion, and no horizontal body overflow.
6. Conduct separate **live Ubuntu** installation and actual host/Docker/GPU observations before claiming production acceptance.

## Limits and follow-up

This patch is a scoped **visual-polish candidate**, not a full rebrand, new design system, new backend, or complete pixel-level evaluation. Parent PR #92's committed screenshot assets were subsequently inspected (light/dark/zh/1024/640/assistant). They show that unavailable project/environment actions and redundant blue navigation links compete with the primary workspace actions, especially at 1024/640 widths. **New screenshots for this candidate are not yet visually reviewed;** the workflow below publishes simulated snapshots for comparison. Do not merge based solely on this code review.

Recommended later work: unify `tokens.ts` with shadcn theme variables, create reusable PageHeader/SectionHeader/MetricCard primitives after a visual baseline passes, and gradually bring legacy management pages into the same density scale without broad selectors or unsupported redesign claims.

## Follow-up visual pass

- Hide unavailable Project/Environment **sidebar** entries until their backend lifecycle API exists; keep the disabled New Project affordance on Home and do not invent records.
- Reduce empty-project icon/card prominence and secondary tool-link saturation; leave actionable Terminal and Apps as primary home links.
- Change stale `home.noData` localization from 'showing sample data' to an explicit observation failure, aligned with the no-fabrication contract.
- Add a scoped browser layout check and `.github/workflows/gpupanel-vnext-visual-smoke.yml`; its artifact screenshots use **mocked API**, not live Ubuntu or real GPU telemetry.
- Gate PR promotion on completed browser workflow and artifact review; do not equate typecheck/build with visual acceptance.
