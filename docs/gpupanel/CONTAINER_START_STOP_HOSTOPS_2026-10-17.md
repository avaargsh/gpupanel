# GPUPanel — local container start/stop through HostOperations

Baseline: `main` at `0526a4b658444c2db493c9facc8afbbeace9daf0`.

## Adopt, not rebuild
Reuse the existing protected Core → private Agent HostOperations routes, owner/session-bound TaskDB receipts, atomic SQL claim, preview hash, explicit confirmation, one running operation slot, and unknown-on-timeout semantics. No new daemon, table, runner or command execution channel.

## Narrow product contract
- **Single local container** with a **full 64-hex Docker ID**; remote/batch and invalid IDs cannot fall back to the legacy Task ACK path from the Container list.
- `container.start`: only `created` or `exited`; `container.stop`: only actively `running`; deny paused/restarting/auto-remove.
- Preview binds Docker ID, status, running/paused/restarting flags, process PID, start and finish timestamps, auto-remove configuration. Hash binds exact expectation and operator identity.
- Confirm CAS-claims an operation once, then re-Inspect before Docker mutation. If the container or process changed, refuse without sending mutation.
- After Docker API returns, inspect **again**. Start requires running with a changed nonempty StartedAt; stop requires exited with a changed nonempty FinishedAt. Return `verified` only after that **independent target observation**.
- Docker operation error, missing observation or deadline produces **unknown**, no automatic replay, even if Docker may have performed the action. Read the durable per-session receipt rather than retry blindly.
- **Observation is not proof that this particular caller caused the state change**, nor application readiness. A separate operation ownership attestation is future work.

## Security and compatibility
The unchanged Core gate requires a current local super-admin Cookie session, rejects API keys, remote host scope, and spoofed identity. No CLI/shell payload or remote Docker context is used; fixed `unix:///var/run/docker.sock`. No changes to delete/rename/prune, service Task schema, or application installation.

## Gates
Go unit tests simulate Docker HTTP daemon for preview denial, changed preconditions, mutation error/lost ACK, unobservable outcome, unchanged status until timeout, independent verified inspect. Existing HostOperations concurrency/replay/sql migration and Core auth tests remain required. Browser flow verifies navigation is inert, Preview is first plan request, and no legacy `/containers/operate` request for list start/stop/restart. CI smoke is simulated; real isolated canary and installed Ubuntu acceptance are separate, not implied by green build.
