#!/usr/bin/env python3
"""Actual GPUPanel AppInstall Core→Agent→TaskDB→Docker in one owned Ubuntu VM.

Requires the same clean source, installed browser acceptance and recovered
Agent as preceding stages. Runs only an offline, network-isolated test app.
Never retries a possibly accepted mutation. Does not assert business health.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import time
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright
import candidate
import app_evidence_codes
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
    raise RuntimeError("G5 AppInstall requires the owned QEMU VM")
local = candidate.local_candidate(ROOT)
browser = json.loads((STATE / "browser-live.json").read_text())
candidate.verify_browser_chain(browser, local)
runtime = json.loads((STATE / "runtime-live.json").read_text())
compose = json.loads((STATE / "compose-live.json").read_text())
container = json.loads((STATE / "container-live.json").read_text())
guest_sha = browser["guest_machine_id_sha256"]
if not (
    runtime.get("candidate") == local
    and runtime.get("guest_machine_id_sha256") == guest_sha
    and runtime.get("explicit_fixture_operator_recovery") is True
    and compose.get("source_sha") == local["source_sha"]
    and compose.get("guest_machine_id_sha256") == guest_sha
    and container.get("candidate") == local
    and container.get("guest_machine_id_sha256") == guest_sha
    and container.get("steps", [])[-1:] == ["remove_with_independent_observation"]
):
    raise RuntimeError("G5 AppInstall requires same-candidate live precursor proof")

credentials = json.loads((STATE / "credentials.json").read_text())
if credentials.get("url") != f"http://127.0.0.1:{vm.PANEL_PORT}":
    raise RuntimeError("refuse remote Core origin")

APP_KEY = "localm0ciapp"
APP_NAME = "m0ciapp" + local["source_sha"][:10]
FIXTURE_IMAGE = "gpupanel-m0-fixture:local"


def guest(args: list[str], *, check=True) -> str:
    result = subprocess.run(
        vm.ssh_args() + [shlex.join(args)], capture_output=True,
        text=True, timeout=35,
    )
    if result.returncode and check:
        raise RuntimeError("guest fixture operation/observation failed")
    return result.stdout.strip() if result.returncode == 0 else ""


def fixture(action: str):
    # Only the fixed file tree, on the guest already bound to browser proof.
    guest(["sudo", "python3", "/tmp/app-fixture-guest.py",
           action, "--guest-sha", guest_sha])


def guest_inventory() -> dict:
    """Read-only guest DB and Docker inventory around the invalid-ID probe."""
    probe = """import json,sqlite3,subprocess
from pathlib import Path
db=Path('/opt/gpupanel/db')
def count(path,table):
 p=db/path
 c=sqlite3.connect('file:'+str(p)+'?mode=ro',uri=True)
 try:
  value=c.execute('SELECT COUNT(*) FROM '+table).fetchone()[0]
 finally:
  c.close()
 return value
def docker(*args):
 output=subprocess.check_output(['docker',*args],text=True,timeout=10)
 return sorted(x for x in output.splitlines() if x)
print(json.dumps({
 'apps':count('agent.db','app_installs'),
 'tasks':count('task.db','tasks'),
 'containers':docker('ps','-aq','--no-trunc'),
 'networks':docker('network','ls','-q','--no-trunc'),
 'volumes':docker('volume','ls','-q'),
},sort_keys=True))
"""
    raw = guest(["sudo", "python3", "-c", probe])
    values = json.loads(raw)
    if (
        type(values.get("apps")) is not int or values["apps"] < 0
        or type(values.get("tasks")) is not int or values["tasks"] < 0
        or any(not isinstance(values.get(key), list)
               or not all(isinstance(v, str) for v in values[key])
               for key in ("containers", "networks", "volumes"))
    ):
        raise RuntimeError("guest AppInstall admission inventory is not trustworthy")
    return values


local_image = guest(["sudo", "docker", "image", "inspect",
                     "--format", "{{.Id}}", FIXTURE_IMAGE])
if not local_image.startswith("sha256:") or len(local_image) != 71:
    raise RuntimeError("preexisting offline image unavailable")
fixture("prepare")
observed_ids = []
steps = []

with sync_playwright() as play:
    chrome = play.chromium.launch(headless=True)
    context = chrome.new_context()
    anonymous = chrome.new_context()
    unauth = anonymous.request.post(
        credentials["url"] + "/api/v1/apps/install",
        data={"name": APP_NAME, "appDetailId": 1, "taskID": str(uuid4())},
    )
    if not (unauth.status in (401, 403)
            or (unauth.status == 200 and unauth.json().get("code") != 200)):
        raise RuntimeError("anonymous AppInstall mutation unexpectedly accepted")
    anonymous.close()

    page = context.new_page()
    page.goto(credentials["url"] + "/" + credentials["entrance"])
    expect(page.locator('input[autocomplete="username"]')).to_be_visible()
    page.locator('input[autocomplete="username"]').fill(credentials["username"])
    page.locator('input[autocomplete="current-password"]').fill(credentials["password"])
    page.locator('button[type="submit"]').click()
    expect(page.get_by_role("heading", name="Workbench", exact=True)).to_be_visible(
        timeout=20000
    )

    def api_failure_stage(endpoint: str) -> str:
        # Only constant stage names may enter CI's redacted failure summary.
        # Never emit URLs, IDs, request bodies, response JSON or credentials.
        named = {
            "/apps/sync/local": "catalog-sync",
            "/logs/tasks/search": "task-receipt",
            "/apps/install": "install-admission",
            "/apps/installed/op": "uninstall-operation",
        }
        if endpoint in named:
            return named[endpoint]
        for prefix, stage in (
            ("/apps/detail/node/", "detail-lookup"),
            ("/apps/installed/evidence/", "resource-evidence"),
            ("/apps/installed/info/", "installed-info"),
        ):
            if endpoint.startswith(prefix):
                return stage
        return "unknown"

    def request(method: str, endpoint: str, body: dict | None = None,
                success=True, *, raw_response=False, verify_rejection=True,
                stage_hint: str | None = None):
        allowed_post = {
            "/apps/sync/local", "/apps/install", "/apps/installed/op",
            "/logs/tasks/search",
        }
        if method == "POST" and endpoint not in allowed_post:
            raise RuntimeError("unexpected mutating API requested")
        if method == "GET" and not (
            endpoint.startswith("/apps/detail/node/")
            or endpoint.startswith("/apps/installed/evidence/")
            or endpoint.startswith("/apps/installed/info/")
        ):
            raise RuntimeError("unexpected read API requested")
        response = page.evaluate("""async ({method, endpoint, body}) => {
            const item = document.cookie.split('; ').find(
                v => v.startsWith('pcsrftoken=')
            );
            const csrf = item ? decodeURIComponent(item.slice('pcsrftoken='.length)) : '';
            const r = await fetch('/api/v1' + endpoint, {
                method, credentials:'include',
                headers:{'Content-Type':'application/json',
                         'CurrentNode':'local', 'X-CSRF-Token':csrf},
                body:method==='POST' ? JSON.stringify(body) : undefined
            });
            const parsed = await r.json();
            return {http:r.status, code:parsed.code, data:parsed.data};
        }""", {"method": method, "endpoint": endpoint, "body": body})
        accepted = response.get("http") == 200 and response.get("code") == 200
        if success and not accepted:
            stage = api_failure_stage(endpoint)
            # Explicit call-site labels keep diagnostics useful if a route alias
            # or future endpoint spelling escapes the exact-path classifier.
            allowed_stages = {
                "catalog-sync", "task-receipt", "detail-lookup",
                "install-admission", "invalid-install-probe",
                "resource-evidence", "uninstall-operation", "installed-info",
            }
            if stage == "unknown" and stage_hint in allowed_stages:
                stage = stage_hint
            print("G5_APP_API_FAILURE_STAGE=" + stage +
                  " release=NO_GO", flush=True)
            raise RuntimeError("scoped Core App API refused the expected operation")
        if not success and accepted and verify_rejection:
            # Generic fail-closed guard for any read or mutation that was
            # expected to be refused. The uninstall removal observation is
            # deliberately excluded: the Agent answers an absent AppInstall
            # with HTTP 200 and status "Deleted" (see app_evidence_codes).
            raise RuntimeError("Core accepted a request that was expected to be refused")
        return response if raw_response else response.get("data")

    def await_task(task_id: str, scope: str, operation: str, timeout=85):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            data = request("POST", "/logs/tasks/search", {
                "page": 1, "pageSize": 20, "type": scope,
                "status": "", "taskID": task_id,
            }, stage_hint="task-receipt")
            items = data.get("items") if isinstance(data, dict) else None
            if items is not None and not isinstance(items, list):
                raise RuntimeError("TaskLog response was malformed")
            matches = [item for item in items or [] if item.get("id") == task_id]
            if len(matches) > 1:
                raise RuntimeError("duplicate TaskDB identity")
            if matches:
                item = matches[0]
                if item.get("type") != scope or item.get("operate") != operation:
                    raise RuntimeError("wrong TaskDB scope/action")
                if item.get("status") == "Success":
                    return
                if item.get("status") not in ("Executing", ""):
                    raise RuntimeError("TaskDB did not report successful terminal outcome")
            time.sleep(.7)
        raise RuntimeError("task outcome ambiguous; do NOT retry")

    def wait_agent_raw_ready(install_id: int, task_id: str, timeout=75) -> None:
        """Bounded read-only wait after an Agent restart, then require evidence.

        While the Agent is down the Core proxy can answer with a non-JSON or
        error page; that is a transient readiness state, not permission to
        retry a mutation. Only this bounded wait tolerates such answers. On
        timeout the last fixed classification is emitted instead of a raw
        response, identity or error body.
        """
        deadline = time.monotonic() + timeout
        last = "unavailable"
        while time.monotonic() < deadline:
            try:
                probe = page.evaluate("""async ({endpoint}) => {
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
                }""", {"endpoint":
                       f"/apps/installed/evidence/{install_id}"})
            except Exception:
                # A closed page or interrupted navigation is still just a
                # readiness failure inside this bounded loop; keep the last
                # real classification instead of inventing "malformed".
                probe = None
            if isinstance(probe, dict):
                last = app_evidence_codes.classify_restart_fence(
                    probe, install_id, task_id
                )
                if last == "ok":
                    return
            time.sleep(1)
        print("G5_APP_RESTART_FENCE_CODE=" + last + " release=NO_GO",
              flush=True)
        raise RuntimeError("Agent restart lost AppInstall admission evidence")

    def expect_duplicate_denied(label: str, body: dict) -> None:
        """Probe a duplicate admission deliberately; never retry the accepted install."""
        if label not in ("replay", "same-name"):
            raise RuntimeError("invalid duplicate fence label")
        before = guest_inventory()
        response = request("POST", "/apps/install", body, success=False,
                           raw_response=True, verify_rejection=False)
        code = app_evidence_codes.classify_duplicate_fence(
            response, before, guest_inventory()
        )
        if code != "denied":
            print("G5_APP_DUPLICATE_FENCE_CODE=" + label + "-" + code +
                  " release=NO_GO", flush=True)
            raise RuntimeError("duplicate AppInstall fence did not hold")

    sync_id = str(uuid4())
    request("POST", "/apps/sync/local", {"taskID": sync_id},
            stage_hint="catalog-sync")
    await_task(sync_id, "AppStore", "TaskSync")
    steps.append("real_local_catalog_sync")
    detail = request("GET", f"/apps/detail/node/{APP_KEY}/1.0.0",
                     stage_hint="detail-lookup")
    detail_id = detail.get("id") if isinstance(detail, dict) else None
    if type(detail_id) is not int or detail_id <= 0:
        raise RuntimeError("local catalog detail was not actually persisted")

    # Use a nonexistent detail so a broken/missing TaskID cannot deploy the
    # fixture app. A correct malformed-ID guard rejects before any TaskDB write;
    # if the proxy drops taskID, the inventory comparison catches any durable
    # receipt or Docker/AppInstall mutation. Never retry this mutation.
    inventory_before = guest_inventory()
    rejected = request("POST", "/apps/install", {
        "appDetailId": 2147483647, "name": APP_NAME,
        "params": {}, "taskID": "../invalid", "pullImage": False,
    }, success=False, raw_response=True, verify_rejection=False,
       stage_hint="invalid-install-probe")
    inventory_after = guest_inventory()
    if rejected.get("http") == 200 and rejected.get("code") == 200:
        raise RuntimeError("Core accepted a deliberately invalid AppInstall")
    if inventory_after != inventory_before:
        raise RuntimeError("invalid TaskID probe changed TaskDB/AppInstall or Docker inventory")
    steps.append("invalid_install_uuid_rejected_without_side_effects")

    install_task = str(uuid4())
    observed_ids.append(install_task)
    created = request("POST", "/apps/install", {
        "appDetailId": detail_id, "name": APP_NAME,
        "params": {}, "taskID": install_task, "pullImage": False,
    }, stage_hint="install-admission")
    install_id = created.get("id") if isinstance(created, dict) else None
    if type(install_id) is not int or install_id <= 0:
        raise RuntimeError("AppInstall row was not returned")
    await_task(install_task, "App", "TaskInstall")
    steps.append("real_appinstall_taskdb_success")

    evidence = request("GET", f"/apps/installed/evidence/{install_id}",
                       stage_hint="resource-evidence")
    evidence_code = app_evidence_codes.classify_app_install_evidence(
        evidence, install_id, install_task
    )
    if evidence_code != "ok":
        # Independent Docker observation; emit only a fixed, privacy-safe state.
        if evidence_code == "classification-container-state":
            entries = evidence.get("containers", [])
            container_name = entries[0].get("name") if entries else None
            docker_state = "unavailable"
            if isinstance(container_name, str) and container_name.startswith("GPUPanel-"):
                observed = guest(["sudo", "docker", "inspect", "--format",
                                  "{{.State.Status}}", container_name], check=False)
                if observed in ("running", "created", "exited", "restarting",
                                "paused", "removing", "dead"):
                    docker_state = observed
                elif observed:
                    docker_state = "other"
                else:
                    docker_state = "missing"
            print("G5_APP_DOCKER_STATE=" + docker_state +
                  " release=NO_GO", flush=True)
            # Cross-check by immutable local fixture image, independent of the
            # Evidence API's possibly incorrect Compose container name.
            fixture_ids = guest(["sudo", "docker", "ps", "-aq",
                                 "--filter", "ancestor=" + FIXTURE_IMAGE],
                                check=False).splitlines()
            fixture_count = "zero" if not fixture_ids else (
                "one" if len(fixture_ids) == 1 else "multiple")
            print("G5_APP_FIXTURE_CONTAINER_COUNT=" + fixture_count +
                  " release=NO_GO", flush=True)
            if len(fixture_ids) == 1:
                observed_by_id = guest(["sudo", "docker", "inspect", "--format",
                                        "{{.State.Status}}", fixture_ids[0]],
                                       check=False)
                safe_states = ("running", "created", "exited", "restarting",
                               "paused", "removing", "dead")
                by_id_state = observed_by_id if observed_by_id in safe_states else "unknown"
                print("G5_APP_FIXTURE_DOCKER_STATE=" + by_id_state +
                      " release=NO_GO", flush=True)

        # The CI summarizer may output ONLY this fixed category, not the
        # response object, the app name or the user/task/container identity.
        print("G5_APP_EVIDENCE_FAILURE_CODE=" + evidence_code +
              " release=NO_GO", flush=True)
        raise RuntimeError("AppInstall TaskDB/AppInstall/Docker evidence not consistent")
    name = evidence["containers"][0]["name"]
    if not isinstance(name, str) or not name.startswith("GPUPanel-"):
        raise RuntimeError("invalid fixture container name")
    image = guest(["sudo", "docker", "inspect", "--format", "{{.Image}}", name])
    network = guest(["sudo", "docker", "inspect",
                     "--format", "{{.HostConfig.NetworkMode}}", name])
    ports = guest(["sudo", "docker", "inspect",
                   "--format", "{{json .HostConfig.PortBindings}}", name])
    if image != local_image or network != "none" or ports not in ("null", "{}"):
        raise RuntimeError("offline Docker resource or network isolation invalid")
    steps.append("independent_running_image_and_network_evidence")

    # A clean Agent stop/start must not lose the completed TaskDB receipt,
    # the durable name claim or the read-only app evidence. The duplicate
    # probes below then run against the restarted process on reopened DBs.
    guest(["sudo", "systemctl", "restart", "gpupanel-agent"])
    wait_agent_raw_ready(install_id, install_task)
    steps.append("durable_admission_survives_agent_restart")

    # Two deliberate duplicate probes, not retries of the accepted install.
    # The first must hit the durable TaskDB replay fence; the second uses a
    # different canonical UUID and a case/whitespace variant of the same
    # normalized name, so it must hit the durable name fence. Both must leave
    # TaskDB, AppInstall rows and Docker inventory byte-for-byte unchanged.
    expect_duplicate_denied("replay", {
        "appDetailId": detail_id, "name": APP_NAME,
        "params": {}, "taskID": install_task, "pullImage": False,
    })
    steps.append("replay_install_taskid_denied_without_side_effects")
    expect_duplicate_denied("same-name", {
        "appDetailId": detail_id, "name": "  " + APP_NAME.upper() + "  ",
        "params": {}, "taskID": str(uuid4()), "pullImage": False,
    })
    steps.append("same_name_install_denied_without_side_effects")

    # Deletion is a new deliberate operation with its own UUID, never a retry.
    uninstall_id = str(uuid4())
    observed_ids.append(uninstall_id)
    request("POST", "/apps/installed/op", {
        "installId": install_id, "operate": "delete", "forceDelete": False,
        "deleteImage": False, "taskID": uninstall_id,
    }, stage_hint="uninstall-operation")
    await_task(uninstall_id, "App", "TaskUninstall")
    if guest(["sudo", "docker", "inspect", "--format", "{{.Id}}", name],
             check=False):
        raise RuntimeError("AppInstall container remained after uninstall")
    # This must no longer report a live AppInstall resource. The Agent
    # answers an absent install with HTTP 200 and status "Deleted", so the
    # removal signal is the payload contract (deleted status, no identity,
    # no Docker/compose resource) and never an HTTP refusal assumption.
    removal = request("GET", f"/apps/installed/info/{install_id}", success=False,
                      raw_response=True, verify_rejection=False,
                      stage_hint="installed-info")
    removal_code = app_evidence_codes.classify_app_install_removal(removal)
    if removal_code != "removed":
        print("G5_APP_UNINSTALL_REMOVAL_CODE=" + removal_code +
              " release=NO_GO", flush=True)
        raise RuntimeError("AppInstall resource still observable after uninstall")
    steps.append("real_app_uninstall_and_resource_removal")

    fixture("remove")
    cleanup_task = str(uuid4())
    request("POST", "/apps/sync/local", {"taskID": cleanup_task},
            stage_hint="catalog-sync")
    await_task(cleanup_task, "AppStore", "TaskSync")
    steps.append("fixture_catalog_cleanup")
    context.close()
    chrome.close()

result = {
    "kind": "REAL OWNED UBUNTU GPUPANEL APPINSTALL API; NO MOCKS",
    "candidate": local, "guest_machine_id_sha256": guest_sha,
    "steps": steps,
    "durable_admission_survived_agent_restart": True,
    "duplicate_fences_observed": True,
    "distinct_install_uninstall_task_ids": len(observed_ids) == 2
        and len(set(observed_ids)) == 2,
    "app_evidence_observational_only": True,
    "no_public_image_pull": True,
    "docker_no_network_or_host_ports": True,
    "fixture_source_cleaned": True,
    "g5_full_appstore_business_acceptance": "NOT_RUN",
    "m0_release_decision": "NO_GO",
}
(STATE / "app-install-live.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"kind": "REAL_APPINSTALL_PARTIAL", "steps": len(steps),
                  "m0_release_decision": "NO_GO"}))
