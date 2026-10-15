# Host Docker read-only investigation — CLI preview

> **Experimental diagnostic CLI only.** No GPUPanel Core API, web portal, Agent Runtime, authenticated project-scoped workflow, or G3–G6 production readiness is asserted. This is a safe reusable data collection contract for a future incident investigation adapter.

## Purpose and restrictions

The tool records an explicit container's independently observed Docker state and **bounded, hashed** recent Docker log evidence. The log body, environment variables, mount lists, health-check output and daemon stderr are **never emitted**. Machine-readable JSON includes a source timestamp and an immutable container ID; this is observation evidence, **not** an authorized operation or root-cause proof.

The tool never calls Docker `exec`, `create`, `run`, `start`, `stop`, `restart`, `rm`, `pull`, `build`, or `systemctl`. It writes no state files, requires no downloads and does not connect to Kubernetes. It rejects Docker CLI contexts that are not Unix sockets and does not accept Docker as root. **Docker socket access is privileged even for read-only operations**: only use an operator-authorized disposable host and least-privileged context. The Docker daemon itself may already be compromised; this tool does not establish host trust.

## Use from checkout

```bash
# 1. Default: validate input and preview, with no daemon access
python3 scripts/gpupanel-host-investigate.py --container my-container

# 2. Opt in to bounded read-only observation (local Unix Docker context only)
python3 scripts/gpupanel-host-investigate.py --container my-container --probe
```

The second command uses `docker context inspect`, `docker inspect --type container`, then `docker logs --timestamps --tail 40` **by the resolved immutable container ID**, so a name takeover between steps cannot redirect the log read. It aborts for remote/unknown contexts, invalid container metadata and privilege/permission errors. A Docker inspect failure yields exit 2. A log failure yields `PARTIAL` and exit 2, preserving sanitized state metadata but never declaring full observation. Each subprocess is bounded to eight seconds and a combined 2 MiB stdout/stderr capture limit.

Example fields: `source.containerId`, `source.observedAt`, `state.status`, `state.exitCode`, `state.oomKilled`, `state.health`, `logs.sha256`, `logs.signals`, and `mutations: false`. `signals` are **unverified pattern matches**, not diagnoses. `OBSERVED` only means metadata and bounded logs were read; it does **not** prove service health or the GPUPanel Host/API golden path.

## Acceptance (local unit suite, no Docker daemon required)

```bash
python3 -m py_compile scripts/gpupanel-host-investigate.py
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_host_investigate.py' -v
```

| Scenario | Expected |
| --- | --- |
| No `--probe` | No Docker CLI access |
| Invalid container identifier / shell injection | Rejected before any daemon contact |
| Root execution, missing CLI, remote TCP or SSH context | Rejected / no resource read |
| Valid local daemon and container | Structured state with immutable ID, timestamps and hash-only logs |
| Sensitive data in log/health/error | Never included in JSON |
| Malformed inspect payload | Fail closed before log fetch |
| Docker log failure / oversized output / timeout | `PARTIAL` or error, never full success |

## Follow-on work, not delivered here

1. Finish GPUPanel Ubuntu Host G3–G6 and authenticated Core/Agent read-only API acceptance first.
2. Move the observation contract behind server-side project/RBAC/identity verification; do not expose Docker socket or privileged credentials to browser/LLM.
3. Add bounded Host incident evidence views, data retention and redaction policy, then optional kagent/HolmesGPT read-only worker integration.
4. Use `agent-control-plane` for any state-changing remediation with exact-plan authorization, fencing, reconciliation and independently verified `IndependentExecutionProof/v1`; no direct Docker mutation from diagnostic tool.
