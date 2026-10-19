#!/usr/bin/env python3
"""Real GPUPanel Compose API -> Agent TaskDB -> guest Docker, NO mocks.

Runs exclusively on the task-owned disposable Ubuntu VM after the same-HEAD
login, restart, offline Compose and Core container acceptance. No hub pulls,
host ports, external networks, destructive global cleanup, or automatic retry.
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
    raise RuntimeError("Compose API acceptance requires an owned running guest")
local = candidate.local_candidate(ROOT)
browser = json.loads((STATE / "browser-live.json").read_text())
candidate.verify_browser_chain(browser, local)
runtime = json.loads((STATE / "runtime-live.json").read_text())
container = json.loads((STATE / "container-live.json").read_text())
guest_identity = browser.get("guest_machine_id_sha256")
if (
    runtime.get("candidate") != local or container.get("candidate") != local
    or not candidate.SHA256.fullmatch(guest_identity or "")
    or runtime.get("guest_machine_id_sha256") != guest_identity
    or container.get("guest_machine_id_sha256") != guest_identity
    or runtime.get("explicit_fixture_operator_recovery") is not True
    or container.get("distinct_task_ids") is not True
    or container.get("steps", [])[-1:] != ["remove_with_independent_observation"]
):
    raise RuntimeError("same-candidate Core/Agent/guest prerequisite absent")

credentials = json.loads((STATE / "credentials.json").read_text())
if credentials.get("url") != f"http://127.0.0.1:{vm.PANEL_PORT}":
    raise RuntimeError("refuse non-loopback Core origin")
project = "gpum0" + local["source_sha"][:12]
fixture_image = "gpupanel-m0-fixture:local"
expected_file_tail = "/docker/compose/" + project + "/docker-compose.yml"
content = (
    f"name: {project}\n"
    "services:\n"
    "  worker:\n"
    f"    image: {fixture_image}\n"
    "    pull_policy: never\n"
    "    network_mode: none\n"
    "    read_only: true\n"
    "    cap_drop: [ALL]\n"
    "    security_opt: [no-new-privileges:true]\n"
    "    command: [/bin/busybox, sleep, '600']\n"
)


def guest(*args: str, missing_ok: bool = False) -> str:
    outcome = subprocess.run(
        vm.ssh_args() + [shlex.join(["sudo", *args])],
        capture_output=True, text=True, timeout=35,
    )
    if outcome.returncode and not missing_ok:
        raise RuntimeError("guest Docker observation unavailable")
    return outcome.stdout.strip() if not outcome.returncode else ""


def containers() -> list[str]:
    output = guest(
        "docker", "ps", "-a", "--filter",
        f"label=com.docker.compose.project={project}",
        "--format", "{{.Names}}",
    )
    return [x for x in output.splitlines() if x]


def inspect(name: str) -> dict:
    raw = guest("docker", "inspect", "--format",
                "{{json .}}", name)
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise RuntimeError("Docker inspected object malformed")
    return data


# The prior real Core container fixture imported the local BusyBox image;
# refuse to pull, build, or use the public registry.
local_image_id = guest("docker", "image", "inspect", "--format",
                       "{{.Id}}", fixture_image)
if not local_image_id.startswith("sha256:") or len(local_image_id) != 71:
    raise RuntimeError("offline fixture image is missing")
if containers():
    raise RuntimeError("Compose fixture namespace already occupied")

done: list[str] = []
with sync_playwright() as playwright:
    browser_instance = playwright.chromium.launch(headless=True)
    anonymous = browser_instance.new_context()
    denied = anonymous.request.post(
        credentials["url"] + "/api/v1/containers/compose",
        data={"name": project, "from": "edit"},
    )
    if denied.status not in (401, 403):
        if "application/json" not in denied.headers.get("content-type", ""):
            raise RuntimeError("anonymous Compose denial unavailable")
        payload = denied.json()
        if denied.status != 200 or payload.get("code") == 200:
            raise RuntimeError("anonymous Compose create accepted")
    anonymous.close()

    context = browser_instance.new_context()
    page = context.new_page()
    page.goto(credentials["url"] + "/" + credentials["entrance"])
    expect(page.locator('input[autocomplete="username"]')).to_be_visible(
        timeout=15_000
    )
    page.locator('input[autocomplete="username"]').fill(credentials["username"])
    page.locator('input[autocomplete="current-password"]').fill(credentials["password"])
    page.locator('button[type="submit"]').click()
    expect(page.get_by_role("heading", name="Workbench", exact=True)).to_be_visible(
        timeout=20_000
    )

    def post(endpoint: str, payload: dict) -> dict:
        if endpoint not in {
            "/containers/compose", "/containers/compose/operate",
            "/containers/compose/search", "/logs/tasks/search",
        }:
            raise RuntimeError("unexpected Compose API mutation or path")
        answer = page.evaluate("""async ({endpoint, payload}) => {
            const csrf=document.cookie.split('; ').find(x=>x.startsWith('pcsrftoken='));
            const token=csrf ? decodeURIComponent(csrf.slice('pcsrftoken='.length)) : '';
            const response=await fetch('/api/v1'+endpoint, {
                method:'POST',credentials:'include',
                headers:{'Content-Type':'application/json','CurrentNode':'local',
                         'X-CSRF-Token':token},
                body:JSON.stringify(payload)
            });
            const body=await response.json();
            return {http:response.status,code:body.code,data:body.data};
        }""", {"endpoint": endpoint, "payload": payload})
        if answer.get("http") != 200 or answer.get("code") != 200:
            raise RuntimeError("authenticated Compose API operation failed")
        return answer

    def task_complete(task_id: str) -> None:
        until = time.monotonic() + 50
        while time.monotonic() < until:
            answer = post("/logs/tasks/search", {
                "page": 1, "pageSize": 15, "type": "Compose",
                "status": "", "taskID": task_id,
            })
            data = answer.get("data")
            records = data.get("items") if isinstance(data, dict) else None
            if records is not None and not isinstance(records, list):
                raise RuntimeError("Compose TaskDB response not a list")
            matching = [row for row in (records or [])
                        if isinstance(row, dict) and row.get("id") == task_id]
            if len(matching) > 1:
                raise RuntimeError("duplicate persisted Compose Task ID")
            if matching:
                row = matching[0]
                if row.get("type") != "Compose" or row.get("operate") != "TaskCreate":
                    raise RuntimeError("Compose TaskDB operation binding mismatch")
                if row.get("status") == "Success":
                    return
                if row.get("status") not in ("", "Executing"):
                    raise RuntimeError("Compose TaskDB did not report success")
            time.sleep(0.7)
        raise RuntimeError("Compose outcome UNKNOWN; do not retry create")

    task_id = str(uuid4())
    post("/containers/compose", {
        "taskID": task_id, "name": project, "dirName": project,
        "from": "edit", "file": content, "env": "", "forcePull": False,
    })
    task_complete(task_id)
    names = containers()
    if len(names) != 1:
        raise RuntimeError("Compose create Docker container count mismatch")
    only = inspect(names[0])
    if (
        only.get("State", {}).get("Status") != "running"
        or only.get("Config", {}).get("Image") != fixture_image
        or only.get("Config", {}).get("Labels", {}).get(
            "com.docker.compose.project") != project
        or only.get("HostConfig", {}).get("NetworkMode") != "none"
        or only.get("HostConfig", {}).get("PortBindings")
        or only.get("HostConfig", {}).get("Privileged") is not False
    ):
        raise RuntimeError("Compose fixture Docker isolation/identity mismatch")
    done.append("create_taskdb_success_and_independent_running_inspection")

    found = post("/containers/compose/search", {"page":1,"pageSize":40})
    listings = found.get("data", {}).get("items")
    if not isinstance(listings, list):
        raise RuntimeError("Compose record list unavailable")
    matches = [row for row in listings if isinstance(row, dict)
               and (row.get("name") or row.get("Name")) == project]
    if len(matches) != 1:
        raise RuntimeError("Compose record missing or duplicated")
    config_path = matches[0].get("configFile") or matches[0].get("ConfigFile")
    if (
        not isinstance(config_path, str)
        or not config_path.startswith("/opt/gpupanel/")
        or not config_path.endswith(expected_file_tail)
        or "," in config_path
        or ".." in config_path.split("/")
    ):
        raise RuntimeError("Compose record path outside owned guest data")
    done.append("exact_persisted_compose_record_found")

    for operation, status in (
        ("stop", "exited"), ("start", "running"), ("restart", "running"),
    ):
        post("/containers/compose/operate", {
            "name": project, "path": config_path, "operation": operation,
            "force": False, "withFile": False,
        })
        names = containers()
        if len(names) != 1 or inspect(names[0]).get("State", {}).get("Status") != status:
            raise RuntimeError("Docker state differs from Compose operation")
        done.append(operation + "_and_independent_docker_state")

    # Deleting withFile=false removes only the recorded project and its
    # containers; do not issue recursive directory removal or generic prune.
    post("/containers/compose/operate", {
        "name": project, "path": config_path, "operation": "delete",
        "force": False, "withFile": False,
    })
    if containers():
        raise RuntimeError("Compose project containers survived deletion")
    # The real Agent first tears down Docker, then removes its persistent
    # Compose record. A post-DELETE snapshot may legitimately catch the
    # intermediate state. Observe until both converge; never replay DELETE,
    # infer success from HTTP 200 or suppress an unresolved record.
    until = time.monotonic() + 20
    while True:
        again = post("/containers/compose/search", {"page": 1, "pageSize": 40})
        data = again.get("data")
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            raise RuntimeError("Compose record search unavailable after deletion")
        matches = [
            row for row in items if isinstance(row, dict)
            and (row.get("name") or row.get("Name")) == project
        ]
        if not matches:
            break
        if time.monotonic() >= until:
            raise RuntimeError("Compose record survived deletion")
        time.sleep(0.5)
    if containers():
        raise RuntimeError("Compose containers reappeared after record deletion")
    done.append("delete_only_owned_compose_project_and_record")
    context.close()
    browser_instance.close()

report = {
    "kind": "REAL AUTHENTICATED GPUPANEL CORE→AGENT COMPOSE API + GUEST DOCKER",
    "candidate": local,
    "guest_machine_id_sha256": guest_identity,
    "fixture_image_sha256": local_image_id[7:],
    "create_taskdb_id_bound": True,
    "exact_record_identity": True,
    "isolated_network_none": True,
    "no_published_ports": True,
    "no_registry_pull": True,
    "no_unscoped_cleanup": True,
    "steps": done,
    "app_install_lifecycle": "NOT_RUN",
    "m0_release_decision": "NO_GO",
}
(STATE / "compose-api-live.json").write_text(json.dumps(report, indent=2)+"\n")
print("REAL_COMPOSE_API_SUCCESS " + json.dumps({
    "steps": len(done), "source": local["source_sha"][:12], "release": "NO_GO",
}))
