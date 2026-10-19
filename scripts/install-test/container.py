#!/usr/bin/env python3
"""Real GPUPanel Core→Agent→Docker container operation slice on task-owned Ubuntu VM.

Uses one locally imported, distro-signed busybox-static image. No Docker Hub,
external provider, mock API, host Docker daemon, AppInstall, or Compose catalog.
"""
from __future__ import annotations

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
    raise RuntimeError("G5 fixture requires running task-owned QEMU guest")
local = candidate.local_candidate(ROOT)
browser = json.loads((STATE / "browser-live.json").read_text())
candidate.verify_browser_chain(browser, local)
runtime = json.loads((STATE / "runtime-live.json").read_text())
if not (
    runtime.get("candidate") == local
    and runtime.get("guest_machine_id_sha256")
        == browser.get("guest_machine_id_sha256")
    and runtime.get("same_candidate_live_browser_verified") is True
    and runtime.get("explicit_fixture_operator_recovery") is True
):
    raise RuntimeError("G5 requires previously verified same-candidate live recovery")

credentials = json.loads((STATE / "credentials.json").read_text())
if credentials.get("url") != f"http://127.0.0.1:{vm.PANEL_PORT}":
    raise RuntimeError("refuse remote/non-fixture Core origin")

image_name = "gpupanel-m0-fixture:local"
container_name = "gpupanel-m0-" + local["source_sha"][:12]
# Only the disposable VM is accessed; never the CI runner Docker socket.
def guest(args: list[str], *, check: bool = True) -> str:
    outcome = subprocess.run(
        vm.ssh_args() + [shlex.join(args)],
        text=True, capture_output=True, timeout=35,
    )
    if check and outcome.returncode != 0:
        raise RuntimeError("guest fixture observation unavailable")
    return outcome.stdout.strip() if outcome.returncode == 0 else ""

def state() -> str:
    return guest([
        "sudo", "docker", "inspect", "--format", "{{.State.Status}}",
        container_name,
    ])

# Require the agent fixture image to be present and the name to be unused.
local_image_id = guest(["sudo", "docker", "image", "inspect",
                        "--format", "{{.Id}}", image_name])
if not local_image_id.startswith("sha256:") or len(local_image_id) != 71:
    raise RuntimeError("expected locally imported immutable fixture image")
if guest(["sudo", "docker", "inspect", "--format", "{{.Id}}", container_name],
         check=False):
    raise RuntimeError("container fixture name occupied: refuse touching foreign resource")

completed = []
task_ids: list[str] = []

with sync_playwright() as play:
    browser_instance = play.chromium.launch(headless=True)
    anonymous = browser_instance.new_context()
    # Authentication is required even for this explicit lab mutation.
    probe = anonymous.request.post(
        credentials["url"] + "/api/v1/containers",
        data={"name": container_name, "image": image_name},
    )
    if probe.status not in (401, 403) and (
        probe.headers.get("content-type", "").startswith("application/json")
        and probe.json().get("code") == 200
    ):
        raise RuntimeError("anonymous container create was admitted")
    anonymous.close()
    context = browser_instance.new_context()
    page = context.new_page()
    page.goto(credentials["url"] + "/" + credentials["entrance"])
    expect(page.locator('input[autocomplete="username"]')).to_be_visible(timeout=15_000)
    page.locator('input[autocomplete="username"]').fill(credentials["username"])
    page.locator('input[autocomplete="current-password"]').fill(credentials["password"])
    page.locator('button[type="submit"]').click()
    expect(page.get_by_role("heading", name="Workbench", exact=True)).to_be_visible(
        timeout=20_000
    )

    def api_post(endpoint: str, body: dict) -> dict:
        if endpoint not in {"/containers", "/containers/operate", "/logs/tasks/search"}:
            raise RuntimeError("G5 fixture request outside fixed Core API allowlist")
        outcome = page.evaluate("""async ({url, body}) => {
            const cookie = document.cookie.split('; ').find(v => v.startsWith('pcsrftoken='));
            const token = cookie ? decodeURIComponent(cookie.slice('pcsrftoken='.length)) : '';
            const r = await fetch('/api/v1'+url, {
                method:'POST', credentials:'include',
                headers:{'Content-Type':'application/json','CurrentNode':'local','X-CSRF-Token':token},
                body:JSON.stringify(body)
            });
            const payload = await r.json();
            return {http:r.status, code:payload.code, data:payload.data};
        }""", {"url": endpoint, "body": body})
        if outcome.get("http") != 200 or outcome.get("code") != 200:
            raise RuntimeError("authenticated Core request rejected")
        return outcome

    def action_task(op: str, task_id: str) -> None:
        end = time.monotonic() + 45
        while time.monotonic() < end:
            reply = api_post("/logs/tasks/search", {
                "page": 1, "pageSize": 10, "type": "Container",
                "status": "", "taskID": task_id,
            })
            data = reply.get("data")
            records = data.get("items") if isinstance(data, dict) else None
            if records is not None and not isinstance(records, list):
                raise RuntimeError("Agent task log has unexpected type")
            matches = [x for x in (records or []) if x.get("id") == task_id]
            if len(matches) > 1:
                raise RuntimeError("duplicate persisted Agent task ID")
            if matches:
                task = matches[0]
                if task.get("type") != "Container" or task.get("operate") != op:
                    raise RuntimeError("Agent task identity or action mismatched")
                if task.get("status") == "Success":
                    return
                if task.get("status") not in ("Executing", ""):
                    raise RuntimeError("Agent task did not complete successfully")
            time.sleep(0.7)
        raise RuntimeError("Agent task outcome unresolved; refuse automatic retry")

    # Explicit single-use task IDs: no command replay even after network error.
    new_id = str(uuid4())
    task_ids.append(new_id)
    api_post("/containers", {
        "name": container_name, "image": image_name,
        "cmd": ["/bin/busybox", "sleep", "600"],
        "forcePull": False, "privileged": False,
        "publishAllPorts": False, "taskID": new_id,
        "restartPolicy": "no",
    })
    action_task("TaskCreate", new_id)  # actual backend's task operation spelling
    if state() != "running":
        raise RuntimeError("independent guest Docker create observation failed")
    completed.append("create_and_independent_running_observation")

    for operation, expected in (
        ("stop", "exited"), ("start", "running"), ("restart", "running"),
        ("remove", "absent"),
    ):
        unique = str(uuid4())
        task_ids.append(unique)
        api_post("/containers/operate", {
            "names": [container_name], "operation": operation,
            "taskID": unique,
        })
        action_task(operation, unique)
        observed = state() if operation != "remove" else guest(
            ["sudo", "docker", "inspect", "--format", "{{.Id}}", container_name],
            check=False,
        )
        if (operation == "remove" and observed) or (
            operation != "remove" and observed != expected
        ):
            raise RuntimeError("independent guest Docker state differs from Agent receipt")
        completed.append(operation + "_with_independent_observation")
    context.close()
    browser_instance.close()

result = {
    "kind": "REAL UBUNTU GUEST + AUTHENTICATED CORE→AGENT→DOCKER; NO MOCK API",
    "candidate": local,
    "guest_machine_id_sha256": browser["guest_machine_id_sha256"],
    "fixture_image_sha256": local_image_id.removeprefix("sha256:"),
    "distinct_task_ids": len(task_ids) == len(set(task_ids)) == 5,
    "steps": completed,
    "no_external_app_catalog_used": True,
    "app_install_lifecycle": "NOT_RUN",
    "compose_install_lifecycle": "NOT_RUN",
    "release_decision": "NO_GO",
}
(STATE / "container-live.json").write_text(json.dumps(result, indent=2) + "\n")
print("REAL_CONTAINER_LIFECYCLE " + json.dumps({
    "steps": len(completed), "distinct_ids": result["distinct_task_ids"],
    "release": "NO_GO", "scope": "CONTAINER_ONLY",
}))
