# Native Codex Unix Peer Observer — Linux owner check

**Date:** 2026-10-20
**Status:** Experimental, code/tests only. Real native Codex acceptance NOT RUN.
**Parent:** [#164](https://github.com/avaargsh/gpupanel/issues/164), stacked on [#167](https://github.com/avaargsh/gpupanel/pull/167).

## Why Unix instead of a bare loopback TCP URL?

Upstream Codex app-server supports `--listen unix://` as well as `stdio://`
and `ws://IP:PORT`. Its Unix transport uses WebSocket framing over a local
Unix stream. A TCP port alone cannot establish the kernel owner of the
listening native process.

This opt-in observer opens only the **current Ubuntu login user's**
`~/.codex/app-server-control/app-server-control.sock` rendezvous. It validates
the home and control-directory ownership and unsafe write permissions, then
checks the **connected** remote Unix process via Linux `SO_PEERCRED`.

The socket alias can be a symbolic link on supported Codex builds; the
observer accepts it ONLY within a trusted user-owned parent and when both the
resolved socket and the connected peer belong to the current non-root UID.
Nothing is inferred from a client-supplied UID or JSON field.

## Developer workflow

On the **same Ubuntu account** that owns the already running Codex app-server:

```bash
cd /path/to/gpupanel/core
go run ./cmd/codex-observer --native-unix > ../codex-unix.json

# Bounded periodic resampling, never a background daemon or live event relay:
go run ./cmd/codex-observer --native-unix --watch \
  --samples 12 --interval-seconds 5 > ../codex-unix-watch.ndjson
```

Only the **single JSON snapshot**, not the NDJSON watch stream, is currently
accepted by the Agent Sessions browser import panel. Web users must select
the local node; the imported content remains in browser memory and is not
POSTed to Core or mobile Relay.

The observer does not start Codex, attach to arbitrary running CLI/VS Code
stdio processes, modify settings, answer approvals, issue commands or connect
to an arbitrary Unix path. When the control socket is absent, belongs to
another UID, or cannot complete the read-only RPC, it fails with no JSON
snapshot. It will not fall back to `/home/*`, a root shell, an unauthenticated
TCP port, `thread/resume` or uncontrolled process scanning.

## RPC and output constraints

Native transport is a WebSocket over a Unix socket. Only
`initialize`, `initialized`, and `thread/list` with
`{limit:25,sortKey:"created_at",useStateDbOnly:true}` are sent.
The existing 10s total RPC window and 512 KiB frame cap remain in effect.
Full paths, previews, prompts, auth errors and native thread bodies never
enter exported JSON. The resulting browser-compatible v2 snapshot has:

- `source:local-user-codex-appserver`, `readOnly:true`
- `observerScope:attached-owner-verified-unix-appserver`
- `liveStatusVerified:false`, `liveness:unknown`
- bounded native thread metadata, its observer-relative status and `hasMore`

Although the local CLI checks Linux peer UID, the manually selected JSON
file is still untrusted browser input. Core has **not** verified its
provenance or linked it cryptographically to the browser's own session.
A same-UID process can impersonate the native socket; kernel UID alone
does not prove that it is the expected Codex binary or human owner.
The source does not provide global CLI liveness or tool approval rights.

`--watch` is a **finite reconnect-and-resample loop**: each sample opens a
new same-UID Unix connection. Failures emit `connection:unavailable` and
`snapshot:null` rather than stale live data. It is NOT a native notification
subscription, durable synchronization cursor, HTTP server or mobile stream.

## Verification evidence boundaries

```bash
cd core
go test ./cmd/codex-observer -count=1
go test -race ./cmd/codex-observer -count=1
cd ../frontend
pnpm build && pnpm typecheck && pnpm test
```

Tests include a real local Unix socket WebSocket test server; correct owner,
wrong peer UID, no listener, field redaction, and watch failure state.
Mock app-server RPC behavior is not a real Codex binary acceptance.

Real Ubuntu with installed native Codex app-server, protected socket, a
second user account, real browser import and restart recovery remain
**NOT RUN** until checked independently. G3–G6 remain NO-GO.

Next separate integration must independently authenticate the native service
endpoint, link the same UID to an authenticated GPUPanel Core browser
session, and apply per-thread authorization and versioned reconnection.
Do not expose this CLI through a privileged web shell.
