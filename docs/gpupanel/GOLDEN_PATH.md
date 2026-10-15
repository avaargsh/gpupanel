# GPUPanel Ubuntu Host Golden Path — acceptance contract

This defines what counts as **a usable first release**. It is not an assertion that the steps pass today.

## Test environment

- Disposable Ubuntu 24.04 VM, amd64 (not a production host; clean state and non-default secrets)
- Docker Engine/Compose installed from a vetted source; a disposable sandbox project to prevent destructive user-data operations
- Local terminal and browser client; optionally one offline network scenario
- Capture commit SHA, package sha256, Host/Agent service versions, test time, sanitized operation logs and failure evidence

## 1 — Preflight

```bash
python3 scripts/gpupanel-bootstrap.py doctor
python3 scripts/gpupanel-bootstrap.py self-test
python3 scripts/gpupanel-install-preflight.py
```

Expected: deterministic and read-only. An existing `/etc/1panel`, `/usr/local/bin/1pctl` or other legacy state blocks a standalone install; never force overwrite.

## 2 — Verified source build (not installation)

```bash
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

Requires Node and Go toolchains, dependency access (or seeded offline caches) and sufficiently provisioned CI/host. A passing archive proves only file integrity and buildability.

## 3 — Controlled fork install/rollback (G3 BLOCKED)

Do not call the upstream official installer on a live host as a GPUPanel upgrade. **A wholly separate runtime namespace is not a prerequisite for editing this fork or building Host features.** A disposable-VM installer may use reviewed inherited paths or new paths, but must document their ownership, service-name/data collisions and migration implications before side effects.

For an installable release, require a cryptographically verifiable manifest, random first-admin credentials, reviewed bind/TLS configuration, preflight permission checks, existing-state backup, an approved target-path/service plan, and independently verified rollback/restore. If an existing 1Panel installation or user data is detected, fail closed until explicit operator approval, a preservation/migration plan and tested restoration exist. **G3 is not accepted** on source-build or docs-only evidence.

## 4 — Login, Host and authorization (NOT TESTED)

- First login with owner account; reject unauthenticated and unauthorized API requests.
- Read CPU/RAM/disk/network; open File/Terminal with correct privilege and path boundaries.
- Restart Core/Agent in VM; independently observe service and API recovery.

## 5 — Docker / App golden path (NOT TESTED)

- Confirm Docker daemon healthy under the intended Host agent identity.
- Create a disposable container using a pinned trusted image, start, inspect, read logs, stop and delete.
- Use Compose or App Store for one benign disposable application; verify uninstall and storage retention.
- Negative tests: insufficient permissions, missing image, Docker daemon down, stop/restart race, double-submit.
- No user-facing operation is marked complete solely because an HTTP POST returned 2xx.

## 6 — Failure and recovery (NOT TESTED)

- Network interrupted during downloads and retries (no downgrade to HTTP; checksum survives failover).
- Disk full or bad archive, occupied port, incompatible existing data schema.
- Crash during commit/release; restore backup; verify no tenant data or service state lost.
- Collect audit trail: request → authorized operation → actual observed outcome.

## Exit condition

**Go/no-go:** installable release requires gates 3–6 with independent evidence. Desktop developer profiles follow afterward; new GPU vendor adapters are frozen. Operational control plane/Kubernetes projects stay external to GPUPanel.
