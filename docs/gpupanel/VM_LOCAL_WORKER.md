# Experimental same-UID VM worker (no browser privileges)

## Purpose
A locally started normal-user Unix Socket worker reuses the existing
`scripts/gpupanel-vm.py` and its explicit libvirt VM enrollment, lock,
operation journal, state checks and UNKNOWN replay prevention. The worker
does not run as root and cannot be used by Core's root identity, another
Linux UID, an HTTP caller, or a remote control-plane request.

It is a stepping stone toward an independently authorized user-session
executor, **not** a Core execution-grant system. The NativePrincipal proof
from Draft #188 explicitly remains `executionAuthorized=false`.

## Operator workflow
Requires Ubuntu login with `XDG_RUNTIME_DIR=/run/user/$(id -u)`.
The local account must already have appropriate libvirt read/manage permission.
For system VM writes, manually enroll a specific VM using Draft #187's CLI
and exact UUID/name/system confirmation. Neither this worker nor the CLI
configures permissive Polkit rules, installs packages or calls sudo.

```bash
# Terminal 1: default safe, no lifecycle writes
python3 scripts/gpupanel-vm-worker.py --system serve

# Terminal 2: same real Linux UID
python3 scripts/gpupanel-vm-worker.py --system call list
python3 scripts/gpupanel-vm-worker.py --system call show <exact-uuid>

# Explicitly restart Terminal 1 with limited lifecycle opt-in:
python3 scripts/gpupanel-vm-worker.py --system serve --allow-lifecycle

# Authorized + enrolled VM only (no delete, enroll or reconcile socket routes)
python3 scripts/gpupanel-vm-worker.py --system call start <exact-uuid>
python3 scripts/gpupanel-vm-worker.py --system call shutdown <exact-uuid>
python3 scripts/gpupanel-vm-worker.py --system call reboot <exact-uuid>
```

`qemu:///session` (default) and `qemu:///system` (`--system`) have
separate `session.sock` and `system.sock` under
`/run/user/<UID>/gpupanel-vm/`. Unix peer UID is checked by Linux
`SO_PEERCRED`. The private listener refuses root/other UID, disallows
arbitrary guest shell, remote libvirt connection URIs, delete/undefine,
filesystem and networking operations and accepts at most 1024 input bytes.
Only one bounded operation runs at a time.

`status=OK` means the worker delivered the call and returned the CLI
result. It does not mean the VM fully booted or shut down; inspect
`data.outcome` (`OBSERVED`, `PENDING`, etc.). A lost response may
follow a real side effect. **Never automatically retry**; use the direct
CLI and its persistent journal for reconciliation. A crash can leave a
stale socket; only after independently checking the old process exited,
the operator may remove the stale socket manually.

## Verification
```bash
python3 -m py_compile scripts/gpupanel-vm-worker.py
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_vm_*.py' -v
python3 scripts/gpupanel-vm-worker.py --help
```

All unit tests use fake VM clients and Unix socket pairs; CI does not
mutate any host VM. **NOT RUN:** disposable real Ubuntu 24.04 normal-UID
worker → libvirt system VM → Polkit denial/success; manual guest reset
after lost socket acknowledgement; cross-UID real process E2E; browser
credential rotation/invalidation; actual React VM control. M0 G3–G6
remains NO-GO. Rollback removes the new worker only; NEVER remove guest
VMs, disks, existing enrollment files or journals.
