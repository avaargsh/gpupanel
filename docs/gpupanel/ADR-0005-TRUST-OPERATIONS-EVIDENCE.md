# ADR-0005: Trust boundaries, authorized operations and outcome evidence

- Status: **Proposed** (2026-10-15)
- Related: [Architecture](ADR-0002-HYBRID-PLATFORM.md), [Ownership](ADR-0003-RESOURCE-IDENTITY-OWNERSHIP.md), [AGENTS](../../AGENTS.md)

## Actors and trust levels

| Actor | Identity | Default authority |
| --- | --- | --- |
| Human admin/operator/developer | authenticated Core session, future OIDC principal | scoped product operations by role and target |
| Managed Host Agent | per-Node enrolled machine identity | explicitly advertised capability set and bounded target |
| K8s integration | cluster identity and constrained credentials | read or write only through designated external owner |
| Ops Agent / HolmesGPT | distinct workload identity | read-only investigation over scoped tools |
| Notebook/low-code/RAG app | independent untrusted application identity | its own data and explicitly exposed integration APIs |
| Third-party content/logs | untrusted input, not an actor | **zero** authority to change instruction or policy |

Important: an app accessible through GPUPanel does not automatically inherit Portal SSO/RBAC. Shared Docker networking does not imply a shared trusted identity. Agent persona/name or prompt text is not an authority boundary.

## Future Node enrollment

1. Platform operator generates a one-time, short-lived enrollment secret bound to intended project/node context.
2. Node proves possession and obtains a distinct, renewable machine identity; store secrets server-side, never in catalog manifests.
3. Host inventory/observations carry node_id + timestamp + agent version/capabilities and a bounded freshness indication.
4. Revoke and rotate identity without requiring the agent to execute privileged cleanup blindly.
5. Offline node is UNKNOWN or UNREACHABLE. Reconnected agent reports observed state before accepting new mutations.

Enrollment/secret formats are **not** frozen here. No new listener or credential store is authorized by this ADR.

## Exact operation contract

Every risky mutation must bind:

- actor identity, project/resource scope and delegated machine capability;
- operation_id + frozen target resource ID + expected revision/generation;
- normalized typed action + validated parameters (no user-generated arbitrary shell);
- scope-aware policy decision and explicit approval ID tied to action digest where required;
- timeout, retry/idempotency policy, cancellation and data-retention behavior;
- real executor response **and** subsequent independently observed result.

Suggested durable statuses: PROPOSED, WAIT_APPROVAL, PREPARED, APPLYING, UNKNOWN, OBSERVING, VERIFIED, FAILED/REJECTED. These are language for cross-project mapping; **do not create duplicate state machines** if the Host or agent-control-plane already owns equivalent states.

Use agent-control-plane's PlanAuthorizationBinding/CAS/fencing/evidence protocol by adapter when its required capabilities become available. Keep that project independent and do not assume that a passed policy check proves an actual side effect or final outcome.

## Agentic Ops boundary

- UI bottom-right AI chat is optional; unavailable HolmesGPT/model must show unavailable, not fabricated content.
- Ops Agent may retrieve scoped metrics, logs, relevant recent changes, inventory and Incident history through explicit read tools; redact secrets and bound time, output size and rate.
- The model can propose a fix or draft a plan, **never** directly approve a firewall, delete, restart or obtain Host Root as a side effect of text.
- Untrusted log content, RAG documents and browser content cannot forge a system event, approval or new memory authority.
- Auto-review/secondary LLM checks may add a defense layer, but deterministic backend policy is authoritative.
- Every user-facing claim links to observed evidence IDs or marks uncertainty; an LLM explanation is not independent proof.

## Data / audit / observability

Use existing stores where possible; do not require a new Kafka/Temporal/PostgreSQL cluster in Host P0. For future enterprise: a central product metadata store indexes references; business apps retain their own databases. Trace IDs should connect Node, Installation, Incident, Investigation, Operation and Evidence without copying sensitive raw logs to arbitrary model providers.

Redact secrets in browser, logs, traces and exported bundles. Backup audit stores and practice restore; do not describe append-only app DB rows as cryptographically immutable by default.

## Negative acceptance scenarios

1. Cross-project user attempts to read another Workspace, model endpoint or host logs: denied by backend, not merely hidden in UI.
2. Replayed approval with modified target/action/parameters: denied.
3. Agent disconnect or lost ACK after a write: operation becomes UNKNOWN pending safe reconciliation; no unbounded blind replay.
4. Unauthorized AI tries to modify firewall/OpenResty, run arbitrary root shell, access docker.sock or export credentials: denied.
5. Stale GPU/Node observation: shown as stale/unknown, not a confirmed free device.
6. Portal dies while app is healthy: app stays running; Portal recovers observed status after restart.
7. RAG prompt injection in retrieved document or Docker log: treated as data, never an escalated instruction.

## Stage gate

G3 safe install, G4 real auth/Host, G5 Docker/App and G6 recovery must be proven independently before the product is called installable/enterprise ready. Subsequent Host Fleet and cluster integrations need dedicated authentic end-to-end negative tests; docs alone are not an acceptance result.
