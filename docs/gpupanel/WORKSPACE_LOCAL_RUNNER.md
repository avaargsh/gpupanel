# GPUPanel user-local Workspace uv runner

**Experimental terminal-only handoff, not an Agent API or Core provisioning.**
The authenticated Core `provision-plan` endpoint and explicit `provision-intent`
POST create a durable metadata request. The Core process does **not** have
authority to impersonate a Linux desktop user or execute their code.

The new `scripts/gpupanel-uv-intent-runner.py` lets **the same non-root
desktop user** run the existing reviewed offline `uv` scaffold creator.
It has **no network endpoint, sudo, Docker, GPU access, arbitrary path
argument, shell execution, or Core database write**.

## Local manual walkthrough (Ubuntu, regular user)

1. Sign in to GPUPanel as the local administrator, register a Project, then
   open the Project's Workspace preparation card. Review the fixed offline
   `uv-python-stdlib-offline-v1` profile and click **Record intent**.
   Refresh until `AwaitingHostBinding` is visible. This is not execution.
2. In the authenticated session, export the *fresh* JSON response of
   `GET /api/v1/core/projects/<project-uuid>/workspaces/<workspace-uuid>/provision-plan`
   to a local file you own, e.g. `$HOME/workspace-intent.json`. The runner
   accepts either the Core `{code:200,data:{...}}` envelope or the inner plan.
   Avoid exporting cookies, tokens, headers or unrelated credentials into it.
3. On the actual Ubuntu desktop as your normal non-root login, run:

```sh
chmod 600 "$HOME/workspace-intent.json"
python3 scripts/gpupanel-uv-intent-runner.py plan \
  --intent-file "$HOME/workspace-intent.json" --json
```

4. If the result is `READY_FOR_APPROVAL`, explicitly review **both** full
   digests and confirm in your own terminal:

```sh
python3 scripts/gpupanel-uv-intent-runner.py apply \
  --intent-file "$HOME/workspace-intent.json" \
  --approve-plan "<Core planDigest>" \
  --approve-uv "<local uvPlanDigest>" --json
```

The only possible target is
`~/GPUPanel/projects/workspace-<workspace-uuid>`. It does not derive a
directory or command from the user-editable project name or `sourceHint`.
The existing `uv` adapter performs `uv init` + `uv lock` with
`UV_OFFLINE=1`, no config and no managed Python downloads, stages a
template under that same user home, then atomically publishes it with
`RENAME_NOREPLACE`. It does **not** execute user `main.py`.

`LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED` means a local `uv` receipt was
read back and validated, **not** that Core, the Agent or a GPU has accepted
the result. The Core Workspace remains `NotProvisioned`; its request
remains `AwaitingHostBinding`. The input JSON is **not signed** and
possession of it is not delegated machine authority: the non-root operator's
interactive approval is the separate local execution decision.

If the directory already exists, the runner always returns
`EXISTS_REQUIRES_REVIEW`, even if `uv.status` returns `VERIFIED`.
No implicit adoption/replay/overwrite/delete occurs. In particular,
interruption between local publication and later control-plane attestation
must be investigated manually, never automatically treated as success.
`status` and `plan` do not create directories or processes.
Failure output suppresses `uv` stdout/stderr, which may include local
sensitive values.

## Next security gate

Before remotely dispatching a runner, provide an authenticated Core→Agent
operation identity with single-host binding, OS principal mapping, narrowly
scoped execution capability, idempotency lease/CAS, timeout, redacted
observations and independent readback. Validate the same Ubuntu build under
real login→SQLite→non-root runner→receipt→reboot. Do **not** use the raw
JSON file as an Agent authorization token or mark Workspace Provisioned
solely from this local CLI. M0 G3–G6 remain NO-GO.

## Operator-reported local evidence (not an attestation)

After a successful `apply --json`, the runner returns
`localEvidence` with exactly four fields: `intentId`, `planDigest`,
`receiptDigest` (SHA256 of the checked local uv receipt), and
`evidenceDigest` (SHA256 over the versioned four-line intent binding).
**Only** this nested object should be pasted into the Project details
**Local observation record** panel; it may also be submitted to
`POST /api/v1/core/projects/<project-uuid>/workspaces/<workspace-uuid>/local-evidence`
using the user's already-authenticated Core session and CSRF header.
Do not paste full output, private shell history, Host credentials, paths
or environment variables. No API token bypass is supported.

Core recomputes the digest and authorizes the immutable Project/Workspace/
Intent relation. On success it stores an append-only, owner-scoped
`OperatorReported` record. Re-submitting the same four fields returns the
same record ID; a different receipt for the same intent returns a conflict.
`GET` of the same URL works after Core/SQLite restart. A lost response
must be reconciled with GET rather than automatically POSTed again.

**Critical trust boundary:** the JSON and digest are **not signatures**.
An authenticated operator could fabricate every field, and the local uv
files can drift after observation. The panel visibly preserves
`attested=false`, `blocker=IndependentHostAttestationRequired`, and
`workspaceState=NotProvisioned` in all cases. Evidence hashes do not
grant machine authority, remotely execute uv, prove an OS UID, or enable
Notebook/GPU sessions. A future authenticated Core→Agent→non-root
execution + independent receipt readback must settle these properties.

## Experimental single-user Unix worker (not Core→Agent dispatch)

PR #109 introduces a **separate, explicitly launched user-session worker**,
not a privileged daemon or public API. It accepts one Unix-socket request in
\`$XDG_RUNTIME_DIR/gpupanel/uv-worker.sock\` (no TCP, no remote hosts).
The socket directory must be owned by the actual non-root Linux UID and
private (0700). \`SO_PEERCRED\` must match that same non-root UID; **root
and foreign UIDs are rejected**, even if they discover the socket.
A 256-bit random single-process token is also required. The client cannot
choose an arbitrary command, path or profile. The worker is started only
after **both** immutable Core and locally computed uv plan digests match
the operator's explicit approvals.

Use the original manually exported, already approved \`workspace-intent.json\`
as described above. On your own Ubuntu desktop:

\`\`\`sh
python3 scripts/gpupanel-uv-user-worker.py \
  --intent-file "$HOME/workspace-intent.json" \
  --approve-plan "<full Core planDigest>" \
  --approve-uv "<full local uvPlanDigest>"
\`\`\`

The process prints exactly one JSON object with \`socket\`, \`intentId\`
and ephemeral \`token\` to that terminal, then accepts a single bounded
local request. In a second terminal **as that same OS user**, use the
printed \`intentId\` and \`token\`:

\`\`\`sh
python3 scripts/gpupanel-uv-user-worker.py \
  --request execute --intent-id "<intentId>" --token "<token>"
\`\`\`

An \`inspect\` request is strictly read-only; it also consumes the one
socket connection but does **not** claim a mutation. The worker exits after
one request (or bounded idle timeout), and removes only the exact socket
inode it created. Never persist the token or transmit it to Core/Agent.

Before \`uv\` runs, the local process makes an exclusive, fsynced,
0600 \`~/GPUPanel/workspace-attempts/<intentId>.json\` marker. A second
\`execute\` for that intent after a lost ACK/crash returns
\`ATTEMPT_UNKNOWN_NO_REPLAY\`, **not** a fresh execution. Operators
must inspect the uv receipt and existing project directory manually.
A returned \`LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED\` may include the
bounded operator-reported \`localEvidence\`; it still does not prove
independent execution ownership or update Core Workspace state.

**Not yet delivered:** automated Core→Agent routing, mapping a Core session
to an OS UID, an Agent-signed observation, durable queued runs, or Host
state reconciliation. The privileged Agent is deliberately **not**
authorized to use this same-UID socket: it has a different identity.
This is a narrowly scoped runtime substrate that can be safely connected
only after those authorization contracts and Ubuntu host acceptance exist.
