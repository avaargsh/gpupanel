# GPUPanel — adopt the existing durable HostOperations restart path

Baseline: main `2adfbaf2c4c47ba3930126d4c5a758209e2e628f`.

## Why this route instead of a new executor

The existing Container UI sends `POST /containers/operate` and treats its Task API acknowledgement as if the target was restarted. That Agent service creates a background Task and immediately returns; the old route has no operation-specific durable before/after proof.

GPUPanel **already** has an independently protected, durable, local-only `HostOperations` contract:
- Core allows only a valid local super-admin Cookie session, not API keys or remote node;
- Agent stores per-session plan/hash/claim and final receipt in TaskDB with an atomic SQL execution slot;
- `container.restart` requires a full 64-hex Docker ID and a running container, with pre-execution `StartedAt` binding;
- after Docker restart, independent Docker Inspect must observe the **same ID** running with a **different StartedAt** before a receipt can be `verified`;
- timeout or uncertain Docker response records `unknown` and never automatically replays the same operation ID.

See `docs/engineering/host-operations.md`. This patch **adopts** that existing backend; it does not add a parallel control plane.

## User journey

Container list → one **running** local container with a full ID → **Review restart** → Host Operations prefilled with selected kind and target → **Preview operation** → review impact, ID, expiry and binding → **Confirm and execute** → review persistent operation receipts.

Deep links do not send a plan, do not confirm or call Docker. They only preselect form values.

The list's single-row and selected-row `restart` actions no longer invoke the legacy `/containers/operate` API. For remote nodes, malformed IDs and multiple selection, the safe restart entry is disabled instead of falling back to the unsafe route.

## What this slice does **not** do

- No automatic restart, no automatic plan, no action on route entry.
- No batch restart, remote restart, or delegated role grants.
- No generic start/stop/remove operation ID yet; those still use legacy Task operations with the prior per-tab pending hint and manual review. The server-side contract is **not** extended to these mutations.
- `verified` means process restarted per StartedAt; not application readiness, healthy network, or unchanged data.
- No claim of real installed Ubuntu acceptance from Playwright's simulated API. Docker canary runner is separate.
- Session-scoped audit ownership is not a global duplicate lock against other authenticated users/sessions. Further rollout needs cross-client fencing and operational review.

## Regression gates

- Existing HostOperations SQLite/Go tests, Core proxy ownership/authentication, source policy and browser smoke.
- Browser asserts: legacy `/containers/operate` never called by restart UI; deep link preselects full ID without planning or executing; explicit Preview is the first plan request; confirm remains an explicit human action.
- Production acceptance separately requires disposable local running Docker canary with a permitted label and real Core→Agent browser session.
