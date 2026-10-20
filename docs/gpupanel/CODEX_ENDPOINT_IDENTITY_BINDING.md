# Codex native endpoint identity binding — production gate

- Status: **PROPOSED DESIGN; NOT IMPLEMENTED; NOT ACCEPTANCE EVIDENCE**
- Parent: [GPUPanel #164](https://github.com/avaargsh/gpupanel/issues/164)
- Current prototype: [PR #167](https://github.com/avaargsh/gpupanel/pull/167)
- Scope: local native Codex app-server identity and OS-principal binding only

## Decision

Do not infer process identity from a loopback IP, a successful WebSocket handshake, a bearer token, a PID supplied by a caller, or a single /proc scan. Those establish different properties and are not interchangeable:

| Signal | What it establishes | What it does not establish |
| --- | --- | --- |
| 127.0.0.1 transport pinning | The client dials IPv4 loopback | Which process owns the listener |
| Bearer-token acceptance | The peer accepted the supplied capability | The peer is the intended Codex process |
| SO_PEERCRED on a Unix socket | Kernel-reported credentials of the process connected to that Unix socket | Identity of a separate TCP/WebSocket process behind a proxy |
| /proc socket-inode/PID correlation | A point-in-time candidate owner when procfs visibility permits | Race-free ownership or stable identity across restart/PID reuse |
| Authenticated GPUPanel web session | The application principal for that request | The Linux UID that owns a native Codex process |

The current CLI is therefore a manually operated, same-user proof of concept. Keep liveStatusVerified=false, liveness=unknown, and do not expose its result as an authoritative Core/Relay observation.

## Candidate production design

### 1. Explicit local enrollment

A same-UID user-operated supervisor must enroll one specific app-server instance. Do not discover arbitrary ports, scan home directories, or silently attach to whichever process happens to listen. The enrollment record should contain:

- a random instance identifier and generation;
- the owning numeric UID and login-session identity;
- the exact executable path plus a verified executable identity where available;
- a supervisor-owned process handle/lifecycle record, not a caller-supplied PID alone;
- a short-lived, private capability bound to that instance generation;
- creation time, expiry, and revocation state.

The supervisor must create and own the server lifecycle for any mode that claims authoritative process identity. If it cannot safely adopt an already-running app-server, it must report unsupported/unverified, not pretend that the existing process was verified.

### 2. Bind the web principal to the OS principal

Core must resolve the authenticated web principal through an explicit administrator-approved mapping to a numeric OS UID and permitted local enrollment. A browser-provided UID, session ID, endpoint, PID, or project path is never authorization evidence.

Before returning an observation, Core must authorize the pair (web principal, enrolled instance generation) and the requested session/thread membership. Default deny on missing, stale, ambiguous, revoked, or cross-UID mappings.

### 3. Separate transport identity from native protocol

The supervisor-to-Codex transport remains a distinct trust boundary. A Unix-domain socket with SO_PEERCRED can authenticate a local adapter connection to the supervisor, but it does not authenticate the TCP Codex process behind that adapter by itself.

If Codex only exposes TCP/WebSocket, the supervisor must bind the endpoint to the process it launched and manage that process's lifecycle. If this cannot be enforced on a supported platform, keep the connection explicitly unverified. Do not claim that SO_PEERCRED directly verifies a TCP listener.

### 4. Bounded, read-only observation

The initial production slice remains read-only:

- allowlist only the native initialization, DB-only list, and explicitly reviewed status methods;
- cap frame size, thread count, event count, duration, and reconnect attempts;
- sanitize before persistence/logging; never persist raw native frames, prompts, previews, cwd, tokens, or tool payloads;
- treat unknown thread IDs, membership changes, malformed events, disconnects, and generation changes as requiring reconciliation;
- clear stale observations on disconnect or failed reconciliation;
- never start/resume threads, execute tools, approve actions, or relay writes.

A valid observation is scoped to one enrolled instance and generation; it is not a claim about every Codex CLI, IDE extension, or remote session on the machine.

## Required acceptance tests

Production status remains **NO-GO** until the following are independently evidenced:

1. **Wrong listener:** a different loopback process cannot be mistaken for the enrolled Codex instance, even if it responds with plausible JSON-RPC.
2. **Wrong UID:** a web principal mapped to UID A cannot observe an instance enrolled by UID B.
3. **PID reuse/restart:** process exit, restart, PID reuse, or enrollment generation change invalidates old capabilities and cached observations.
4. **TOCTOU:** swapping the endpoint owner between validation and connection fails closed or remains explicitly unverified.
5. **Revocation/expiry:** revoked, expired, or superseded enrollment cannot be reused.
6. **Thread authorization:** identifiers outside the authorized initial page/membership cannot be disclosed by injected notifications.
7. **Disconnect/reconcile:** stale state is removed; reconnection revalidates the instance generation and re-queries the bounded source of truth.
8. **Secret suppression:** tokens, raw frames, prompts, cwd and tool/approval payloads do not appear in logs, API responses, or CI artifacts.
9. **Real host test:** run as a normal Ubuntu user with a real installed Codex app-server, recording exact commit and sanitized evidence; mocks alone do not satisfy this gate.

## Rollout gates

- **Prototype:** current PR #167; manual endpoint, local-only, unverified snapshot.
- **Local supervisor:** separate reviewable implementation, explicit enrollment and lifecycle ownership.
- **Authenticated Core read path:** web-to-UID/instance authorization, audit events and per-thread access checks.
- **Live status:** bounded subscriptions plus reconnect/reconciliation and real-host acceptance.
- **Remote/mobile actions:** separate threat model and approval design; explicitly out of scope for this document.

No stage may silently inherit authority from the previous stage. Until the relevant acceptance tests pass, retain liveStatusVerified=false, liveness=unknown, and do not merge the prototype as a production-ready observer.
