#!/usr/bin/env python3
"""Live browser smoke against only the task-owned installed VM, without API mocks."""
import json
from pathlib import Path
import re
import shlex
import subprocess
import candidate
from playwright.sync_api import sync_playwright, expect
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/install-test'
if not vm.owned_pid('qemu.pid', str(vm.STATE / 'disk.qcow2')):
    raise SystemExit('Task-owned disposable VM is not running')
credentials = json.loads((STATE / 'credentials.json').read_text())
if credentials['url'] != f'http://127.0.0.1:{vm.PANEL_PORT}':
    raise SystemExit('Refuse a non-fixture target')
local = candidate.local_candidate(ROOT)
remote_probe = """import hashlib,json,os,subprocess
from pathlib import Path
names=('core','agent')
def installed_running(name):
    target=Path('/opt/gpupanel')/('gpupanel-'+name)
    pid=subprocess.check_output(
        ['systemctl','show','gpupanel-'+name,'-p','MainPID','--value'],
        text=True,timeout=5).strip()
    if not pid.isdecimal() or int(pid)==0:
        raise RuntimeError('expected running service process is unavailable')
    live=os.stat('/proc/'+pid+'/exe')
    disk=os.stat(target)
    if (live.st_dev,live.st_ino)!=(disk.st_dev,disk.st_ino):
        raise RuntimeError('running service executable differs from installed file')
    return hashlib.file_digest(target.open('rb'),'sha256').hexdigest()
print(json.dumps({
    'binary_sha256': {name:installed_running(name) for name in names},
    'machine_id_sha256': hashlib.sha256(Path('/etc/machine-id').read_bytes()).hexdigest()
}))
"""
installed = json.loads(subprocess.check_output(
    vm.ssh_args() + [shlex.join(['sudo', 'python3', '-c', remote_probe])],
    text=True, timeout=35,
))
candidate.verify_installed(local, installed['binary_sha256'])
assert candidate.SHA256.fullmatch(installed['machine_id_sha256'])
result = {
    'kind': 'LIVE local VM; no intercepted APIs',
    'target': credentials['url'], 'candidate': local,
    'guest_machine_id_sha256': installed['machine_id_sha256'],
}


def denied(response):
    if response.status in (401, 403):
        return True
    try:
        return response.json().get('code', 200) != 200
    except ValueError:
        return False


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    anonymous = browser.new_context()
    for endpoint in ('/api/v1/core/auth/current', '/api/v1/dashboard/base/os', '/api/v1/apps/installed/evidence/1'):
        response = anonymous.request.get(credentials['url'] + endpoint)
        assert denied(response), 'anonymous access was not denied: ' + endpoint
    anonymous.close()
    result['anonymous_core_host_evidence_denied'] = True
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(credentials['url'] + '/' + credentials['entrance'])
    page.wait_for_load_state('networkidle')
    expect(page.locator('input[autocomplete="username"]')).to_be_visible(timeout=10000)
    page.locator('input[autocomplete="username"]').fill(credentials['username'])
    page.locator('input[autocomplete="current-password"]').fill(credentials['password'])
    page.locator('button[type="submit"]').click()
    expect(page.get_by_role('heading', name='Workbench', exact=True)).to_be_visible(timeout=20000)
    user = page.request.get(credentials['url'] + '/api/v1/core/auth/current').json()
    assert user['code'] == 200 and user['data']['name'] == credentials['username']
    assert any(cookie['name'] == 'SecurityEntrance' and cookie['httpOnly'] for cookie in context.cookies())
    assert 'SecurityEntrance=' not in page.evaluate('document.cookie')
    result['live_login_and_httponly_entrance'] = True
    host = page.request.get(credentials['url'] + '/api/v1/dashboard/base/os').json()
    assert host['code'] == 200 and isinstance(host['data'], dict)
    docker = page.request.get(credentials['url'] + '/api/v1/containers/docker/status').json()
    assert docker['code'] == 200 and docker['data']['isExist'] and docker['data']['isActive']
    result['live_core_agent_host_api'] = True
    result['live_docker_daemon_status'] = docker['data']
    valid_read = page.evaluate("""async () => {
        const cookie = document.cookie.split('; ').find(item => item.startsWith('pcsrftoken='));
        const token = cookie ? decodeURIComponent(cookie.slice('pcsrftoken='.length)) : '';
        const response = await fetch('/api/v1/apps/installed/search', {
            method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': token},
            body: JSON.stringify({page: 1, pageSize: 10, tags: [], name: ''}), credentials: 'include'
        });
        const body = await response.json();
        return {status: response.status, code: body.code, itemsType: Array.isArray(body.data?.items) ? 'array' : body.data?.items === null ? 'null' : typeof body.data?.items, total: body.data?.total};
    }""")
    assert valid_read['code'] == 200 and (valid_read['itemsType'] == 'array' or (valid_read['itemsType'] == 'null' and valid_read['total'] == 0)), 'legitimate installed-list read failed: ' + json.dumps(valid_read)
    result['authenticated_installed_list_read'] = True
    result['installed_list_contract'] = valid_read
    invalid = page.request.post(credentials['url'] + '/api/v1/apps/installed/search', headers={'X-CSRF-Token': 'invalid-fixture-token'}, data={'page': 1, 'pageSize': 10, 'tags': [], 'name': ''})
    assert denied(invalid), 'invalid CSRF was accepted'
    result['invalid_csrf_denied'] = True
    result['invalid_csrf_http_status'] = invalid.status
    page.screenshot(path=str(STATE / 'dashboard-live.png'), full_page=True)
    # Exercise the *installed* Operations Center, not the Vite/mocked suite.
    # Its two sources must each be reachable through the authenticated Core.
    unexpected_mutations = []
    def classify_request(req):
        path = req.url.split('/api/v1/', 1)[-1].split('?', 1)[0]
        if '/api/v1/' not in req.url:
            return
        if req.method not in ('GET', 'HEAD') and not (
            req.method == 'POST' and path == 'logs/tasks/search'
        ):
            unexpected_mutations.append((path, req.method))
    page.on('request', classify_request)
    page.goto(credentials['url'] + '/operations')
    expect(page.get_by_role('heading', name=re.compile('Operations Center|操作中心'))).to_be_visible()
    expect(page.get_by_text(re.compile('Host controlled operations|主机受控操作')).first).to_be_visible()
    expect(page.get_by_text(re.compile('Agent persisted execution tasks|Agent 持久执行任务')).first).to_be_visible()
    checks = page.evaluate("""async () => {
      const csrf = document.cookie.split('; ').find(v => v.startsWith('pcsrftoken='))?.split('=').slice(1).join('=') || '';
      const header = {'CurrentNode': 'local', 'X-CSRF-Token': decodeURIComponent(csrf)};
      const host = await fetch('/api/v1/hosts/operations', {credentials:'include', headers:header});
      const tasks = await fetch('/api/v1/logs/tasks/search', {
        method:'POST', credentials:'include',
        headers:{...header, 'Content-Type':'application/json'},
        body:JSON.stringify({page:1,pageSize:20,type:'',status:''})
      });
      const h = await host.json(), t = await tasks.json();
      // Fresh installs may return nil slices (JSON null) for empty
      // session receipts or zero TaskLogs. Absence must not be confused
      // with unauthorized/error responses or with a successful task.
      const hostShape = Array.isArray(h.data) || h.data === null;
      const taskShape = Array.isArray(t.data?.items) ||
          (t.data?.items === null && t.data?.total === 0);
      return {hostHTTP:host.status, hostCode:h.code,
              taskHTTP:tasks.status, taskCode:t.code,
              hostShape, taskShape};
    }""")
    assert checks == {
        'hostHTTP': 200, 'hostCode': 200,
        'taskHTTP': 200, 'taskCode': 200,
        'hostShape': True, 'taskShape': True,
    }, 'Core/Agent Operations Center read-only contracts unavailable'
    assert not unexpected_mutations, 'Operations Center issued an unapproved mutation'
    result['live_operations_center_read_only'] = True
    result['operations_center'] = {
        'host_and_task_sources_authenticated': True,
        'no_unapproved_ui_mutations': True,
        'content_recorded': False,
    }
    page.screenshot(path=str(STATE / 'operations-center-live.png'), full_page=True)
    page.goto(credentials['url'] + '/apps')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('tab', name='Installed', exact=True)).to_be_visible()
    page.get_by_role('tab', name='Installed', exact=True).click()
    page.wait_for_load_state('networkidle')
    page.screenshot(path=str(STATE / 'installed-live.png'), full_page=True)
    assert not errors, errors
    result['browser_page_errors'] = errors
    context.close()
    browser.close()
(STATE / 'browser-live.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
