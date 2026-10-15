# Agentic Ops vertical slice: API boundaries and acceptance contract

> **PROPOSAL ONLY — no API or UI is implemented by this document.** Date 2026-10-15. Source of truth for GPUPanel readiness: [Host roadmap](./ROADMAP.md) and [Golden Path](./GOLDEN_PATH.md). This contract is gated behind Host G3–G6; it is not a substitute for Host work.

## 0. Outcome, actors and strict architecture boundary

First user outcome: *An authorized on-call operator can inspect a real Kubernetes/Host incident, review provenance-linked evidence, and—only with explicit authority—request a single scoped state transition whose outcome is independently verified.*

```text
Browser (GPUPanel) -> GPUPanel Core authenticated facade
       |                      |
       |                      +-- existing Host Agent (Host, Docker, logs)
       |                      +-- readonly diagnostic adapter (kagent / HolmesGPT)
       |                      +-- telemetry links (Prometheus, Loki, OTel)
       |                      +-- GPUPanel action adapter --> agent-control-plane
       |                                              authorize exact plan
       |                                              fence -> execute -> reconcile
       |                                              independent proof verification
       +-- render observed state, sourced evidence and immutable proof refs
                   (no browser-to-provider credentials)
```

- **GPUPanel Core** is the authenticated *UI facade / composition* layer. It owns connector config and an index of display references, **not** durable operation authority.
- **Host Agent** owns Linux/Docker provider access; unsafe write-capable Agent tools are not exposed to the diagnostic worker.
- **Diagnostic worker** proposes findings and changes; it cannot authorize or directly mutate providers.
- **agent-control-plane (ACP)** is the only authority for high-impact state transitions: exact `TransitionPlan`, authorization binding, fencing, execution journal, independent verification and proof.
- **gpu-compute-platform** owns its own ComputePool/Workload source of truth, reconciler and Kueue admission. This slice does not mutate cluster workloads by circumventing those APIs.
- UI remembers *where* evidence lives, never substitutes cached status for fresh provider observation.

## 1. Resource identity and provenance

Every displayed or executed operation must carry these identifiers:

| Key | Required use |
| --- | --- |
| `project_id` + authenticated `principal` | Server-side tenant scope and role checks |
| `resource_ref` | Provider + cluster/host + namespace (where applicable) + kind + name + immutable UID |
| `observed_at` + `source` | Evidence freshness; missing values display "unknown" |
| `generation` / `resource_version` | Fresh preconditions, checked again before execution |
| `investigation_id` | Diagnosis and evidence correlation, **not** authorization |
| `proposal_id` + `plan_digest` | Exact intended change; digest changes invalidate approval |
| `operation_id` + `attempt_id` | Durable attempt identity within ACP |
| `proof_ref` + `statement_hash` | IndependentExecutionProof/v1 evidence lookup and integrity |

Never conflate Agent/session ID with operation ownership. Free-text LLM output and source logs are **untrusted inputs** even if they contain executable commands.

## 2. Proposed GPUPanel facade (not upstream 1Panel API)

Namespace below is illustrative, **not implemented and not a promise of wire compatibility**. Confirm Core route prefix and auth middleware against deployed build before implementation.

| Proposed endpoint | Method | Semantics / side effects |
| --- | --- | --- |
| `/api/v2/ops/capabilities` | GET | Server-reported supported providers, action classes, diagnostics readiness; unavailable features hidden |
| `/api/v2/ops/agents` | GET | Federated catalog read; source ID and provider retained, no shadow mutable Agent model |
| `/api/v2/ops/investigations` | POST | Authenticated scoped **read-only** investigation; returns task ID; never executes a change |
| `/api/v2/ops/investigations/{id}` | GET | Evidence links, source timestamps, hypotheses, status and error reason |
| `/api/v2/ops/proposals` | POST | Create *non-authoritative* candidate only; server re-observes resource before ACP planning |
| `/api/v2/ops/operations/{id}` | GET | ACP-reflected actual authorization/attempt/verification state |
| `/api/v2/ops/operations/{id}/proof` | GET | Sanitized ACP proof reference and verification status; subject to audit permission |

**No generic `/execute` endpoint.** ACP workflow invocation is an internal server-side adapter requiring narrow plan/capability allowlisting. Approval/execute endpoint and wire shape are intentionally **TBD** until ACP's supported *public* integration surface is confirmed and integration tests are in place. GPUPanel must not bind directly to ACP private coordinator classes or SQLite tables.

### Proposed investigation schema, illustrative only

```json
{
  "project_id": "demo-project",
  "resource_ref": {
    "provider": "kubernetes",
    "cluster_id": "disposable-kind",
    "namespace": "demo",
    "kind": "Deployment",
    "name": "sample-service",
    "uid": "actual-uid-from-provider"
  },
  "time_range": { "start": "2026-10-15T07:00:00Z", "end": "2026-10-15T07:15:00Z" },
  "intent": "investigate_only",
  "source_ids": ["prometheus-readonly", "loki-readonly"]
}
```

The authenticated principal and effective permissions come **only** from the server session, not from this body. `project_id` is verified against the session. `uid` and version/generation must be verified by fresh independent provider reads; never trust client-provided values.

## 3. Task state is not execution authority

| User-visible domain | States | Allowed behavior |
| --- | --- | --- |
| Investigation | `QUEUED`, `RUNNING`, `NEEDS_INPUT`, `COMPLETED`, `FAILED`, `CANCELLED` | Read-only worker; evidence available on failure; cancelled tasks cannot launch mutating tools |
| Candidate proposal | `DRAFT`, `AWAITING_APPROVAL`, `REJECTED`, `EXPIRED` | Preview only; only ACP's exact plan is authorizable |
| Mutation/verification | ACP source states including `PREPARED`, `COMMITTED`, `ABORTED`, `UNKNOWN`, verified success | UI renders ACP receipts verbatim and separates provider commit, observed desired state, and **operation ownership proven** |

The UI is not permitted to report `SUCCEEDED` merely because a worker finished, the API returned HTTP 2xx, a resource matches desired state or a provider ACK arrived. `UNKNOWN` is **not** automatically retryable: reconcile side-effect ambiguity under ACP rules first. Explicit failed proof verification renders **unverified** and blocks the success badge.

## 4. Permission and security contract

| Operation | Effective principal/policy | Decision |
| --- | --- | --- |
| List Agent capabilities | Authenticated project viewer, server-filtered | Read-only |
| Read logs/metrics/events | Scoped provider role; time/window and data limits | Read-only, no shell/exec required |
| Propose change | Scoped operator + bounded allowlisted action | Candidate only |
| Approve exact plan | Separate configured approver / policy; time-bound | Must bind plan digest + fresh version |
| Execute | ACP-owned fenced authorization + provider adapter identity | Never direct LLM/MCP execution |
| Read proof | Audit/operation access; redaction and tenant scope | Immutable evidence read |
| Manage connector | Platform admin; secret references only, rotation and health checks | Audit write |

- Prefer OIDC project-level RBAC for enterprise path. Do not claim existing single-Host login is enterprise RBAC.
- Do not transmit agent/provider tokens to browser, logs, telemetry or documentation. UI stores only connector alias, credential reference and verified health.
- Provider TLS verification is mandatory; no implicit insecure HTTP fallback for network-restricted installations.
- Diagnostics use allowlisted MCP/read tools with hard timeouts, result size bounds and scoped permissions. Retrieved instructions in logs/docs cannot escalate access.
- Source URLs for metrics/logs must respect access controls and must not leak sensitive query contents in broadly shareable links.
- Approval provenance, plan digest, observer timestamp, policy decision and proof hash must be separately auditable.

## 5. First read-only and write-enabled acceptance scenarios

| ID | Scenario | Expected observable assertion |
| --- | --- | --- |
| RO-01 | Disposable Host Docker container unhealthy | Real Docker status/logs in investigator with timestamps; no mutations |
| RO-02 | kind deployment crashloop | K8s Event + Loki log + Prometheus metric referenced by resource/time |
| RO-03 | Missing Prometheus or Loki connector | Partial answer with explicit missing source, not fabricated metric |
| RO-04 | Agent worker timeout/unreachable | Error shown; no fake success, no leaked credential |
| RO-05 | Cross-project resource URL | 403 and no resource metadata disclosure |
| RO-06 | Malicious instructions embedded in log line | No tool/permission escalation; source treated as data |
| RO-07 | Tool unavailable or unhealthy | Catalog readiness `unknown/degraded` and disabled actions |
| RO-08 | Agent list item has no runtime link | Distinguish configured from healthy; no green "active" claim |
| WR-01 | Valid exact Deployment 20 -> 30 plan in disposable kind | ACP attestation + IndependentExecutionProof/v1; fresh-process verifier passes |
| WR-02 | Stale generation or resourceVersion | Reject before mutation; record refusal |
| WR-03 | Approval for another plan/digest | Reject; no side effects |
| WR-04 | Policy deny / missing approver | Fail closed; no side effects |
| WR-05 | Provider committed, acknowledgement lost | Remain UNKNOWN until reconciliation and independent proof; no duplicate mutation |
| WR-06 | Lease lost / old executor resumes | Old owner fenced; no double side effects |
| WR-07 | Observed target reached from unrelated actor | Desired state may be reached but ownership proof fails |
| WR-08 | Proof tampered or missing hash | Fresh-process verification rejects; UI cannot show success |
| WR-09 | Cancel after COMMITTED | Does not forge rollback or delete evidence; follow ACP recovery policy |
| WR-10 | GPU Workload creation requested | Routed only through gpu-compute-platform/Kueue, or explicitly unsupported; no direct pod scheduling bypass |

These tests are **planned**, not executed. For WR-* consume ACP's frozen acceptance scripts and adapt a provider-neutral facade; never reinterpret a local unit-test green result as production E2E.

## 6. Integration experiments and exact stop/go

### Stage A0 — this PR (design)
- [x] Benchmark and six-plus-one screen mapping
- [x] Proposed identifiers, lifecycle and negative tests
- [ ] Reviewer approval; validate against current runtime / licensing
- [ ] Decide precise public ACP API binding, no guessing

### Stage A1 — after Host G3 / G4
- [ ] Disposable Ubuntu VM: install/login, permission errors and read-only Host incident E2E
- [ ] One diagnostic adapter; enable from backend capability discovery only
- [ ] Real task timeline and source evidence; no production write functions

### Stage A2 — after Host G3–G6
- [ ] Optional kind cluster, pinned kagent or HolmesGPT revision, least-privileged read tools
- [ ] Real incident investigate, traces and connector-negative cases

### Stage A3 — ACP-controlled execution only after identity and authorizer integration
- [ ] Exact-plan approval + fence + provider implementation + independent observer
- [ ] Reuse ACP's Kubernetes 20 -> 30 golden acceptance path, all WR-* negatives
- [ ] Proof verifier in a fresh process, visible status and immutable artifact retention

## 7. Release/rollout safeguards

- Feature flag is **server-sourced**, default OFF; a client toggle alone cannot expose endpoints.
- Do not publish a new sidebar menu until route, auth, provider, health and E2E gates exist.
- No fake agent/task/sample counters in the production UI. Local sample data must be explicitly marked as a fixture.
- Keep Host product reachable without kagent/Agno/HolmesGPT, Kubernetes, GPU, PostgreSQL from external apps or Agentic Ops configuration.
- Preserve the original 1Panel GPL-3.0 notices and confirm licenses for any copied frontend assets.
- Never merge this proposed contract as proof of an executable subsystem.

## 8. Reference baselines (repo-owned facts, not inferred implementation)

- GPUPanel: [architecture](./ARCHITECTURE.md), [product scope](./PRODUCT.md), [Host roadmap](./ROADMAP.md).
- ACP: [v0.1 README](https://github.com/avaargsh/agent-control-plane/blob/main/README.md), [acceptance artifact contract](https://github.com/avaargsh/agent-control-plane/blob/main/docs/V0.1_ACCEPTANCE_ARTIFACT_CONTRACT.md).
- GPU compute: [Go control-plane README](https://github.com/avaargsh/gpu-compute-platform/blob/master/README.md). Kubernetes workload admission remains Kueue.
