# GPUPanel operations UI polish — 2026-10-17

Baseline: `main` `6323c796e6a20dcd2a2342796c6ceb136bb74461`.

## User workflows

1. **Containers selection**: status filters and sorting stay in the neutral search toolbar; active visible-page selection creates a separate contextual action toolbar, clearly separating start/stop/restart from destructive remove. The count reflects actionable current-page names, not hidden selections from a different page.
2. **App installation**: preserved unknown-outcome / single-flight / receipt semantics. A receipt has distinct Task ID (copyable), Host, App, read-only observation, refresh and bounded evidence. A successful HTTP admission is **not** presented as installed.
3. **Terminal**: preserve the existing real WebSocket Shell and current Host scope; improve status affordance and toolbar spacing, not invent AI execution or proactive command injection.

## Scope

- CSS is scoped under `.management-shell` for operations and terminal. Receipt presentation is inside the already-scoped App Install modal.
- No backend, RBAC, container lifecycle, agent tool execution, task-ID semantics, retry policy or database migrations.
- The assistant remains a draft-only panel until a real authorized provider is available. The user should not see a fake 'AI execute' action in Terminal.

## QA gates

- GitHub full checks on current head, including frontend typecheck/build/test and simulated Chromium.
- Review `container-list-actions.png` and `host-terminal-status.png` plus existing management snapshots at desktop and narrow widths.
- Verify selection toolbar appears only for selected actionable records (this script currently asserts absence when no row is selected). Additional live selection testing is required with real container data before operator rollout.
- Host scope, install single-flight and manual reconciliation remain existing safety contracts. No claims of real installed Ubuntu/GPU acceptance from fixtures.
