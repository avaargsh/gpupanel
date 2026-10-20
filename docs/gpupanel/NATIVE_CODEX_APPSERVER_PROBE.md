# Same-user Codex app-server probe (one-shot, DB-only)

- Date: 2026-10-20
- Parent: [GPUPanel #164](https://github.com/avaargsh/gpupanel/issues/164)
- Depends on: [local Agent Sessions preview PR #166](https://github.com/avaargsh/gpupanel/pull/166)
- State: **experimental native RPC snapshot; NOT a real-time connected Host or mobile Agent session**
- Upstream protocol: [openai/codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)

## Product outcome and operator steps

The real non-root Ubuntu developer (the same login account that operates Codex)
may manually interrogate **a newly started app-server process** using only
its initial handshake and a DB-limited `thread/list` RPC, then view a
sanitized one-page snapshot in GPUPanel's existing browser-only import UI:

```bash
cd /path/to/gpupanel
python3 scripts/gpupanel-codex-appserver.py list > codex-appserver.json
```

Open GPUPanel `/agent-sessions`, choose the **local** node and select the
exported JSON using the file picker. The browser does not upload the file,
autostart a second process, or call the privileged Core/Agent on behalf of
this snapshot. Refresh, change the node or clear the import to remove the view.

If Codex is missing, a required state DB is unavailable or the native version
doesn't support `useStateDbOnly`, the tool fails closed with no JSON export.
The tool must not fall back to filesystem repair, `thread/resume`, privileged
user impersonation or a broad `/home/*` scan.

**This tool launches the user's Codex executable.** Even though it sends only
non-mutating RPC methods, app-server startup may initialize configuration,
caches or telemetry. This is **not** an OS-enforced read-only process or
a guarantee of zero filesystem/network side effects. Use the ordinary dev
account in a trusted test environment, not a production superuser or an
untrusted external `codex` binary.

## Wire contract

- Transport: local subprocess `codex app-server --listen stdio://`.
- Exactly `initialize`, `initialized`, `thread/list` with
  `{limit:25,sortKey:"created_at",useStateDbOnly:true}`.
- 12-second total deadline, 512 KiB cumulative stdout ceiling, bounded one
  page (25 threads). RPC errors, malformed frames or timeout are failure,
  never `[]` success.
- Native stdout can contain user prompts, titles, previews, full paths or
  secrets. Only whitelisted fields are exported; raw frames, request logs,
  errors, preview, `cwd`, cursor and transcripts never leave the process.
- Output schema v2: `sessionId`, `runtimeKind`, bounded `projectLabel`,
  `startedAt`, fixed `liveness:unknown`, and `observerStatus`.
  Page truncation is represented as `hasMore`, not an exported cursor.

## Truth / identity / security boundary

**Important**: Starting a new app-server does not attach to every already
running Codex CLI, VS Code or remote app-server process. A returned
`observerStatus=notLoaded` does not prove the original thread is stopped;
`active` is only the status seen by this particular new app-server process.
`liveStatusVerified` therefore remains `false` and the UI always shows
global **unknown**. Neither an export nor a GPUPanel administrator session
establishes a binding to the native thread's OS owner.

The script itself requires a real non-root Linux UID/EUID match and a matching
`/home/<username>` HOME owned by that UID. It does not use sudo/setuid,
install a systemd unit, open an external listening socket, pair a device or
create a Host API. No mobile clients, policy changes or remote writes are in
this slice.

Imports are untrusted even when their JSON schema is valid. The UI refuses
forged `liveStatusVerified`, unrecognized observer scope, duplicate IDs,
status values other than `notLoaded/idle/active/systemError`, and oversized
files; it drops arbitrary extra fields rather than rendering raw previews.

## Verification / recovery

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_codex_appserver.py' -v
cd frontend && pnpm test && pnpm typecheck && pnpm build
```

Synthetic subprocess integration tests exercise real pipes, handshake,
DB-only flag, status parsing, dropped sensitive fields, native rejection and
timeout cleanup. Passing them is not proof that a real Codex installation
accepted the handshake. Record installed Codex version, exact tested commit,
non-sensitive file size, observed schema and PASS/FAIL/NOT RUN separately.
Do not capture raw Codex JSON frames, prompts or tokens in CI artifacts.

Rollback: remove this optional script, v2 parser branch and UI guidance;
existing rollout v1 import and Host/Terminal/Projects continue unchanged.

## Next independent slice: trustworthy native observer

Live observation requires explicit GPUPanel Web-user -> non-root OS-principal
binding, a same-principal adapter connected to **the existing authoritative
native app-server**, bounded subscriptions, per-session authorization and
reconnection/reconciliation. A fresh subprocess snapshot cannot substitute
for any of those. Until then, mobile Relay and approving native tool calls
remain out of scope.
