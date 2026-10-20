# G5 Docker residual preflight (read-only, NOT release evidence)

Status: **experimental / stacked Draft on #137 → #134**. No M0 / G5 GO.

The Agent already has a read-only Docker client capable of listing all container
states. This change adds an internal `inspectAgentDockerNameResiduals` adapter
that reads the **configured Docker endpoint** with a 5-second, cancelable
context. A helper performs a bounded classification with no mutations.

## What is observed

- Up to 4095 container summaries (including stopped containers).
  Saturation of 4096+ records is a refusal, not proof of absence.
- Exact normalized `com.docker.compose.project` label equal to the requested
  application instance, case insensitively. A matching stopped container
  still blocks a claim of absence.
- Exact/prefix container names for a requested name, including recognizable
  `1panel-<name>-` and `gpupanel-<name>-` forms.
- Empty/missing Compose project labels make ownership **ambiguous** and block
  claims of absence (even when names are unrelated).
- Docker client errors, cancellation, missing Agent database, invalid names,
  and scan saturation **fail closed**. All results set `verified=false` and
  `canRelease=false`.

If no matching containers or ambiguous identities are observed,
`dockerAbsent=true` means **only that the current, configured Docker daemon
did not return a matching container in this bounded query**. It is NOT a
conclusion about persistent volumes, custom Docker networks, host bind mounts,
filesystems, other daemons, alternate Docker contexts, app health or permission
to reuse the name. Every completed result includes
`DOCKER_VOLUMES_AND_HOST_FILESYSTEM_NOT_OBSERVED` in its reasons.

The adapter is **internal-only**: no new HTTP API, UI button, CLI, mutation
endpoint, Docker cleanup, approval mapping, or call into
`releaseAppInstallNameAfterReview` was added.

## Verification

Offline Go unit tests cover: empty daemon, stopped matching Compose projects,
same-name containers with misleading labels, unlabeled/ambiguous containers,
explicitly different projects, list failures, cancellations, bounded scans and
invalid names. Run from `agent/`:

```bash
go test ./app/service -run 'TestDockerPreflight' -count=1
go test ./utils/docker -count=1
go test -race ./app/service ./utils/docker
```

These tests use injected container summaries. They **do not** prove live Docker
API or actual resource cleanup. Release must remain disabled until independent
host binding, actual Docker/Compose/volume/filesystem ownership proofs, separate
operator approval and atomic operation fences are demonstrated under real
Ubuntu 24.04 / SIGKILL / lost-ACK / duplicate-install fault injection.

## Deliberate limitations

- Container labels may be forged or absent. Containers on other daemons are
  invisible to this inspection.
- Some GPUPanel containers have generated names containing application *keys*
  rather than the user-selected instance name; the Compose label is the main
  correlation signal. Unlabeled ambiguous containers are therefore not
  dismissed.
- A snapshot can become stale immediately. No Docker operation freeze/lease is
  acquired, and there is no authoritative volume inventory in this change.
- Inspecting with a privileged Docker endpoint is operationally sensitive.
  The helper must remain confined to the already-authorized Agent server,
  and user-supplied names may not choose arbitrary Docker endpoints.

A future real multi-source release observer should combine this diagnostic
with independently bound host and volume/file path evidence, not simply map
`dockerAbsent=true` to the protocol's four boolean release approvals.
