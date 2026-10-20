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

## Explicit existing WebSocket app-server observer (opt-in experimental)

An **additional** developer-operated Go CLI can now query an ALREADY running
Codex app-server over a strictly validated loopback WebSocket. Unlike the
original Python probe, it does **not** start a second native Codex process:

```bash
# First, separately launch or identify YOUR OWN existing native Codex
# app-server configured to listen on an IPv4 loopback port. Never expose it
# to the public network.
cd /path/to/gpupanel/core
go run ./cmd/codex-observer --endpoint ws://127.0.0.1:4222 > ../codex-attached.json
```

The process runs as the ordinary, non-root Ubuntu user who operates this
app-server. It sends only `initialize`, `initialized` and a DB-only
`thread/list` limited to 25 entries. It never sends `thread/resume`,
`thread/start`, `turn/start`, approvals, shell commands, authentication
tokens or environment secrets. No app-server process is spawned by the
observer. The WebSocket has a 10-second whole-request budget and a 512 KiB
per-frame limit. The exported page uses the existing schema v2 with
`observerScope:attached-loopback-appserver`, but still sets
`liveStatusVerified:false` and `liveness:unknown` because manual export
is not independently attested by GPUPanel Core and is not a stream.

Only the explicit form `ws://127.0.0.1:PORT` is accepted; IPv6, remote hosts,
`wss://`, credentials, query strings, arbitrary paths and low ports are
refused. The tool intentionally has **no automatic port discovery** and
**does not authenticate a TCP listener's Linux process owner**. This is a
manual trusted-local-machine PoC, not a multi-user safe attached process
connector. Treat a listener with unknown ownership as untrusted; never share
an unprotected loopback app-server beyond the developer's own trusted host.
Newer Codex versions have optional native WebSocket authentication; this
first tool does not handle such credentials and fails closed when rejected.
Use a protected native deployment in later work rather than weakening the
application's existing auth policy.

The observation is tied to the **specific native server process chosen
by the user**, not all Codex clients installed on the machine. Status changes
after this one-shot export will **not** update in the browser; rerun the
command and re-import to refresh. The browser uses field whitelisting and
does not transmit the JSON file to GPUPanel Core/Relay.

Protocol tests use a disposable in-process WebSocket mock, not a real
upstream installation. Real Ubuntu + Codex WS integration remains
**NOT RUN** until separately evidenced.

## Next gate: same-UID authorization and real subscriptions

Do not transform this user-run observer into a privileged Core proxy merely
because a CLI can query a loopback port. Production integration must match
the Web session to the kernel-validated OS UID, independently establish the
native server endpoint's owner or authenticated identity, enforce per-thread
access, keep a bounded state/event cursor, and fail closed on disconnect.
Mobile/Relay writes remain deferred.

## Bounded repeated observation (non-background polling)

The manually attached, non-root Go client now supports a **finite** read-only
watch mode. It does not subscribe to or consume raw native tool events;
instead it reopens the explicitly chosen WebSocket and re-runs the **DB-only
read RPC** for every sample. There is no persistent GPUPanel Core observer,
Agent delegation or live Browser event channel.

```bash
cd /path/to/gpupanel/core
go run ./cmd/codex-observer --endpoint ws://127.0.0.1:4222 \
  --watch --samples 12 --interval-seconds 5 > ../codex-observations.ndjson
```

The process writes exactly one JSON record per attempt (`schemaVersion:1`,
`source:local-user-codex-watch`, monotonically increasing `sequence`,
`observedAt`, and `connection`):

- `connection:observed`: a fresh, sanitized app-server snapshot is included
  as `snapshot`; `liveStatusVerified` remains false even if the remote
  native server reports `active` or `idle`.
- `connection:unavailable`: `snapshot:null` and **no stale sessions** from
  a previous successful observation. Native error text and raw Codex frames
  are never written.
- On the next successful sample, native IDs/status are fetched anew, not
  inferred from cached results or automatically retried writes.

Each RPC has its own 10-second total deadline, with 512 KiB maximum frame,
100-frame notification budget and the previous one-page/25-thread bound.
Only `--samples` 1–120 and `--interval-seconds` 3–60 are accepted.
The CLI exits after the configured number of samples or Ctrl+C.
No scheduler/systemd service, automatic retry daemon, mobile Relay or
background monitoring is installed.

**NDJSON is an operator-controlled saved recording, not a live browser
subscription.** The GPUPanel Agent Sessions page can manually import a
completed `.ndjson` file (4 MiB and 120-row upper bounds). It validates all
records but only shows the **last** observation with its original timestamp;
a last `unavailable` record removes prior sessions from the display.
No automatic polling/browser file access/remote upload exists.
The redirected file may reveal project basenames and native thread IDs:
use `umask 077` before running the command, do not place it in a shared
directory, and delete it when no longer required.

Native WebSocket peer ownership/authentication, original-session authority
and real Codex event subscriptions remain distinct unfinished gates.

Verification: `cd core && go test ./cmd/codex-observer -count=1` checks
the sequence `observed → unavailable → observed` and asserts missing stale
data/error details, cancellation, bounds and output-failure handling.
Successful mock-based tests do not establish a native Codex instance's
ownership or confirm a live Ubuntu browser-to-Codex connection.

## Optional same-browser local file follow (Chromium)

For developers on the **same Ubuntu desktop as the browser**, start the finite,
non-root observation CLI and save its output in your own private directory:

```bash
umask 077
cd /path/to/gpupanel/core
go run ./cmd/codex-observer --endpoint ws://127.0.0.1:4222 \
  --watch --samples 120 --interval-seconds 5 > ../codex-observations.ndjson
```

In GPUPanel `/agent-sessions`, with the local node selected, click
**选择并跟随本机记录**. Supported Chromium browsers can ask you to explicitly
grant the page a read handle to this local `.ndjson` file. After this gesture,
the page reads only that selected file at most every five seconds; it never
contacts Core/Agent/Relay, opens native ports, installs a background daemon or
uploads an observation. This is **local file follow**, not a Codex websocket
subscription and not automatic persistent permission to read `~/.codex`.

The reader accepts only complete, newline-terminated NDJSON records. A
partially written terminal record is ignored until completed. Every completed
record passes the original strict sequence/schema/inventory validation.
Last native `connection:unavailable` clears displayed sessions; read errors,
lost permission, over-limit files, bad complete lines, unexpected future clocks
and observations older than 90 seconds also clear old data. A file that is
never written or not yet newline-complete displays a waiting state, not a
false empty verified session list. The maximum file is 4 MiB and 120 rows,
and the native observer itself runs for at most 120 finite samples. When the
file reaches its bound, **stop following and start a new file / CLI run**; the
page deliberately does not trim or silently skip earlier rows.

Use the UI's **停止本地跟随** action to release the handle; changing node,
navigation away or closing the page also stops polling without persistence.
Ordinary JSON/NDJSON manual import remains supported for Firefox/Safari,
browsers without File System Access API, or when the user declines access.

Security boundary: a manually selected file can be edited or forged by its
owner. Nothing here turns it into a Core-certified live process status or
authorization. The only displayed native status is the last explicitly
connected app-server's observation, and `liveStatusVerified` stays false.
Real browser click/keyboard acceptance is still **NOT RUN** if CI cannot
install its Chromium harness.

Tests: `cd frontend && pnpm test && pnpm typecheck && pnpm build`.
`nativeWatchTail.test.mjs` exercises partial tail, disconnect clearing,
staleness/future clocks, invalid lines and oversize refusal.

## Native status notifications on an existing connection (experimental)

For a **trusted, already running** user-owned Codex app-server WebSocket,
the observer can now use the same connection for the initial DB-only
`thread/list` and subsequent `thread/status/changed` notifications.
This avoids synthesizing activity states from polling intervals and
never opens a privileged Core proxy:

```bash
umask 077
cd /path/to/gpupanel/core
go run ./cmd/codex-observer --endpoint ws://127.0.0.1:4222 \
  --events --duration-seconds 60 --attempts 3 > ../codex-native-events.ndjson
```

Unlike `--watch`, `--events` keeps the selected native socket open to
observe real server notifications. The initial status comes from a
whitelisted `thread/list` page (25 rows); only status changes referring
to those same native Thread IDs update its in-memory copy. Thread
membership changes force a fresh list rather than inventing a new owner.
`item/*`, approval requests, commands, reasoning, tool data and raw
transcripts are ignored. Native frames are never exported verbatim.

Each successful initial query or status update writes an existing
`local-user-codex-watch` NDJSON record with
`connection:"observed"`, `liveStatusVerified:false`, and
`observerScope:"attached-loopback-appserver"`. The individual Thread
status is observed **only on the chosen native app-server**; unrelated
Codex processes and human approval authority remain unknown.

A WebSocket closure, status parse failure, membership change, idle
15-second read timeout or notification flood immediately emits an
`unavailable` record with **no previous snapshot**. The observer then
opens a new connection and obtains a **fresh DB-only** list before
re-entering observed state. It is bounded to 1–5 attempts and a
15–90-second observation period, 512 KiB frame budget,
1000 notifications per connection and 120 output records. Exhausting
the attempts exits nonzero. Normal completion also emits unavailable.
Stopping the CLI terminates the experiment; no Core background task is
installed.

The existing manual NDJSON import and user-approved Chromium local file
follow can read this format. Use a private output path and handle
staleness/disconnects as uncertainty, never as thread completion or a
go-ahead to approve an operation. The page will not attach or authenticate
an app-server endpoint itself.

This implementation has **in-process mock WebSocket protocol tests**,
including `status/changed → disconnect → fresh thread/list` and
secret suppression. It is not proof of a real Codex installation's
WebSocket identity, account, native authorization or availability.
Actual same-user upstream integration and dual-login acceptance remain
separate NOT RUN gates. Do not expose this loopback socket over WAN.
