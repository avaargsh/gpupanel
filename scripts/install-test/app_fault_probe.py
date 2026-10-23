"""Bounded live AppInstall recovery probes with fixed failure categories.

The caller owns the authenticated browser page and the guest/API I/O and
injects it. This module owns only the deliberate ordering, the bounded
read-only polling, the Docker freeze/resume invariant and the privacy-safe
token vocabulary. Nothing here retries a possibly accepted mutation,
authorizes release or prints response values, identities, names or errors.
"""
from __future__ import annotations

import time

import app_evidence_codes

# The product deliberately fails closed on a stale master socket after an
# unclean crash (agent/server/server.go). Removing it here is explicit
# fixture-operator recovery in a disposable VM, never an automatic product
# retry or cleanup path.
STALE_SOCKET_CLEANUP = """import os,socket,stat
p='/etc/gpupanel/agent.sock'
info=os.lstat(p)
assert stat.S_ISSOCK(info.st_mode) and info.st_uid==0
s=socket.socket(socket.AF_UNIX);s.settimeout(1)
refused=False
try:
 s.connect(p)
except ConnectionRefusedError:
 refused=True
finally:
 s.close()
assert refused
os.unlink(p)
"""


def _token(name: str, category: str) -> None:
    print(name + "=" + category + " release=NO_GO", flush=True)


def raw_evidence(page, endpoint: str):
    """One read-only Core proxy GET with a fixed, never-raised shape."""
    return page.evaluate("""async ({endpoint}) => {
        const item = document.cookie.split('; ').find(
            v => v.startsWith('pcsrftoken=')
        );
        const csrf = item ? decodeURIComponent(
            item.slice('pcsrftoken='.length)) : '';
        let r;
        try {
            r = await fetch('/api/v1' + endpoint, {
                method: 'GET', credentials: 'include',
                headers: {'Content-Type': 'application/json',
                          'CurrentNode': 'local',
                          'X-CSRF-Token': csrf}
            });
        } catch (e) {
            return {http: 0, json: false, code: null, data: null};
        }
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        return {
            http: r.status,
            json: parsed !== null,
            code: parsed ? parsed.code : null,
            data: parsed ? parsed.data : null
        };
    }""", {"endpoint": endpoint})


def wait_evidence(page, endpoint: str, classify, success: str,
                  timeout: int) -> str:
    """Bounded read-only poll; returns the last fixed classification.

    While the Agent is down the Core proxy can answer with a non-JSON or
    error page; that is a transient readiness state, not permission to retry
    a mutation. Only this bounded wait tolerates such answers, and only the
    fixed classifier vocabulary may be returned or printed.
    """
    deadline = time.monotonic() + timeout
    last = "unavailable"
    while time.monotonic() < deadline:
        try:
            probe = raw_evidence(page, endpoint)
        except Exception:
            # A closed page or interrupted navigation is still just a
            # readiness failure inside this bounded loop; keep the last real
            # classification instead of inventing "malformed".
            probe = None
        if isinstance(probe, dict):
            last = classify(probe)
            if last == success:
                return last
        time.sleep(1)
    return last


def wait_restart_ready(page, install_id: int, task_id: str,
                       timeout: int = 75) -> None:
    """A clean Agent restart must return the same consistent evidence."""
    endpoint = f"/apps/installed/evidence/{install_id}"
    last = wait_evidence(
        page, endpoint,
        lambda probe: app_evidence_codes.classify_restart_fence(
            probe, install_id, task_id),
        "ok", timeout)
    if last != "ok":
        _token("G5_APP_RESTART_FENCE_CODE", last)
        raise RuntimeError("Agent restart lost AppInstall admission evidence")


def wait_fault_unknown(page, install_id: int, task_id: str,
                       timeout: int = 75) -> None:
    """An installation-time crash must leave a durably UNKNOWN outcome."""
    endpoint = f"/apps/installed/evidence/{install_id}"
    last = wait_evidence(
        page, endpoint,
        lambda probe: app_evidence_codes.classify_unknown_fence(
            probe, install_id, task_id),
        "unknown", timeout)
    if last != "unknown":
        _token("G5_APP_UNKNOWN_FENCE_CODE", last)
        raise RuntimeError("interrupted install was not durably marked UNKNOWN")


def wait_task_executing(request, task_id: str, timeout: int = 30) -> None:
    """The injected install must be observed Executing before the crash."""
    deadline = time.monotonic() + timeout
    last = "absent"
    while time.monotonic() < deadline:
        data = request("POST", "/logs/tasks/search", {
            "page": 1, "pageSize": 20, "type": "App",
            "status": "", "taskID": task_id,
        }, stage_hint="task-receipt")
        last = app_evidence_codes.classify_inflight_receipt(data, task_id)
        if last == "executing":
            return
        time.sleep(.7)
    _token("G5_APP_INFLIGHT_CODE", last)
    raise RuntimeError("injected install was never observed in flight")


def _resume_docker(guest) -> None:
    # SIGCONT on a running daemon is a no-op, so a failed injection can never
    # leave the guest Docker daemon stopped.
    guest(["sudo", "systemctl", "kill", "--signal=SIGCONT", "docker"])


def inject(*, page, guest, guest_rc, guest_inventory, request, next_id,
           detail_id: int, name: str) -> dict:
    """Admit one install, kill the Agent mid-install, require durable UNKNOWN.

    Docker is stopped before the request, so the new task is admitted and
    observed Executing while its first Docker call blocks. The Agent and the
    whole unit cgroup are then SIGKILLed before the daemon resumes, so no
    further request can be sent. Returns {'installId': int, 'taskId': str}
    only after the UNKNOWN evidence, the no-retry recheck and the unchanged
    Docker inventory all held.
    """
    task_id = next_id()
    docker_before = guest_inventory()
    frozen = False
    try:
        frozen = guest_rc([
            "sudo", "systemctl", "kill", "--kill-whom=main",
            "--signal=SIGSTOP", "docker"]) == 0
        if not frozen or guest_rc([
                "timeout", "3", "docker", "version",
                "--format", "{{.Server.Version}}"]) == 0:
            _token("G5_APP_UNKNOWN_FENCE_CODE", "freeze-unavailable")
            raise RuntimeError("Docker daemon was not stopped and verified")
        created = request("POST", "/apps/install", {
            "appDetailId": detail_id, "name": name, "params": {},
            "taskID": task_id, "pullImage": False,
        }, stage_hint="install-admission")
        install_id = created.get("id") if isinstance(created, dict) else None
        if type(install_id) is not int or install_id <= 0:
            _token("G5_APP_UNKNOWN_FENCE_CODE", "malformed")
            raise RuntimeError("interrupted AppInstall row was not returned")
        wait_task_executing(request, task_id)
    except Exception:
        if frozen:
            _resume_docker(guest)
        raise
    try:
        # Still frozen: kill the process and the whole unit cgroup; never a
        # graceful stop that a blocked child could extend.
        guest(["sudo", "systemctl", "kill", "--kill-whom=main",
               "--signal=SIGKILL", "gpupanel-agent"])
        guest(["sudo", "systemctl", "kill", "--kill-whom=all",
               "--signal=SIGKILL", "gpupanel-agent"])
        guest(["sudo", "systemctl", "stop", "gpupanel-agent"])
    finally:
        _resume_docker(guest)
    time.sleep(3)
    guest(["sudo", "python3", "-c", STALE_SOCKET_CLEANUP])
    if guest_rc(["timeout", "10", "docker", "version", "--format",
                 "{{.Server.Version}}"]) != 0:
        _token("G5_APP_UNKNOWN_FENCE_CODE", "unavailable")
        raise RuntimeError("Docker daemon did not resume after the injection")
    guest(["sudo", "systemctl", "start", "gpupanel-agent"])
    wait_fault_unknown(page, install_id, task_id)

    # No automatic retry and no Docker side effects: after a bounded settle
    # the receipt must still be UNKNOWN, and the blocked first request (a read
    # sent to a stopped daemon) must not have changed Docker inventory.
    time.sleep(3)
    try:
        recheck = raw_evidence(page, f"/apps/installed/evidence/{install_id}")
    except Exception:
        recheck = None
    if (not isinstance(recheck, dict)
            or app_evidence_codes.classify_unknown_fence(
                recheck, install_id, task_id) != "unknown"):
        _token("G5_APP_UNKNOWN_FENCE_CODE", "not-unknown")
        raise RuntimeError("interrupted install was retried or resynced")
    after = guest_inventory()
    for key in ("containers", "networks", "volumes"):
        if after[key] != docker_before[key]:
            _token("G5_APP_UNKNOWN_FENCE_CODE", "side-effects")
            raise RuntimeError("interrupted install produced Docker resources")
    return {"installId": install_id, "taskId": task_id}


def verify_mutation_gate(*, page, guest_inventory, request, next_id,
                         install_id: int, task_id: str) -> None:
    """An UNKNOWN install may be inspected, never mutated.

    The allowed sync control must still succeed, while the forced delete must
    be a business refusal with unchanged inventory and the install still
    UNKNOWN. A 5xx HTTP answer is never treated as a refusal.
    """
    before = guest_inventory()
    control = request("POST", "/apps/installed/op", {
        "installId": install_id, "operate": "sync", "taskID": next_id(),
    }, raw_response=True, success=False, verify_rejection=False)
    if not (isinstance(control, dict) and control.get("http") == 200
            and control.get("code") == 200):
        _token("G5_APP_UNKNOWN_OP_FENCE_CODE", "control-unavailable")
        raise RuntimeError("UNKNOWN install inspection control was unavailable")
    refused = request("POST", "/apps/installed/op", {
        "installId": install_id, "operate": "delete", "forceDelete": True,
        "deleteImage": False, "taskID": next_id(),
    }, raw_response=True, success=False, verify_rejection=False)
    try:
        still = raw_evidence(page, f"/apps/installed/evidence/{install_id}")
        still_unknown = (
            isinstance(still, dict)
            and app_evidence_codes.classify_unknown_fence(
                still, install_id, task_id) == "unknown")
    except Exception:
        still_unknown = False
    outcome = app_evidence_codes.classify_gate_refusal(
        refused, before, guest_inventory(), still_unknown)
    if outcome != "refused":
        _token("G5_APP_UNKNOWN_OP_FENCE_CODE", "delete-" + outcome)
        raise RuntimeError("UNKNOWN install mutation gate did not hold")
