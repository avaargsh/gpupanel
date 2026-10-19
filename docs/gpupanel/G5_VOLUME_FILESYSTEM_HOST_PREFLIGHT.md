# G5 host/volume/filesystem residue observations (read-only draft)

Status: stacked on #139 → #137 → #134. **M0/G5 NO-GO.** This is an
internal diagnostic, not a release API or a way to clear an UNKNOWN task.

## Observed scope

1. `inspectAgentVolumeResiduals` reuses the configured Agent Docker client
   to query `VolumeList` with a five-second context. It accepts **only**
   local `unix://` Docker endpoints for this local-host diagnostic and
   checks up to 4095 volume summaries. Volume names and
   `com.docker.compose.project` labels are compared against the normalized
   app instance name. Unlabelled volumes (including anonymous volumes),
   non-local drivers, SDK warnings, nil inventories, saturation or Docker
   failures are all **ambiguous**.
2. `inspectAgentAppInstallPaths` checks the configured
   `global.Dir.AppInstallDir` and `global.Dir.LocalAppInstallDir` root
   directories. It boundedly enumerates each app-key directory and the
   immediate instance-name entries. Existing entries, symlinks, path
   resolution anomalies, missing/unreadable roots, non-directories or
   excessive directory entries prevent a claim of absence.
3. Both projections use a domain-separated SHA-256 of the current local
   `/etc/machine-id` as a correlation identifier. They never return the raw
   machine identifier. This is **not machine attestation**: cloned images
   can share machine-id and a Unix Docker socket can reach an external
   daemon via mounts or forwarding.

These functions are internal-only and produce bounded, redacted observations.
**Both always return `verified=false` and `canRelease=false`.**

## Correct interpretation

`volumeAbsent=true` means this one successfully queried Docker daemon's
reported volume metadata had no match or unresolved ownership under the
bounded heuristic. `knownRootsClear=true` means only the configured app
install directories were checked, not arbitrary bind mount targets, custom
paths, storage plugins, additional Docker daemons, hidden data, or mounted
filesystems. Even if both booleans are true, a safe release is **not proved**.

No file content, environment variable, Compose secrets or raw machine-id
is exported. No cleanup, Docker prune, TaskDB mutation, authorization,
approval callback, HTTP route or UI action is added.

## Tests and real acceptance

The Go tests create only disposable, local temporary directories and inject
Docker SDK volume summaries (they do **not** connect to a real daemon).
Test cases include matching Compose labels, stale name prefixes, unknown
ownership, remote socket rejection, nil/list warning responses, cancellation,
directory symlinks, read failure, invalid names and bounded scans.

The next acceptance gate requires a *real* Ubuntu Host with validated machine
identity and Docker-daemon ownership, fresh TaskDB + AppDB evidence, complete
Docker container and volume identity including bind mount paths, independent
privileged approval, durable operation lock spanning both observations and
final CAS, audit/replay tests and a real rollback rehearsal. The present
adapter cannot satisfy these conditions on its own.

Pending CI checks for this PR validate code and deterministic tests only;
do not label them real host verification. A prior Docker-container-only
snapshot from #139 must not be silently upgraded to a complete host proof.
