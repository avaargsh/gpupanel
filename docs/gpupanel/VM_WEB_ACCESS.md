# VM Web readiness / no-execution contract

This is a read-only UI/API gate independent of Draft PR #185/#187.
Only GET /api/v1/core/vms/access is added. It reuses the existing
Core local Web session, verified session digest and optional kernel
SO_PEERCRED UID proof; disabled listener fails closed as HTTP 503.

A successful response ALWAYS has qemu:///system,
libvirtAuthorization=NotAssessed, inventoryAuthorized=false and
executionAuthorized=false. A kernel-proved UID, even from an admin session,
does not grant virtual machine control. Browser and Core cannot invoke virsh.

The UI shows loading/error/remote blocked states, a link to existing local
proof pairing and an instruction for authorized normal-user local CLI use.
No VM list or mutation button is presented; no new daemon, polkit policy,
database table or Agent route exists.

Future prerequisite: independently verified browser→Linux UID delegation,
per-UUID/action/connection/nonce/expiry grant, narrow Polkit/libvirt
authorization, durable audit/replay/UNKNOWN fences, isolated Ubuntu real
KVM acceptance and negative cross-UID/remote tests.

Verification: cd core && go test ./app/api/v1 ./app/principalproof ./router
and cd frontend && pnpm typecheck && pnpm build.
Real libvirt/Polkit and browser E2E NOT RUN. Rollback reverses only source
and UI; no host VM or schema migration. GPUPanel M0 remains NO-GO.
