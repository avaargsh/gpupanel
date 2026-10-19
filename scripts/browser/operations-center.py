"""Real Chromium + simulated authenticated Core/Agent APIs for Operations Center.

All responses are fixture-only. This does not run installed Core/Agent, Docker,
a system installer, or a real Ubuntu operator login. Fail if UI issues writes.
"""
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

URL = "http://127.0.0.1:4189"
ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / ".local/install-test/operations"
ARTIFACTS.mkdir(parents=True, exist_ok=True)

NOW = "2026-10-19T09:00:00Z"
HOST_RECEIPTS = [
    {
        "id": "host-planned", "kind": "host.diagnose", "host": "local",
        "target": "local", "state": "planned", "impact": "Read-only diagnostic.",
        "createdAt": NOW, "expiresAt": "2099-01-01T00:00:00Z",
        "output": "", "error": "", "verified": False,
    },
    {
        "id": "host-expired", "kind": "container.restart", "host": "local",
        "target": "a" * 64, "state": "planned", "impact": "Expired plan.",
        "createdAt": "2026-10-18T09:00:00Z", "expiresAt": "2026-10-18T10:00:00Z",
        "output": "", "error": "", "verified": False,
    },
    {
        "id": "host-unknown", "kind": "container.restart", "host": "local",
        "target": "b" * 64, "state": "unknown", "impact": "Unconfirmed outcome.",
        "createdAt": "2026-10-17T09:00:00Z", "expiresAt": "2026-10-17T09:05:00Z",
        "output": "", "error": "", "verified": False,
    },
]


def task(task_id, status, resource_id, operate="TaskInstall", scope="App"):
    return {
        "id": task_id, "status": status, "resourceID": resource_id,
        "operate": operate, "type": scope, "name": task_id,
        "createdAt": NOW, "endAt": "", "currentStep": "",
        "logFile": "DO_NOT_EXPOSE_LOG_PATH",
        "errorMsg": "DO_NOT_EXPOSE_RAW_ERROR",
        "operationLogID": 0,
    }


TASK_LOGS = [
    task("install-old", "Failed", 7),
    task("install-new", "Success", 7),
    task("generic-running", "Executing", 0, "TaskSync", "AppStore"),
]
state = {
    "host_fail": False, "task_fail": False, "evidence_fail": False,
    "evidence_task": "install-new", "requests": [],
    "mutations": [], "evidence_requests": 0, "host_reads": 0,
    "task_reads": 0,
}


def api(route):
    req = route.request
    path = req.url.split("/api/v1", 1)[1].split("?", 1)[0]
    node = req.headers.get("currentnode", "local")
    state["requests"].append((path, node, req.method))
    code, data = 200, {}
    if path == "/core/auth/current":
        data = {"name": "fixture", "role": "ADMIN"}
    elif path == "/hosts/operations":
        assert req.method == "GET"
        state["host_reads"] += 1
        if state["host_fail"]:
            code = 503
        else:
            data = HOST_RECEIPTS
    elif path == "/logs/tasks/search":
        assert req.method == "POST"
        args = req.post_data_json
        assert args == {"page": 1, "pageSize": 20, "type": "", "status": ""}
        state["task_reads"] += 1
        if state["task_fail"]:
            code = 503
        else:
            data = {"items": TASK_LOGS, "total": len(TASK_LOGS)}
    elif path == "/apps/installed/evidence/7":
        assert req.method == "GET"
        assert node == "local", "evidence must never query remote node"
        state["evidence_requests"] += 1
        if state["evidence_fail"]:
            code = 503
        else:
            data = {
                "installId": 7, "taskId": state["evidence_task"],
                "classification": "CONSISTENT", "verified": False,
                "appStatus": "Running", "taskStatus": "Success",
                "observedAt": NOW, "reasons": ["RECORDS_AND_RUNNING_CONTAINERS_AGREE"],
                "containers": [{"name": "disposable-app", "state": "running"}],
                "env": "SECRET_RESOURCE_ENV_NEVER_RENDER",
            }
    elif path in ("/core/projects",):
        data = []
    else:
        # No write has an authorized simulated receiver.
        if req.method not in ("GET", "HEAD"):
            state["mutations"].append((path, req.method))
            raise AssertionError("Unexpected privileged write from Operations Center: " + path)
    route.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"code": code, "data": data, "message": "fixture unavailable" if code != 200 else ""}),
    )


def select_tab(page, label):
    page.get_by_role("tab", name=label, exact=False).click()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 960})
    context.add_init_script(
        """localStorage.setItem('gpupanel.auth',JSON.stringify({name:'fixture',role:'ADMIN',token:''}));
        localStorage.setItem('gpupanel.ui',JSON.stringify({language:'en',themeMode:'light',currentNode:'local'}));"""
    )
    page = context.new_page()
    page.set_default_timeout(12000)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/api/v1/**", api)

    # Read-only panels use two separate backend sources with accurate
    # semantics, not one fabricated combined "Agent Approval" feed.
    page.goto(URL + "/operations")
    expect(page.get_by_role("heading", name="Operations Center")).to_be_visible()
    expect(page.get_by_text("Host controlled operations (current session)")).to_be_visible()
    expect(page.get_by_text("Agent persisted execution tasks (local host)")).to_be_visible()
    expect(page.get_by_text("host-planned")).to_be_visible()
    expect(page.get_by_text("host-unknown")).to_be_visible()
    expect(page.get_by_text("install-old")).to_be_visible()
    expect(page.get_by_text("generic-running")).to_be_visible()
    # Finished Task Success is only in Activity, never a pending approval.
    assert page.get_by_text("install-new", exact=True).count() == 0
    select_tab(page, "Pending confirmation")
    expect(page.get_by_text("host-planned")).to_be_visible()
    assert page.get_by_text("host-expired").count() == 0
    assert page.get_by_text("install-new").count() == 0
    select_tab(page, "All activity")
    expect(page.get_by_text("install-new")).to_be_visible()
    expect(page.get_by_text("host-expired")).to_be_visible()

    # The historical task points at AppInstall ID 7, but the backend returns
    # latest TaskInstall "install-new". Old attempt must fail CLOSED.
    page.locator("li").filter(has_text="install-old").get_by_role(
        "button", name="Review install resource evidence (read-only)",
    ).click()
    expect(page.get_by_text("Evidence belongs to another installation attempt", exact=False)).to_be_visible()
    assert page.get_by_text("CONSISTENT", exact=True).count() == 0
    assert page.get_by_text("SECRET_RESOURCE_ENV_NEVER_RENDER").count() == 0
    page.get_by_role("button", name="Close").click()

    # Same exact Task + resource ID may show *read-only observations*,
    # never label that a healthy installation or rollout is verified.
    page.locator("li").filter(has_text="install-new").get_by_role(
        "button", name="Review install resource evidence (read-only)",
    ).click()
    expect(page.get_by_text("CONSISTENT", exact=True)).to_be_visible()
    expect(page.get_by_text("Agreement is not installation proof", exact=False)).to_be_visible()
    expect(page.get_by_text("disposable-app: running")).to_be_visible()
    assert page.get_by_text("SECRET_RESOURCE_ENV_NEVER_RENDER").count() == 0
    assert page.get_by_text("DO_NOT_EXPOSE_RAW_ERROR").count() == 0
    assert page.get_by_text("DO_NOT_EXPOSE_LOG_PATH").count() == 0
    state["evidence_fail"] = True
    page.get_by_role("button", name="刷新 / Refresh").click()
    expect(page.get_by_text("Evidence unavailable or denied", exact=False)).to_be_visible()
    assert page.get_by_text("CONSISTENT", exact=True).count() == 0
    page.get_by_role("button", name="Close").click()

    # Error in Host receipts cannot blank the persisted execution log.
    state["evidence_fail"] = False
    state["host_fail"] = True
    page.get_by_role("button", name="Refresh", exact=True).click()
    expect(page.get_by_text("install-new")).to_be_visible()
    expect(page.get_by_text("Failed to load", exact=False)).to_be_visible()
    assert page.get_by_text("host-planned").count() == 0

    # Inverse failure cannot hide session-scoped Host confirmation plans.
    state["host_fail"] = False
    state["task_fail"] = True
    page.get_by_role("button", name="Refresh", exact=True).click()
    select_tab(page, "Pending confirmation")
    expect(page.get_by_text("host-planned")).to_be_visible()
    select_tab(page, "All activity")
    expect(page.get_by_text("Execution task logs unavailable", exact=False)).to_be_visible()
    assert page.get_by_text("install-new").count() == 0

    # Scope transition suppresses both local sources and the evidence drawer.
    before_remote = len(state["requests"])
    page.evaluate("""async () => {
      const {store} = await import('/src/store/index.ts');
      const {setCurrentNode} = await import('/src/features/ui/uiSlice.ts');
      store.dispatch(setCurrentNode('fixture-remote'));
    }""")
    expect(page.get_by_text("Remote host tasks are not supported", exact=False)).to_be_visible()
    page.wait_for_timeout(200)
    remote_requests = state["requests"][before_remote:]
    assert all(
        not (name in ("/hosts/operations", "/logs/tasks/search")
             or name.startswith("/apps/installed/evidence/"))
        or node == "local"
        for name, node, method in remote_requests
    ), remote_requests
    assert not state["mutations"], state["mutations"]
    assert state["evidence_requests"] == 2, state["evidence_requests"]
    assert state["host_reads"] >= 2 and state["task_reads"] >= 2
    page.set_viewport_size({"width": 640, "height": 800})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not errors, errors

    result = {
        "kind": "REAL CHROMIUM / SIMULATED Core+Agent API — NOT installed-host acceptance",
        "source_revision": __import__("os").getenv("GITHUB_SHA", "not-in-CI"),
        "checks": [
            "separate Host session and Agent persisted task sections",
            "unexpired Host plan only in confirmation",
            "Task Success is not a pending approval",
            "historical task mismatch denies resource attribution",
            "exact task observation stays unverified",
            "failed evidence refresh hides prior snapshot",
            "independent Host and task failures",
            "remote scope suppresses local-only sources",
            "no execution / approval / retry mutations",
            "mobile no horizontal overflow",
        ],
        "fixture_host_reads": state["host_reads"],
        "fixture_agent_reads": state["task_reads"],
        "fixture_evidence_reads": state["evidence_requests"],
        "fixture_mutations": len(state["mutations"]),
        "browser_errors": errors,
    }
    (ARTIFACTS / "operations-browser.json").write_text(
        json.dumps(result, indent=2) + "\n",
    )
    page.screenshot(path=str(ARTIFACTS / "operations-remote-640.png"), full_page=True)
    context.close()
    browser.close()
print(json.dumps(result))
