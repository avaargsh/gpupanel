## User workflow and expected outcome
<!-- What is the smallest independently observable user win? Include actor/resource and failing states. -->

## Architecture and change boundaries
- Base ref + exact head SHA:
- Domain/module owner, data flow and conversion boundaries:
- Changed internal APIs vs stable external /api/*, stored schema or host contracts:
- Why this implementation is the smallest real use-case solution (or reason for a new shared abstraction):
- Upstream 1Panel reuse/deletion, GPL attribution and any related ADR:

## Security, isolation and failure model
- Authentication + user/project/tenant resource scope; negative authorization test:
- Untrusted input + secrets/redaction:
- Mutations: operation ID, idempotency, CAS/race handling, deadlines/retries, rollback/recovery:
- Observation: how the actual outcome differs from an accepted request or Desired-state receipt:

## Evidence for the exact change
- [ ] Focused tests completed with command, result, and tested head SHA
- [ ] Frontend: loading/empty/error/retry/stale-response states and keyboard/a11y verified, or N/A
- [ ] Frontend: `npm run type-check` and `npm run build:pro`, or N/A
- [ ] Go/Python test suites for affected modules, or N/A
- [ ] Database: forward migration, bounded data backfill, rollback and conflict cases, or N/A
- [ ] Actual runtime/browser/API/VM smoke completed, or explicitly NOT RUN with reason
- [ ] Permissions, cancellation and fail-closed behavior covered
- [ ] No secrets or identifying user data in code/logs/evidence
- [ ] GPL notices and upstream attribution preserved
- [ ] Source file 500-line rule checked for newly added files; existing oversized-file debt explained

## Compatibility and release / rollback
- External contract and persisted user data compatibility:
- Recover/rollback procedure and proof:
- Explicitly unverified production readiness gates:

## Limitations and debt retirement
<!-- Link an issue/ADR for deferred work; give the condition for deleting temporary code. -->
