# GPUPanel vNext — Visual hierarchy audit & polish

> 2026-10-16. Code-level visual review of the unmerged vNext shell PR #92; historical candidate, not a
> production visual acceptance. Base: `19a4d5bca4199012d8aa43e10425a9f1c3b689d0`.
> Design references: [Linear UI refresh](https://linear.app/changelog/2026-03-12-ui-refresh),
> [Vercel Geist typography](https://vercel.com/geist/typography),
> [shadcn/ui tokens](https://ui.shadcn.com/docs/theming).
> Goal: **developer workbench first, Linux management always reachable** — not chatbot-first or GPU marketing.

## Code-evidenced issues before this patch

| Severity | Location | Before | After |
| --- | --- | --- | --- |
| P0 | `layout/workspace.css` | 88px brand block vs 56px header visually misaligns the shell | 56px brand/header baseline |
| P0 | `pages/workbench.css` | 28px between all sections; 3px blue hero top border; three bordered primary tiles | 20px section rhythm, flatter hero, 2 subdued primary tiles + inline unavailable-project note |
| P0 | `components/FirstRun.tsx` | Full-sized `Card`, `Banner`, seven redundant nav links below the dashboard | Small observed-Docker status strip with links to Host and Containers |
| P1 | `components/StatCard.tsx` | Home shares default 26px metric treatment with dense management contexts | Explicit `compact` variant **only** on home; other consumers unchanged |
| P1 | `layout/Sidebar.tsx` | Repeated 'Developer workspace' / 'vNext Development' chrome competes with navigation | Concise product mark, no duplicated development label |
| P1 | `pages/HomePage.tsx` | Real system observations appear after unavailable-project and tool panels | Observed GPU/CPU/memory/disk summary moves immediately after quick actions |

## Behavioral contract preserved

- No fake Project/Workspace/Session records, no enabled project create action, no fabricated GPU metrics.
- Keep `/host?tab=terminal`, `/apps`, `/logs?tab=task`, `/gpu` and existing navigation.
- Dashboard values retain existing error/unknown semantics. No backend/API or persistent data change.
- Keep 240/64px sidebar, 56px header, light/dark themes, assistant privacy/draft behavior, accessible tab/keyboard flows.
- Docker status shows observations only; its badge never implies completed installation or workstation readiness.

## Essential commands (visual QA gate before merge)

1. `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm build && pnpm test`
2. `python3 scripts/browser/run-react-tests.py` (per `docs/engineering/testing.md`), then human-review
   before/after snapshots at 1440/1280/1024/640 in zh+en, light+dark — and check visible text
   'Workbench', disabled 'New project', unknown CPU on failed refresh, terminal/tasks/installed deep links,
   DOM focus, keyboard search, modal focus containment, host scope resets, reduced-motion, no horizontal overflow.
3. Separate **live Ubuntu** installation and actual host/Docker/GPU observations before any production claim.

## Known gaps

- Scoped **visual-polish candidate**, not a full rebrand, design system, or pixel-level evaluation;
  PR #92's own screenshots are uninspected by a human here. Do not merge on code review alone.
- Recommended later work: unify `tokens.ts` with shadcn theme variables; reusable PageHeader/SectionHeader/
  MetricCard primitives after a visual baseline; density scale for legacy pages without broad selectors.
- Hide unavailable Project/Environment sidebar entries until their backend lifecycle API exists; keep the
  disabled New Project affordance; localize stale `home.noData` as explicit observation failure.
- Add scoped browser layout check and `.github/workflows/gpupanel-vnext-visual-smoke.yml`; artifact
  screenshots use **mocked API**, never live Ubuntu or real GPU telemetry (evidence:
  [vNext 历史结果](../evidence/2026-10-16/vnext-shell/RESULTS.md)).
- Gate PR promotion on completed browser workflow + artifact review; typecheck/build ≠ visual acceptance.
