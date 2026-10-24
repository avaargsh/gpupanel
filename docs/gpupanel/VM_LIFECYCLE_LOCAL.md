# GPUPanel local VM lifecycle — first safe slice

## Decision

Use **QEMU/KVM + libvirt**, not custom QEMU process management. For the first
unprivileged workstation slice default to `qemu:///session` with an explicit,
operator-approved `qemu:///system` mode. Create/import and
console should use existing **Cockpit Machines** or **virt-manager**, as these
mature tools already handle image selection, disk pools, firmware, networking,
installation and graphical consoles. The GPUPanel CLI is intentionally a narrow
companion for controlled lifecycle commands, not a replacement for Cockpit.

Mature references: <https://github.com/cockpit-project/cockpit-machines>,
<https://www.libvirt.org/manpages/virsh.html>,
<https://linuxcontainers.org/incus/docs/main/howto/instances_manage/>.

## Workflow (normal local Linux user, no sudo)

Prerequisites: a configured personal libvirt `qemu:///session` connection and
`virsh` on a Linux desktop. The optional GUI can be installed and used separately.

```bash
python3 scripts/gpupanel-vm.py doctor
python3 scripts/gpupanel-vm.py list
python3 scripts/gpupanel-vm.py show <uuid>
# Register **your** VM only after checking name and exact UUID in list.
python3 scripts/gpupanel-vm.py enroll <uuid> --confirm-name '<exact name>'
python3 scripts/gpupanel-vm.py start <uuid>
python3 scripts/gpupanel-vm.py shutdown <uuid>
python3 scripts/gpupanel-vm.py reboot <uuid>
# On ambiguous/pending outcome, inspect with show before explicit reconciliation:
python3 scripts/gpupanel-vm.py show <uuid>
python3 scripts/gpupanel-vm.py reconcile <uuid>
# If the desired state was not observed, only after manual VM inspection:
python3 scripts/gpupanel-vm.py reconcile <uuid> --acknowledge-unknown
# Deletion is deliberately definition-only, requires shut off + confirmation:
python3 scripts/gpupanel-vm.py delete <uuid> --confirm-name '<exact name>'
```

The CLI emits small JSON responses, including observed state and operation ID.
It never prints raw libvirt error output (which may contain private filesystem
paths). The CLI is local-only: **there is no HTTP route, browser button, remote
Agent permission, sudo fallback, or unattended mutation in this slice**.

## Explicit system VM mode (no sudo, no silent bulk adoption)

`qemu:///system` is privileged **shared host** virtualization, unlike a
personal `qemu:///session` connection. A normal Linux user must already have
libvirt *monitor* privileges for read-only discovery and separate *manage*
privileges (commonly via Polkit) to mutate any system domain. This CLI never
changes `/etc/libvirt`, adds users to the `libvirt` group, installs permissive
Polkit rules, or calls `sudo`. If authorization is absent, the operation is
refused; ask a host administrator to approve a narrow, reviewed delegation.

```bash
python3 scripts/gpupanel-vm.py --system doctor
python3 scripts/gpupanel-vm.py --system list
python3 scripts/gpupanel-vm.py --system show <exact-uuid>
# Confirm only a specifically chosen system domain after verifying name and UUID.
python3 scripts/gpupanel-vm.py --system enroll <exact-uuid> \
  --confirm-name '<exact VM name>' \
  --confirm-system 'MANAGE qemu:///system'
python3 scripts/gpupanel-vm.py --system start <exact-uuid>
python3 scripts/gpupanel-vm.py --system shutdown <exact-uuid>
python3 scripts/gpupanel-vm.py --system reboot <exact-uuid>
# A lost response / reboot leaves an unresolved operation. Inspect first.
python3 scripts/gpupanel-vm.py --system show <exact-uuid>
python3 scripts/gpupanel-vm.py --system reconcile <exact-uuid> --acknowledge-unknown
# ACKNOWLEDGED_UNVERIFIED only releases the CLI fence; it does not prove reboot.
# Only if shut off and independently backed up as needed: undefine, KEEP disks.
python3 scripts/gpupanel-vm.py --system delete <exact-uuid> \
  --confirm-name '<exact VM name>' \
  --confirm-system 'MANAGE qemu:///system'
```

The system mode's enrollment/journal/lock is isolated under the same user's
`$XDG_STATE_HOME/gpupanel/vms/system`, never reusing session enrollment, and
records the chosen connection alongside the VM UUID. Existing v1 session
records remain session-only. Queries use `virsh --readonly`; writes still
require libvirt/Polkit authorization. The `--system` flag must be explicit on
every system action. Any native Cockpit/virt-manager/root action or another
user's CLI can race with this local journal; **this is not an exclusive host
lock or proof of ownership of preexisting shared guests**. GPUPanel never
touches un-enrolled domains. No automatic deletion, disk wipe or forced poweroff.

Official references: <https://libvirt.org/auth.html>,
<https://libvirt.org/aclpolkit.html>,
<https://libvirt.org/uri.html>,
<https://www.libvirt.org/manpages/virsh.html>.

## Trust boundaries and failure contract

- Local process uses current non-root UID, only explicit local libvirt URIs;
  remote libvirt, `sudo`, arbitrary guest shell and direct QEMU commands are
  not reachable. System VM mutation needs explicit adoption + libvirt permission.
- List/show may observe all domains visible through the chosen connection;
  actions require exact UUID enrollment and an exact name confirmation when
  enrolling. Enrollment is scoped to the invoking OS account; it is not proof
  of multiuser Core identity nor host-level exclusive ownership.
- Only one operation at a time using an owned lock. An append-only local
  JSONL journal records intent before calling `virsh` (fsync) and outcome
  after. Unknown/pending results block the next mutation until explicitly
  inspected and reconciled. There is **no automatic retry** after lost ACK.
- Start/shutdown are graceful. Only observed **target states** (`running` for
  start and `shut off` for shutdown) count as `OBSERVED`; intermediate `paused`,
  `crashed`, `in shutdown` or unchanged states remain `PENDING` and block a
  further mutation. This proves the libvirt state, not in-guest application
  readiness. Reboot always remains pending: `running` → `running` does not prove
  the guest actually rebooted.
- Delete only calls `virsh undefine <uuid> --keep-nvram`; never removes guest
  disks or runs `destroy`. It requires `shut off` and exact name confirmation.
  Independently observes UUID absence in the same session before considering
  the definition gone. System deletion also needs the typed system-control
  confirmation. Deletion of image files is deliberately unsupported.
- Enrollment and operation files are held under the invoking user's private
  `$XDG_STATE_HOME/gpupanel/vms` for session and `/vms/system` for system.
  Files and operation locks reject symlinks, wrong owner and shared permissions;
  these are local operator recovery evidence, not a Core multi-user database.
- `reconcile` checks the current libvirt state under the operation lock. It
  records `OBSERVED` only when the prior start/shutdown's **expected target**
  state is now independently visible, or when a prior delete's exact UUID is
  absent from the same libvirt connection. Otherwise the local operation fence
  stays blocked until an operator explicitly supplies `--acknowledge-unknown`;
  this returns `ACKNOWLEDGED_UNVERIFIED`, not success, and writes that fact to
  the durable journal. System scope always requires this explicit flag for
  reconciliation. A reboot cannot be certified by a same-state read, even
  after acknowledgement. **Do not repeat an ambiguous mutation without an
  independent guest/operator health check.**

## Tests and gaps

Run: `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_vm_*.py' -v`.
Session + system negative contract tests use fake libvirt; they do **not** prove
real host Polkit authorization, UI login identity or KVM lifecycle. System
adoption, UUID isolation, command invocation, failure handling and journal
file-mode hardening are tested without mutating host VMs.

**NOT IMPLEMENTED**: create/import from GPUPanel, guest console, snapshots,
network/storage wizard, IP/guest-agent metrics, Core Session/CSRF binding,
frontend navigation, remote delegation, scheduler or Core-managed system VMs.
Future work should reuse Cockpit/libvirt-dbus rather than a parallel VM daemon,
and only enable Core/API mutations once Linux principal delegation and durable
operation ownership are independently authenticated and integration tested.

**NOT RUN**: disposable Ubuntu `qemu:///session` and `qemu:///system` end-to-end
(create via Cockpit → enroll → start → guest observed running → graceful
shutdown → reboot → simulated lost ACK → safe definition-only deletion with
disk retained); real unprivileged Polkit monitor/manage denial, unrelated
system-guest protection, cross-UID isolation and browser UX/accessibility. GPUPanel M0 G3–G6 remains NO-GO.

Rollback: remove this standalone CLI and documentation; there is no schema or
service migration. Do **not** remove `$XDG_STATE_HOME/gpupanel/vms` without
first reviewing operation journal and enrolled VM identities.
