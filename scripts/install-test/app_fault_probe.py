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


def wait_task_executing(request, task_id: str, timeout: int = 30) -> int:
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
            for item in data["items"]:
                if isinstance(item, dict) and item.get("id") == task_id:
                    return item["resourceID"]
        time.sleep(.7)
    _token("G5_APP_INFLIGHT_CODE", last)
    raise RuntimeError("injected install was never observed in flight")


def start_install_without_waiting(page, detail_id: int, name: str,
                                 task_id: str) -> None:
    """Start the synchronous admission request while Docker is frozen.

    AppInstall calls Docker before returning its HTTP response. Keep that
    request in the browser event loop while the caller observes TaskDB via a
    separate read-only request, then kill the Agent before resuming Docker.
    The response is deliberately ignored and the mutation is never retried.
    """
    page.evaluate("""({detailId, name, taskId}) => {
        const item = document.cookie.split('; ').find(
            value => value.startsWith('pcsrftoken=')
        );
        const csrf = item ? decodeURIComponent(
            item.slice('pcsrftoken='.length)) : '';
        void fetch('/api/v1/apps/install', {
            method: 'POST', credentials: 'include',
            headers: {'Content-Type': 'application/json',
                      'CurrentNode': 'local', 'X-CSRF-Token': csrf},
            body: JSON.stringify({
                appDetailId: detailId, name, params: {}, taskID: taskId,
                pullImage: false
            })
        }).catch(() => {});
        return true;
    }""", {"detailId": detail_id, "name": name, "taskId": task_id})


def _start_docker(guest) -> None:
    guest(["sudo", "systemctl", "start", "docker.socket", "docker.service"])


def _kill_agent(guest_rc) -> None:
    for args in (
        ["sudo", "systemctl", "kill", "--kill-whom=main",
         "--signal=SIGKILL", "gpupanel-agent"],
        ["sudo", "systemctl", "kill", "--kill-whom=all",
         "--signal=SIGKILL", "gpupanel-agent"],
        ["sudo", "systemctl", "stop", "gpupanel-agent"],
    ):
        if guest_rc(args) != 0:
            raise RuntimeError("could not terminate the in-flight Agent task")


def inject(*, page, guest, guest_rc, guest_inventory, request, next_id,
           detail_id: int, name: str) -> dict:
    """Admit one install, kill the Agent mid-install, require durable UNKNOWN.

    The fixed fixture init script holds the fault-suffixed app after its
    AppInstall row and TaskDB receipt exist. The probe observes their exact
    identity, stops Docker, then SIGKILLs the Agent and unit cgroup before
    releasing the script. Returns {'installId': int, 'taskId': str} only
    after UNKNOWN evidence, no-retry recheck and unchanged Docker inventory.
    """
    task_id = next_id()
    docker_before = guest_inventory()
    docker_stopped = False
    install_started = False
    agent_killed = False
    try:
        start_install_without_waiting(page, detail_id, name, task_id)
        install_started = True
        install_id = wait_task_executing(request, task_id)
        docker_stopped = guest_rc([
            "sudo", "systemctl", "stop", "docker.service",
            "docker.socket"]) == 0
        if not docker_stopped or guest_rc([
                "timeout", "3", "docker", "version",
                "--format", "{{.Server.Version}}"]) == 0:
            _token("G5_APP_UNKNOWN_FENCE_CODE", "freeze-unavailable")
            raise RuntimeError("Docker daemon was not stopped and verified")
        _kill_agent(guest_rc)
        agent_killed = True
    finally:
        if install_started and not agent_killed:
            try:
                _kill_agent(guest_rc)
            finally:
                if docker_stopped:
                    _start_docker(guest)
        elif docker_stopped:
            _start_docker(guest)
    time.sleep(3)
    guest(["sudo", "python3", "-c", STALE_SOCKET_CLEANUP])
    if guest_rc(["timeout", "10", "docker", "version", "--format",
                 "{{.Server.Version}}"]) != 0:
        _token("G5_APP_UNKNOWN_FENCE_CODE", "unavailable")
        raise RuntimeError("Docker daemon did not resume after the injection")
    guest(["sudo", "systemctl", "start", "gpupanel-agent"])
    wait_fault_unknown(page, install_id, task_id)

    # No automatic retry and no Docker side effects: after a bounded settle
    # the receipt must still be UNKNOWN; the init barrier prevented Compose
    # from issuing Docker operations before the daemon stopped.
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
