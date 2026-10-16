# Repository security-architecture audit (evidence-backed, bounded)

Date: 2026-10-16. Source base: `f5bb5342dbf6c9ab14a96ed2deca6d4d0dd9f6c8`
(worktree clean at start). Method: bounded read-only static sampling of
frontend/core/agent/backend/catalog/scripts/.github critical paths plus existing
test inventory. **No service was started; no test suite was executed (see NOT
RUN).** This is a prioritization audit, not a security certification. Scope note:
the product is an intentional single-Ubuntu admin host; admin-only endpoints are
expected, and no multi-tenancy claim is made or audited (AGENTS.md §1.4).

## Coverage actually sampled (path:line)

- Auth/session/CSRF: `core/middleware/session.go:15-75`,
  `core/middleware/csrf_protect.go:14-68`, `core/middleware/ip_limit.go:14-70`,
  `core/middleware/password_expired.go:26,46`
- Proxy trust boundary (Core→Agent UDS): `core/init/router/proxy.go:41-119`,
  `core/init/router/proxy_evidence_auth_test.go:32,105`
- API keys: `core/app/service/api_key.go:470-539`, `core/app/auth/*.go`
- Privileged command entry: `core/utils/terminal/local_cmd.go:28-43`,
  `core/utils/cmd/cmdx.go:223,305`, `agent/utils/terminal/host_shell.go:21`,
  `agent/utils/cmd/cmdx.go:330-337`, `agent/app/service/container.go:872-875`
- DB clients (secret handling): `agent/utils/mysql/client/local.go:304`,
  `agent/utils/postgresql/client/local.go:153`
- File path safety: `agent/utils/files/path_filter.go:7-45`,
  `agent/utils/files/file_op.go:1334,1389,1351,1408`
- Audit/idempotency: `core/middleware/operation.go:31-130`,
  `agent/app/repo/task_restart_recovery_test.go:73`
- Release/migration gates: `scripts/gpupanel-release.py`, 37
  `.github/workflows/*`, `core/init/migration/migrations/`,
  `agent/init/migration/migrations/`
- Frontend API base: `frontend/apps/panel/src/api/baseApi.ts:24`,
  `frontend/apps/panel/src/api/aiApi.ts:396`
- Test inventory: 41 `*_test.go` files (10 in core, 31 in agent)

## Findings (prioritized; I=Impact, R=Risk, E=Effort, 1-5)

### F1 — Local-sync header grants `LOCAL_REQUEST` without verifying any secret
Class: **confirmed defect** (guard never validates the token it reads).
I4 R4 E2 — `core/middleware/ip_limit.go:16-22,56-69`.
`isLocalSyncRequest` sets `LOCAL_REQUEST=true` for any loopback caller sending
**any non-empty** `X-Panel-Local-Token` on `/api/v1/core/xpack/sync/ssl` and
`/api/v1/core/settings/ssl/reload`. That flag bypasses `SessionAuth`
(`session.go:18`), `CSRFTokenGuard` (`csrf_protect.go:36`) and
`PasswordExpired` (`password_expired.go:26`) for those paths. `ReloadSSL`
re-checks loopback itself (`core/app/api/v1/setting.go:418-423`) so remote
exploitation requires loopback or SSRF-to-loopback; the header value is never
compared to a stored secret anywhere (`grep X-Panel-Local-Token` = 1 hit).
Actor: any local process or SSRF gadget. Preconditions: TCP loopback reachability.
Denial test: **none** (no test asserts wrong/empty token rejection).
Next fix owner: core security slice. Acceptance: compare header against a
per-install random secret (0600 file or session-bound), constant-time; negative
tests: loopback + wrong/empty token -> 403; loopback + correct token stays
working; CSRF/session tests updated.

### F2 — MySQL root password passed in process argv
Class: **confirmed defect** (secret exposure on shared host).
I3 R3 E2 — `agent/utils/mysql/client/local.go:304` builds
`docker exec -i <c> <mysql> -uroot -p"+r.Password ...`; any local user can read
it via `/proc/<pid>/cmdline` during dump/restore. Postgres sibling uses
`-e PGPASSWORD=` (`postgresql/client/local.go:153`, env, not argv — better but
still `docker inspect`-visible). Actor: unprivileged local user.
Denial test: none. Next fix owner: agent database slice. Acceptance: password
supplied via 0600 temp defaults-file or stdin; test asserts argv contains no
secret (probe `/proc/self` style or exec-wrapper capture).

### F3 — Core auth/CSRF/API-key logic has effectively no unit negative tests
Class: **missing evidence**. I4 R4 E3 — core ships 10 test files, all under
`init/router`, `middleware` (websocket origin only), `utils/geo`; **zero** tests
under `core/app/auth/` (`api_auth.go`, `api_key.go`, `api_key_legacy_lock.go`,
`api_key_panel.go`, `passkey.go`) and none for `CSRFTokenGuard`, `SessionAuth`,
`WhiteAllow`. The fingerprint/revision/IP-whitelist/revocation logic at
`core/app/service/api_key.go:470-539` is untested. Denial test existence: no.
Next fix owner: core auth slice. Acceptance: table-driven denial tests (no key,
wrong fingerprint, stale revision, revoked/expired key, IP outside whitelist ->
401/403) and CSRF-invalid -> 403 (`csrf_protect.go:22-28`) wired in CI.

### F4 — Core-side mutations lack evidence of operation identity/idempotency
Class: **missing evidence**. I3 R3 E3 — `core/middleware/operation.go:31-130`
records audit entries (with `redactCredentialSetting` at :99 — good), but no
core endpoint shows idempotency keys, bounded timeout or observed-outcome
receipts per AGENTS.md §1.5; `settings/upgrade`, `port/update` and
`ssl/update` return on desired state only. Agent side partially covers this
(`app_operation_status_test.go`,
`agent/app/repo/task_restart_recovery_test.go:73` — repeat restart keeps
outcome, good). Next fix owner: core operations slice. Acceptance: upgrade and
port-change endpoints emit operation IDs with independently observed end state
(desired vs observed separated per ROADMAP quality rule 2) plus replay/denial
tests.

### F5 — File path-safety filter exists but endpoint coverage is unproven
Class: **missing evidence** (positive control found). I4 R3 E3 —
`agent/utils/files/path_filter.go:18-45` denies `.ssh` material (with
`EvalSymlinks`) and `/.gpupanel_clash`; but the 1891-line
`agent/app/api/v1/file.go` and 2441-line `file_op.go` have no test proving every
read/write/rename/batch op routes through it. Actor: authenticated admin
(unprivileged if any non-admin session type exists later).
Denial test: filter function tested only indirectly at best.
Next fix owner: agent files slice. Acceptance: table test enumerating each file
API op asserting sensitive-path rejection (incl. symlink variant) in CI.

### F6 — `VITE_API_URL` override and AI provider credential flow unverified
Class: **risk**. I3 R2 E2 — `frontend/apps/panel/src/api/baseApi.ts:24` lets a
build-time env repoint every API call (phishing-build vector, low runtime
risk); `aiApi.ts:396` sends provider `baseURL`+`apiKey` mutations — storage,
redaction in operation logs/evidence unknown (swagger BodyKeys coverage of AI
paths unverified against `redactCredentialSetting`). Actor: build distributor /
authenticated user. Denial test: none. Next fix owner: frontend+core AI slice.
Acceptance: document where AI keys are stored (encrypted at rest or explicit
plaintext-with-risk ADR), confirm operation-log redaction covers those bodies,
add test.

### F7 — CSRF exemption list includes SAML ACS / OIDC finish without binding tests
Class: **missing evidence**. I3 R2 E1 — `csrf_protect.go:49-62` exempts
protocol callbacks (legitimate), but no test evidences RelayState/nonce/state
validation for those flows in this fork. Next fix owner: core auth slice
(same slice as F3). Acceptance: negative test per enabled provider, or a
documented N/A if providers are unreachable in this fork.

### F8 — Oversized inherited security-critical modules concentrate risk
Class: **risk prioritization only, no mechanical split** (AGENTS.md §1.2).
I2 R3 E4 — >500-line inherited files: `agent/app/service/firewall_utils.go`
(3067), `website.go` (2527), `file_op.go` (2441), `app_utils.go` (2295),
`container.go` (2112), `agent/app/api/v1/file.go` (1891),
`agent/init/migration/migrations/init.go` (1892),
`core/init/migration/migrations/init.go` (1397). `core/cmd/server/docs/docs.go`
(49725) is generated swagger — excluded from debt. Next fix owner: none
globally; per-slice rule: touched functions must not grow these files, split by
real domain responsibility when a slice is already open.

### F9 — Agent UDS trusts Core-supplied identity by design (accepted, documented)
Class: **accepted single-host risk with positive controls**. I4 R2 E1 —
`proxy.go:41-61` documents that browser headers are not an authority source,
clears forwarded headers (`proxy.go:65`, `terminalsession.ClearForwardedHeaders`)
and re-sets user from the verified session (`proxy.go:100-102`); app-evidence
paths additionally require a non-API-key admin session (`proxy.go:50-59`).
Socket dir hardening is tested (`agent/server/master_socket_test.go:93`,
symlink-reject). Residual risk: any process able to write the UDS has full host
control — standard for this architecture; keep UDS dir 0700 and re-verify in G4
VM gate. Denial tests exist for the proxy gate (proxy_evidence_auth_test.go).

### F10 — Migration/rollback evidence for installed data is absent (matches G3 blocker)
Class: **missing evidence, already tracked**. I4 R3 E4 — GORM migrations exist
(`core/init/migration/migrations/init.go`, `agent/.../init.go`) with tests only
for `bind_address`, `host_operations`, `vllm_metrics`; AGENTS.md local
integration contract states "existing installed data migration remains
unverified"; ROADMAP G3 = BLOCKED, G4-G6 = NOT RUN. Next fix owner: install
slice. Acceptance: disposable-VM forward+rollback migration with old/new data
read-back (AGENTS.md §3 schema rule).

### F11 — Release gates are honest at source level; no fake success found
Class: **confirmed good**. I2 R1 E1 — `scripts/gpupanel-release.py` has build
and verify stages; 37 workflows cover install-preflight, docker-smoke,
license/dependency audits, UDS evidence; docs consistently label preview
artifacts as non-installable. No docs-only delivery overclaim detected for
G3-G6. No action beyond keeping gates green.

## Explicit unknowns (not claimed either way)

- Runtime behavior (all flows verified statically only); TLS/session-expiry
  behavior under real browsers; passkey/OIDC/SAML runtime status.
- Whether every agent file op honors `ShouldFilterSensitivePath` (F5).
- AI provider key storage location/encryption (F6).
- `backend/` (new Apache hostmetrics/operation packages) is per
  AGENT_GO_MIGRATION.md "scheduled, not accepted"; not audited beyond contract.

## NOT RUN (honest record)

- `cd core && go test ./...` / `cd agent && go test ./...` — **NOT RUN**:
  15-minute bounded read-only audit; execution deferred to fix-owner slices.
- `cd frontend && pnpm typecheck && pnpm build` — NOT RUN (no frontend change).
- `python3 scripts/gpupanel-release.py build/verify` — NOT RUN (no packaging
  change; VM G3 gates remain blocked per ROADMAP).
- No credentials scanning with values, no service startup, no host mutation.

## Recommended next implementation slice (order)

1. F1 local-token verification + denial tests (small, closes an auth gap).
2. F3 core auth/API-key negative tests (unblocks confidence for every later slice).
3. F2 argv password removal (small, closes a secret exposure).
4. F5 file-op path-safety table tests; then F4 upgrade/port observed-outcome
   receipts. F6/F7 ride along with auth and AI slices. F10 stays with install
   (G3) work. Root GPL license unchanged; any new Go packages in this direction
   remain independent Apache-2.0 source candidates per AGENT_GO_MIGRATION.md.
