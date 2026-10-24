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


# AppService.installWithHooks bootstraps this shared network before it
# creates the AppInstall row and TaskDB resourceID. Make it an explicit,
# verified fixture precondition before taking the fault-injection baseline;
# never mask network inventory changes after the baseline.
DEFAULT_DOCKER_NETWORK = "gpupanel-network"
FAULT_INIT_ENTERED = "/run/gpupanel-g5-init-entered"
FAULT_INIT_RELEASE = "/run/gpupanel-g5-init-release"


def _ensure_default_network(guest_rc) -> None:
    inspect = ["sudo", "timeout", "10", "docker", "network", "inspect",
               DEFAULT_DOCKER_NETWORK]
    if guest_rc(inspect) == 0:
        return
    guest_rc(["sudo", "timeout", "10", "docker", "network", "create",
              DEFAULT_DOCKER_NETWORK])
    if guest_rc(inspect) != 0:
        _token("G5_APP_UNKNOWN_FENCE_CODE", "fixture-network-unavailable")
        raise RuntimeError("shared Docker network fixture precondition unavailable")


def _wait_init_barrier(guest_rc, attempts: int = 30) -> bool:
    """Require the guest init script to prove it reached the blocking barrier."""
    for _ in range(max(0, attempts)):
        if guest_rc(["sudo", "test", "-f", FAULT_INIT_ENTERED]) == 0:
            return True
        time.sleep(1)
    return False


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
        category = "agent-evidence-unavailable" if last == "unavailable" else last
        _token("G5_APP_UNKNOWN_FENCE_CODE", category)
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


def _docker_is_frozen(guest_rc) -> bool:
    """Require both units inactive and the privileged Docker API unreachable.

    The guest SSH user has sudo but no docker group membership. Checking the
    API as that unprivileged user would report a permission denial even while
    Docker was still running, falsely declaring a successful fault injection.
    """
    probes = (
        ["sudo", "systemctl", "is-active", "--quiet", "docker.service"],
        ["sudo", "systemctl", "is-active", "--quiet", "docker.socket"],
        ["sudo", "timeout", "3", "docker", "version", "--format",
         "{{.Server.Version}}"],
    )
    return all(guest_rc(args) != 0 for args in probes)


def _wait_docker_ready(guest_rc, attempts: int = 20) -> bool:
    for _ in range(attempts):
        # The disposable VM's SSH user is only in the sudo group; do not
        # mistake Docker socket permission denial for a daemon recovery failure.
        if guest_rc(["sudo", "timeout", "3", "docker", "version", "--format",
                     "{{.Server.Version}}"]) == 0:
            return True
        time.sleep(1)
    return False


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
    _ensure_default_network(guest_rc)
    # Remove stale markers in this disposable guest before the new attempt;
    # the entered marker below must belong to this exact faulted installation.
    guest(["sudo", "rm", "-f", FAULT_INIT_ENTERED, FAULT_INIT_RELEASE])
    docker_before = guest_inventory()
    docker_stopped = False
    install_started = False
    agent_killed = False
    try:
        start_install_without_waiting(page, detail_id, name, task_id)
        install_started = True
        install_id = wait_task_executing(request, task_id)
        if not _wait_init_barrier(guest_rc):
            _token("G5_APP_UNKNOWN_FENCE_CODE", "init-barrier-not-reached")
            raise RuntimeError("fault fixture init barrier was not observed")
        docker_stopped = guest_rc([
            "sudo", "systemctl", "stop", "docker.service",
            "docker.socket"]) == 0
        if not docker_stopped or not _docker_is_frozen(guest_rc):
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
    if guest_rc(["sudo", "python3", "-c", STALE_SOCKET_CLEANUP]) != 0:
        _token("G5_APP_UNKNOWN_FENCE_CODE", "agent-socket-cleanup-unavailable")
        raise RuntimeError("stale Agent socket could not be safely cleared")
    if guest_rc(["sudo", "systemctl", "start", "docker.socket",
                 "docker.service"]) != 0:
        _token("G5_APP_UNKNOWN_FENCE_CODE", "docker-unit-start-unavailable")
        raise RuntimeError("Docker units did not start after the injection")
    if not _wait_docker_ready(guest_rc):
        _token("G5_APP_UNKNOWN_FENCE_CODE", "docker-api-unavailable")
        raise RuntimeError("Docker API did not become ready after the injection")
    # Snapshot only after Docker recovers and before Agent starts. Compare
    # against the same pre-admission baseline; no side effect is excluded.
    before_agent = guest_inventory()
    if guest_rc(["sudo", "systemctl", "start", "gpupanel-agent"]) != 0:
        _token("G5_APP_UNKNOWN_FENCE_CODE", "agent-start-unavailable")
        raise RuntimeError("Agent service did not restart after the injection")
    wait_fault_unknown(page, install_id, task_id)

    # No automatic retry and no Docker side effects: after a bounded settle
    # the receipt must still be UNKNOWN. The explicit entered marker was
    # observed before Docker stopped; strict inventory equality still checks
    # all containers, networks and volumes against the pre-admission baseline.
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
    categories = {
        "containers": "container-side-effects",
        "networks": "network-side-effects",
        "volumes": "volume-side-effects",
    }
    for key, category in categories.items():
        if after[key] != docker_before[key]:
            # Identify only fixed classes; never print resource IDs/names or
            # raw guest output, and never waive the strict equality assertion.
            if key == "networks":
                category = classify_network_drift(
                    docker_before, before_agent, after)
            _token("G5_APP_UNKNOWN_FENCE_CODE", category)
            raise RuntimeError("interrupted install produced Docker resources")
    return {"installId": install_id, "taskId": task_id}


def _network_name_map(snapshot: dict) -> dict[str, str] | None:
    """Parse private ID|name inventory without returning either value to CI."""
    records = snapshot.get("networks")
    if not isinstance(records, list):
        return None
    parsed = {}
    for record in records:
        if not isinstance(record, str) or record.count("|") != 1:
            return None
        network_id, name = record.split("|", 1)
        if not network_id or not name or name in parsed:
            return None
        parsed[name] = network_id
    return parsed


def classify_network_drift(before: dict, before_agent: dict, final: dict) -> str:
    """Locate the first persistent network divergence using fixed safe labels.

    Network IDs and names remain private to the probe. This classification
    narrows the phase and family of drift; it never waives strict equality.
    Older synthetic callers without ID|name records retain generic labels.
    """
    baseline = before["networks"]
    intermediate = before_agent["networks"]
    observed = final["networks"]
    if observed == baseline:
        return "ok"
    if intermediate != baseline:
        phase, changed_snapshot = "pre-agent", before_agent
        changed = intermediate
    else:
        phase, changed_snapshot = "post-agent", final
        changed = observed
    if len(changed) != len(baseline):
        return f"{phase}-network-count-drift"

    before_map = _network_name_map(before)
    changed_map = _network_name_map(changed_snapshot)
    if before_map is None or changed_map is None:
        return f"{phase}-network-identity-drift"
    baseline_names = set(before_map)
    changed_names = set(changed_map)
    if baseline_names != changed_names:
        return f"{phase}-network-membership-drift"

    differing = {
        name for name in baseline_names
        if before_map[name] != changed_map[name]
    }
    if not differing:
        return f"{phase}-network-identity-drift"
    builtin_names = {"bridge", "host", "none"}
    families = set()
    if differing & builtin_names:
        families.add("builtin")
    if "gpupanel-network" in differing:
        families.add("shared")
    if differing - builtin_names - {"gpupanel-network"}:
        families.add("custom")
    if len(families) > 1:
        return f"{phase}-mixed-network-identity-drift"
    if families == {"builtin"}:
        return f"{phase}-builtin-network-identity-drift"
    if families == {"shared"}:
        return f"{phase}-shared-network-identity-drift"
    if families == {"custom"}:
        return f"{phase}-custom-network-identity-drift"
    return f"{phase}-network-identity-drift"


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
