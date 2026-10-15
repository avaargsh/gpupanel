# Host → Docker → App Store: first-run portal slice

This UI is intentionally part of the existing logged-in dashboard and uses the existing backend API without adding new privileges or modifying Host service state.

- Step 1: navigate to Host monitoring (only if route-authorized).
- Step 2: request actual `/containers/status` for the selected current node. Distinguish checking, API available, API error. A numeric running count is **not** proof that the container lifecycle can create/delete successfully.
- Step 3: open the existing app catalog when the user has `app_view` permission.

No checks are marked complete based on click tracking or a guessed server state. An unauthorized user does not see routes they cannot open. Rechecking after node context changes rejects stale asynchronous responses, but server-side authorization remains authoritative.

Still blocking real install Golden Path: independent binary/data namespace, safe Ubuntu installer with rollback, Web/Core/Agent health, first-admin login, Docker create/start/log/stop/remove E2E under a throwaway test host.
