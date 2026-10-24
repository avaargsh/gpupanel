# GPUPanel local VM lifecycle — first safe slice

## Decision

Use **QEMU/KVM + libvirt**, not custom QEMU process management. For the first
unprivileged workstation slice use only `qemu:///session`. Create/import and
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
# Deletion is deliberately definition-only, requires shut off + confirmation:
python3 scripts/gpupanel-vm.py delete <uuid> --confirm-name '<exact name>'
```

The CLI emits small JSON responses, including observed state and operation ID.
It never prints raw libvirt error output (which may contain private filesystem
paths). The CLI is local-only: **there is no HTTP route, browser button, remote
Agent permission, sudo fallback, or unattended mutation in this slice**.

## Trust boundaries and failure contract

- Local process uses current non-root UID; `qemu:///system`, remote libvirt,
  `sudo`, arbitrary guest shell and direct QEMU commands are not reachable.
- List/show may observe existing user-session VMs; actions require explicit
  enrollment of the exact UUID and an exact name confirmation. Enrollment is
  scoped to the invoking OS account; it is not proof of multiuser Core identity.
- Only one operation at a time using an owned lock. An append-only local
  JSONL journal records intent before calling `virsh` (fsync) and outcome
  after. Unknown/pending results block the next mutation until explicitly
  inspected and reconciled. There is **no automatic retry** after lost ACK.
- Start/shutdown are graceful. Reboot is treated as pending because a running
  state after a reboot request does not prove the guest completed a cycle.
- Delete only calls `virsh undefine <uuid> --keep-nvram`; never removes guest
  disks or runs `destroy`. It requires `shut off` and exact name confirmation.
  Independently observes UUID absence in the same session before considering
  the definition gone. Deletion of image files is deliberately unsupported.
- Enrollment and operation files are held under the invoking user's private
  `$XDG_STATE_HOME/gpupanel/vms` (or `~/.local/state/gpupanel/vms`). These are
  for local operator recovery; not an authoritative Core multi-user database.
- `reconcile` acknowledges an unresolved state after the operator has viewed
  `show`; it is **not** a cryptographic attestation or proof of guest health.

## Tests and gaps

Run: `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_vm_lifecycle.py' -v`.
These are pure mocked-libvirt negative tests and do not prove real KVM.

**NOT IMPLEMENTED**: create/import from GPUPanel, guest console, snapshots,
network/storage wizard, IP/guest-agent metrics, Core Session/CSRF binding,
frontend navigation, remote delegation, scheduler or system-level VM control.
Future work should reuse Cockpit/libvirt-dbus rather than a parallel VM daemon,
and only enable Core/API mutations once Linux principal delegation and durable
operation ownership are independently authenticated and integration tested.

**NOT RUN**: disposable Ubuntu `qemu:///session` end-to-end (create via
Cockpit → enroll → start → guest observed running → graceful shutdown →
reboot → simulated lost ACK → safe definition-only deletion with disk retained),
operator/UID denial and browser UX/accessibility. GPUPanel M0 G3–G6 remains NO-GO.

Rollback: remove this standalone CLI and documentation; there is no schema or
service migration. Do **not** remove `$XDG_STATE_HOME/gpupanel/vms` without
first reviewing operation journal and enrolled VM identities.
