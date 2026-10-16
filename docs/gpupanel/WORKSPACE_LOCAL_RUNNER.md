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
