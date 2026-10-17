# GPUPanel Host / Containers / Apps visual unification — 2026-10-17

Baseline: `main` at `3724a5de2b30dec2057c0321551e9c4291783b61`.

## Why

The mainline ChatGPT-inspired shell already uses neutral colors and quieter navigation. Management routes still vary in title and tab affordances, table cells, toolbar spacing, pills, and portal sheet padding. This patch changes **presentation**, not backend contracts.

## Changes

- `ManagementPageHeader` is a shared, semantic H1 above existing tabs in three modules; top app shell is unchanged.
- `management.css` is scoped to `.management-shell` so legacy management and desktop routes outside Host/Containers/Apps are unaffected.
- Header and tabs: one spacing scale, horizontally scrollable tabs on narrow windows with preserved Radix navigation.
- Tables: quiet headers, consistent density, scrollable inner viewport, keyboard focus affordance. No hidden columns or removed operations.
- Filters: Containers status chips use `aria-pressed` and subdued selected styling; numerical counts stay visible.
- Portaled detail sheets: explicit `.management-detail-sheet` on Container and App details, with consistent width, heading rhythm and readable logs.
- Installed App name/icon gap reduced while preserving original actions and unknown/host-scoped request safeguards.
- Host overview: missing CPU, memory and disk metrics render `--` rather than fabricated 0%, and load is unknown when missing/non-finite. Valid 0 remains 0.

## Contract and validation

- No Go, DB, API, Docker, port, shell command or permissions change.
- No self-claim of enterprise readiness or GPU hardware validation.
- Run frontend build/typecheck/tests, first-run and UI smoke. Browser smoke uses **simulated API**, adds snapshots for `/host?tab=overview`, `/containers`, `/apps?tab=installed`; inspect 1440 and narrow-screen overflow and page focus.
- Confirm preserved tab deep links in Host/Apps, Container bulk state operations, Installed Apps evidence/UNKNOWN handling and assistant behavior.
- Visual screenshots and simulated flows do **not** prove native installed Ubuntu or real GPU acceptance.

## Follow-up after merge

Improve actual object detail ergonomics and table-wide bulk-operation grouping only after screenshot review and existing tests; avoid broad restyling of everything at once.
