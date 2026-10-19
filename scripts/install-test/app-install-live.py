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
                success=True):
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
            print("G5_APP_API_FAILURE_STAGE=" + api_failure_stage(endpoint) +
                  " release=NO_GO", flush=True)
            raise RuntimeError("scoped Core App API refused the expected operation")
        if not success and accepted:
            raise RuntimeError("Core accepted a deliberately invalid AppInstall")
        return response.get("data")

    def await_task(task_id: str, scope: str, operation: str, timeout=85):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            data = request("POST", "/logs/tasks/search", {
                "page": 1, "pageSize": 20, "type": scope,
                "status": "", "taskID": task_id,
            })
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

    sync_id = str(uuid4())
    request("POST", "/apps/sync/local", {"taskID": sync_id})
    await_task(sync_id, "AppStore", "TaskSync")
    steps.append("real_local_catalog_sync")
    detail = request("GET", f"/apps/detail/node/{APP_KEY}/1.0.0")
    detail_id = detail.get("id") if isinstance(detail, dict) else None
    if type(detail_id) is not int or detail_id <= 0:
        raise RuntimeError("local catalog detail was not actually persisted")

    # This rejected request is *not* a retry: malformed UUID must fail before
    # durable task admission and must never leave AppInstall side effects.
    request("POST", "/apps/install", {
        "appDetailId": detail_id, "name": APP_NAME,
        "params": {}, "taskID": "../invalid", "pullImage": False,
    }, success=False)
    steps.append("invalid_install_uuid_rejected")

    install_task = str(uuid4())
    observed_ids.append(install_task)
    created = request("POST", "/apps/install", {
        "appDetailId": detail_id, "name": APP_NAME,
        "params": {}, "taskID": install_task, "pullImage": False,
    })
    install_id = created.get("id") if isinstance(created, dict) else None
    if type(install_id) is not int or install_id <= 0:
        raise RuntimeError("AppInstall row was not returned")
    await_task(install_task, "App", "TaskInstall")
    steps.append("real_appinstall_taskdb_success")

    evidence = request("GET", f"/apps/installed/evidence/{install_id}")
    if not (
        isinstance(evidence, dict)
        and evidence.get("installId") == install_id
        and evidence.get("taskId") == install_task
        and evidence.get("taskStatus") == "Success"
        and evidence.get("appStatus") == "Running"
        and evidence.get("classification") == "CONSISTENT"
        and evidence.get("verified") is False
        and isinstance(evidence.get("containers"), list)
        and len(evidence["containers"]) == 1
        and evidence["containers"][0].get("state") == "running"
    ):
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

    # Deletion is a new deliberate operation with its own UUID, never a retry.
    uninstall_id = str(uuid4())
    observed_ids.append(uninstall_id)
    request("POST", "/apps/installed/op", {
        "installId": install_id, "operate": "delete", "forceDelete": False,
        "deleteImage": False, "taskID": uninstall_id,
    })
    await_task(uninstall_id, "App", "TaskUninstall")
    if guest(["sudo", "docker", "inspect", "--format", "{{.Id}}", name],
             check=False):
        raise RuntimeError("AppInstall container remained after uninstall")
    # This must no longer return a successfully readable AppInstall resource.
    request("GET", f"/apps/installed/info/{install_id}", success=False)
    steps.append("real_app_uninstall_and_resource_removal")

    fixture("remove")
    cleanup_task = str(uuid4())
    request("POST", "/apps/sync/local", {"taskID": cleanup_task})
    await_task(cleanup_task, "AppStore", "TaskSync")
    steps.append("fixture_catalog_cleanup")
    context.close()
    chrome.close()

result = {
    "kind": "REAL OWNED UBUNTU GPUPANEL APPINSTALL API; NO MOCKS",
    "candidate": local, "guest_machine_id_sha256": guest_sha,
    "steps": steps,
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
