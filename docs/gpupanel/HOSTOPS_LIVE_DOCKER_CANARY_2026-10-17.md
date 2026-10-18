# HostOperations live Docker canary acceptance (2026-10-17)

## Scope, evidence tiers and isolation

This adds **a real Docker SDK / TaskDB test**, not an installed GPUPanel browser-to-Core-to-Agent acceptance. The GitHub-hosted Ubuntu 24.04 runner creates only one purpose-built container, uniquely labeled for that CI run. No application workload or user-host Docker context is touched.

The workflow `.github/workflows/gpupanel-hostops-live-canary.yml` builds a Go-only image **locally and offline** from `scratch`. It creates (not starts) one labeled container with `network=none`, zero bind mounts, read-only root filesystem, non-root UID/GID 65534, no privileges, dropped capabilities, no-new-privileges, 64 PID limit and 128 MiB memory. No registry pull, published port or Docker-in-Docker.

The package test `TestOwnedDockerStartStopRestartLifecycle` is **skipped by default** unless all three explicit inputs are present: a complete container ID, this run's unique label, and its immutable image digest. Before *any* mutation it independently inspects and rejects containers failing the identity / isolation checks.

## Observed journey

1. **Created → Start → Running**: preview and unconfirmed request leave the canary unchanged; confirmed mutation uses exact ID and a durable hashed plan, then verifies StartedAt changed.
2. **Running → Stop → Exited**: bind full pre-state, execute once and independently verify FinishedAt changed.
3. **Exited → Start → Running**: independently prove a new StartedAt on the same immutable ID.
4. **Running → Restart → Running**: independently verify a changed StartedAt.
5. After **each** step, repeat the same plan key and confirm ID; no subsequent Docker transition may occur.
6. Reopen the test's on-disk SQLite `task.db` and read back four owner-scoped verified receipts.
7. Remove only this run's label-verified container. Assert the canary is absent, pre-existing container IDs/states match the initial snapshot, and preserve cleanup proof. **Do not use prune, `docker rm` on unknown IDs, or arbitrary production containers.**

The log records `HOSTOPS_CANARY_PROOF` as one JSON row containing operation IDs, preview/confirmation flags and hashes of before/after process snapshots. GitHub artifact `hostops-live-docker-<commit>` contains `hostops-live-canary.json`, logs, initial/final container inventory and `cleanup-status.txt` (seven-day retention). Only report this as LIVE acceptance **after** the Actions job and cleanup assertions succeed; never infer it from the existence of this workflow.

## Failures and unresolved claims

- Simulated Docker API tests separately cover changed preview, ACK/error loss, unavailable Inspect, unchanged observation timeout, malformed ID and concurrency. The LIVE workflow confirms successful state transitions; it does **not** inject a dropped network ACK into native Docker.
- `verified` means the operation's *target Docker state* was independently observed and the Agent TaskDB receipt was persisted. It does **not** independently prove operation causality or application readiness.
- The test invokes the Go HostOperations engine and local Docker socket; it does not authenticate through installed Core / Agent services. That browser → Core → private Agent → Docker path remains a distinct Ubuntu acceptance gate.
- A job that fails, is cancelled, cannot contact Docker, or has missing cleanup proof is **BLOCKED**, never converted to pass by synthetic tests.

## Run and review

Open the GitHub Actions workflow **GPUPanel HostOperations live Docker canary** on the PR. The pull_request trigger checks only hostops source and workflow changes. Inspect the actual job, `go-test.log`, `hostops-live-canary.json` and `cleanup-status.txt`. The workflow uses minimal `contents:read` permissions and needs no secrets.
