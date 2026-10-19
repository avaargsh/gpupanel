#!/usr/bin/env python3
"""Real logged-in GPUPanel AppInstall *rejection* against task-owned Ubuntu VM.

Never supplies a valid AppDetail or attempts a real app install. This proves
only rejection/non-mutation for a missing detail, not duplicate-install safety
or G5 successful AppInstall. No simulated API responses.
"""
from __future__ import annotations

import json
from pathlib import Path
import shlex
import subprocess
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright
import candidate
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local/install-test"
if not vm.owned_pid("qemu.pid", str(vm.STATE / "disk.qcow2")):
    raise RuntimeError("refuse AppInstall admission probe outside owned QEMU guest")
local = candidate.local_candidate(ROOT)
browser = json.loads((STATE / "browser-live.json").read_text())
candidate.verify_browser_chain(browser, local)
runtime = json.loads((STATE / "runtime-live.json").read_text())
if not (
    runtime.get("candidate") == local
    and runtime.get("guest_machine_id_sha256") == browser.get("guest_machine_id_sha256")
    and runtime.get("explicit_fixture_operator_recovery") is True
):
    raise RuntimeError("same-candidate browser and recovered Agent proof required")
credentials = json.loads((STATE / "credentials.json").read_text())
origin = f"http://127.0.0.1:{vm.PANEL_PORT}"
if credentials.get("url") != origin:
    raise RuntimeError("refuse non-fixture GPUPanel origin")


def guest_inventory() -> dict:
    """Read-only fresh VM app/task databases and Docker object identities."""
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
    cmd = vm.ssh_args() + [
        shlex.join(["sudo", "python3", "-c", probe])
    ]
    output = subprocess.check_output(cmd, text=True, timeout=35)
    values = json.loads(output)
    if (
        type(values.get("apps")) is not int or values["apps"] < 0
        or type(values.get("tasks")) is not int or values["tasks"] < 0
        or any(not isinstance(values.get(key), list)
               or not all(isinstance(v, str) for v in values[key])
               for key in ("containers", "networks", "volumes"))
    ):
        raise RuntimeError("guest app admission inventory is not trustworthy")
    return values


before = guest_inventory()
task_id = str(uuid4())
with sync_playwright() as play:
    engine = play.chromium.launch(headless=True)
    ctx = engine.new_context()
    page = ctx.new_page()
    page.goto(origin + "/" + credentials["entrance"])
    expect(page.locator('input[autocomplete="username"]')).to_be_visible(timeout=15000)
    page.locator('input[autocomplete="username"]').fill(credentials["username"])
    page.locator('input[autocomplete="current-password"]').fill(credentials["password"])
    page.locator('button[type="submit"]').click()
    expect(page.get_by_role("heading", name="Workbench", exact=True)).to_be_visible(timeout=20000)

    # A deliberately absent detail ID is not a valid local or remote app.
    # Do not retry this request, even if its HTTP ACK is ambiguous.
    response = page.evaluate("""async ({taskID}) => {
      const cookie=document.cookie.split('; ')
        .find(s=>s.startsWith('pcsrftoken='));
      const token=cookie?decodeURIComponent(cookie.slice('pcsrftoken='.length)):'';
      const r=await fetch('/api/v1/apps/install',{
        method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json',
                 'CurrentNode':'local','X-CSRF-Token':token},
        body:JSON.stringify({
          appDetailId:2147483647,
          name:'gpupanel-ci-nonexistent-detail',
          taskID
        })
      });
      const j=await r.json();
      return {http:r.status,code:j.code};
    }""", {"taskID": task_id})
    ctx.close()
    engine.close()

# Rejected result alone is not enough: independently inspect the actual Agent
# databases plus Docker state, not an AppInstall toast or frontend mock.
after = guest_inventory()
if response.get("code") == 200 or response.get("http") not in (200, 400, 404, 500):
    raise RuntimeError("missing AppDetail was not safely rejected")
if after != before:
    raise RuntimeError("missing AppDetail request changed task/app or Docker inventory")

report = {
    "schema": "gpupanel.vm.appinstall-rejection.v1",
    "kind": "REAL INSTALLED CORE+AGENT APPINSTALL REJECTION; NOT APP INSTALL",
    "candidate": local,
    "guest_machine_id_sha256": browser["guest_machine_id_sha256"],
    "nonexistent_app_detail_rejected": True,
    "no_task_app_or_docker_mutation": True,
    "app_install_success": "NOT_RUN",
    "duplicate_task_replay": "NOT_RUN",
    "release_decision": "NO_GO",
}
(STATE / "app-rejection-live.json").write_text(json.dumps(report, indent=2) + "\n")
print("REAL APPINSTALL NEGATIVE " + json.dumps({
    "reject": True, "unchanged_guest_inventory": True, "release": "NO_GO",
}))
