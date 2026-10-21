# ADR-0002: Local-first Native Agent Sessions and optional Mobile Relay

- Status: **PROPOSED** (documentation only; not an implementation approval)
- Date: 2026-10-20
- Product issue: [#164](https://github.com/avaargsh/gpupanel/issues/164)
- Existing mobile/Relay experiment: [wechat-ahp-client #16](https://github.com/avaargsh/wechat-ahp-client/issues/16)
- Current release truth: [docs/STATUS.md](../STATUS.md)
- Earlier product decision: [ADR-0001](ADR-0001-FORK-FIRST.md)

## 1. User outcome and decision

A developer starts an existing native Coding Agent session on Ubuntu, leaves the
desk, checks/approves it on a phone, and returns to **the same native session**
on the desktop. Neither the phone nor the Relay becomes a second source of
truth for Agent state. The optional mobile path must never break GPUPanel
Host/Files/Terminal/Project/Workspace when disabled or disconnected.

**Decision**: Keep GPUPanel as the local-first product and Host owner. Reuse
the independent `wechat-ahp-client` Relay/Connector as an experiment until a
second materially different runtime proves a shared Relay protocol is needed.
Do not create a new repository, fork Agenvo, embed an alternative agent loop,
or add a required Kubernetes/ACP/Relay dependency now.

## 2. Observed baseline and explicit nonclaims

GPUPanel currently has Core and Agent processes with authenticated Core API
and private Agent socket. Its Project/Workspace registry is *metadata only*:
`Registered` / `NotProvisioned` do not imply a running workspace or an
attachable native Coding Agent session. Existing Project source hints are not
independently validated OS paths. A proposed Session UI must not display such
entries as real running processes.

`wechat-ahp-client` already has a TypeScript thin Relay, VS Code AHP
Connector, machine-scoped pairing, WeChat attention UI, and a version-checked
approval path. It is **not** a general Codex/Claude/OpenCode multi-runtime
gateway today. Its real WeChat device + live VS Code Agent Host acceptance is
still NOT RUN. Agenvo and CC Pocket inform design and experiments but are not
adopted production dependencies.

GPUPanel G3–G6 single-version installation/auth/operations/recovery remains
**PARTIAL / NO-GO**; this ADR does not change release gates.

## 3. Ownership and dependency direction

| Domain | Owner | What must remain true |
| --- | --- | --- |
| Ubuntu project files, PTY, OS principal, native process | `agent/` / OS user | No root-by-default or inferred user identity |
| Authenticated user/project view and receipts | `core/` | Session/CSRF and explicit resource ownership checks |
| Desktop/Web UI | `frontend/` | Honest loading/empty/offline/unknown states |
| Native thread/turn and pending permissions | Actual native Runtime (Codex/AHP/OpenCode/etc.) | Its IDs, statuses and authority cannot be fabricated |
| Phone attention and device presentation | Existing mobile app | No server-side execution authority |
| Optional route, pairing and notification | Existing external Relay | No source-code, workspace, SSH-key or agent-credential storage |
| Independent policy/evidence verification (later) | `agent-control-plane` | Optional integration, never local Host critical path |

No new `AgentOS`, universal Thread/Turn database, persistent long-task
orchestrator, or remote shell endpoint is justified by this first user path.
Wails v3 is an optional future desktop wrapper, not a prerequisite for the
existing React/Go Web product.

### Interaction sketch

```text
GPUPanel Desktop/Web ──authenticated local Core── Agent / OS user
                                                       │
                                               Native Coding Runtime
                                                       │
Mobile H5/WeChat ── HTTPS ── Optional Relay ── outbound Connector
                                      (routing only)
```

For the initial experiment the VS Code AHP Host remains the only supported
native approval authority. Integration with GPUPanel is **not** an implicit
privilege escalation from the Core superadmin cookie into another Linux UID.

## 4. Minimal local-only read model (design target, not API commitment)

First read-only slice must observe one actually running Codex or AHP session
under an explicitly bound unprivileged OS user:

- `hostId`, `runtimeKind`, native `sessionId`, and observed timestamp;
- native reported state and separately measured connection health;
- verified OS-user ownership and verified project/workspace association, if any;
- explicit `unknown` / `offline` / `unsupported` rather than guessed progress;
- no copied prompt histories or command text in Relay projections.

Do **not** mint a GPUPanel Thread ID that masquerades as a native session ID.
Project-to-Session linkage is absent until a verified native OS/workspace
principal binding exists. When no verified principal is available, discovery
must refuse rather than scanning other users' home directories.

Only after this read model is independently verified may an optional mobile
`Attention` projection be attached. For approval, native Host state must be
re-fetched immediately before dispatch. A Relay ACK or HTTP 2xx does not prove
the command completed or the desired outcome was reached.

## 5. Security contract for future writes

Remote mutation is **deferred** until an explicit owner-scoped Host identity
and bounded capability are demonstrably enforced.

1. Authenticate the specific user and paired device; authorize the exact
   native session and operation, never the device alone.
2. Bind each approval to native request ID, expected version/nonce, action,
   session owner and short expiry; reject stale, wrong-device and cross-owner.
3. Preserve only `Allow Once` / `Reject` for the first approval flow.
   No auto-approve, blanket full-access agent launch or implicit sudo.
4. Fail closed when the Connector or authoritative Host is unreachable.
   Do not queue offline approvals for future execution.
5. Lost ACK / timeout after dispatch is **UNKNOWN**. Independently re-observe
   native state; never replay a potentially executed write automatically.
6. A revoked device token must be rejected on future requests; an already
   in-flight native action requires independent outcome reconciliation.
7. Relay secrets, pairing codes, native credentials, repository contents and
   full commands must never appear in push notifications, browser URLs, logs
   or retained evidence bundles.
8. TLS protects the transport hop but is not by itself end-to-end encryption
   against a Relay operator. Establish separate E2EE and key rotation design
   before making untrusted or hosted-Relay privacy claims.

If use of a native Coding Runtime demands broader execution privileges than
these invariants allow, report `unsupported` and stop integration. Do not
silently adopt unsafe upstream defaults.

## 6. State, recovery and acceptance

The mobile connection and native execution have distinct lifecycles.
Disconnecting Relay or phone MUST NOT imply native cancellation. A stopped
native process MUST NOT be reported as successful merely because its
Connector responded. Read-only state reconstruction is allowed after restart;
writes remain protected by version and idempotency fences.

| Stage | Minimum independent evidence | Not proven by |
| --- | --- | --- |
| M0: current local product | Same candidate Ubuntu VM G3–G6 | Old SHA CI or cross-VM results |
| M1: native read-only discovery | Real unprivileged native session; 401/403/wrong owner/offline negatives | Mock list or Project metadata |
| M2: mobile session projection | Same native session ID on desktop and phone after reconnect | Static mobile fixture |
| M3: live approval | Real phone + Host ACK; reject/stale/duplicate/ACK-loss negatives | Relay HTTP accepted |
| M4: post-approval observation | Native continue/stop result, test output, recovery from disconnect | Desired state or notification sent |

Real device observations must be anchored to exact tested commits and state
which portions are NOT RUN. Do not combine unrelated commits' passing
evidence into a release claim.

## 7. Reuse and repository split criterion

Follow **Adopt → Integrate → Contribute → Build**. Evaluate the actual
`wechat-ahp-client/services/relay`, Agenvo, and CC Pocket with a small
compatibility/gap matrix; no service replacement decision before measurement.

Consider a separately versioned `gpupanel-relay` repository **only if** two
independent native runtime adapters, distinct deployment/upgrade needs, and
stable device identity/revocation/security contracts justify it. Before
copying source between repositories, inventory licenses and GPL-3.0 derivative
boundaries; API integration does not itself require shared source or a new
license claim.

## 8. Next vertical slices

1. Complete real device approval tests in `wechat-ahp-client` (Issue #16).
2. Implement read-only native Session discovery locally with a verified OS
   principal and refusal path; avoid expanding GPUPanel installer scope.
3. Add optional Desktop/Web native Session views, showing actual observed
   status and unavailability.
4. Prove remote read-only projection via the existing Relay; only then review
   write-authority design.
5. Preserve all GPUPanel Host/Terminal/Project operations when Connector,
   Relay or mobile UI is disabled.

**Review trigger**: revisit this ADR after the second runtime genuinely works
or after the first full real-phone + real-Host Golden Path is observed.
