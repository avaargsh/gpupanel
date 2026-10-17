# GPUPanel UI visual language — quiet developer console (2026-10-17)

## Intent

Borrow interaction **principles** from ChatGPT (calm canvas, low-chrome navigation, readable information hierarchy, conversational assistant composition), not its identity, wording, logos, icons, or proprietary assets. GPUPanel retains its own blue action color and focuses on Ubuntu GPU development + Linux management.

This is a CSS and component-layout pass, **not** an Agent/Model/Workspace backend rollout.

## Design decisions

| Layer | vNext after polish | New direction | Why |
| --- | --- | --- | --- |
| Canvas | gray light background / blue-black dark background | white / neutral-charcoal content canvas | infrastructure values deserve attention, not the background |
| Sidebar | solid white/card dark, strong selected rail | subtle gray, soft pill active state | chrome should be quiet, route hierarchy still obvious |
| Top bar | competing node scope actions | transparent search affordance + read-only scope | no fake click interaction or implied readiness |
| Workbench launch | one big boxed hero | three equal low-chroma action tiles | accessible Terminal, Apps and GPU remain discoverable |
| Resource observations | four bordered child cards | four values inside one outlined summary | reduce stacked container outlines without hiding unknown data |
| AI assistant | document-like large vertical textarea | conversational space and bottom-pinned draft composer | familiar input pattern while honestly non-connected |

## Visual tokens (shadcn + Tailwind, no second CSS framework)

- Light: content `#fff`, sidebar `#f8f8f8`, text `#1d1d1f`, muted `#68686c`, hairline `#e7e7e9`.
- Dark: content `#171717`, sidebar `#202020`, card `#212121`, text `#f3f3f3`, hairline `#383838`.
- Branded primary: `#306fe6` on light and `#92b5ff` on dark. Color never substitutes for observed-state text.
- Type: semantic hierarchy, clear contrast; controls and focus rings stay keyboard accessible. Do not introduce unlicensed fonts or copy brand assets.
- Use existing tokens and shared components; keep module-level styles scoped.

## Behavior and trust boundary

- No autonomous tool execution, unsolicited logs, credentials, or data upload from the draft assistant.
- Button keeps **Copy question**, not **Send**, until an authenticated provider and consent exist.
- Current node/status display is read-only, not a no-op pseudo-button or a green health claim.
- Preserve dashboard unknown/error semantics, routes, Host/Containers/App tooling, keyboard palette, sheet focus/Escape, scope isolation, and project registration's unknown-result handling.
- New styles do not change the Go backend, installed Docker, host networking or persistent data.

## Acceptance

1. Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, `pnpm test` in `frontend`.
2. Run `python3 scripts/browser/run-react-tests.py` with simulated API and Chromium, reviewing UI snapshots at 1440/1280/1024/640 (light/dark + zh/en). Script tests header alignment, primary navigation, real/unknown metrics and assistant keyboard focus.
3. Inspect the attached CI screenshot artifacts for actual text clipping, contrast, scrolling and assistant composer overlap. **Automated assertions do not amount to an aesthetic approval.**
4. Separately validate on installed Ubuntu with actual GPU/containers and record exact version/commit; **do not mislabel simulated snapshots as production GPU evidence**.

## Next slice

Unify Host, Containers, Apps table and drawer primitives using the same spacing and hierarchy *after* the new shell is reviewed. Do not sweep through all management pages in this PR, and do not add decorative animations or gradient-heavy cards.
