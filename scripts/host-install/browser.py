#!/usr/bin/env python3
"""LIVE loopback host acceptance. No intercepted API; only an owned canary mutates Docker."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/host-install'
credentials = json.loads((STATE / 'credentials.json').read_text())
URL = credentials['url']
assert URL == 'http://127.0.0.1:9999', 'Refuse an unrelated target'
for name in ('core', 'agent'):
    installed = Path('/opt/gpupanel/gpupanel-' + name)
    assert subprocess.check_output(['sudo', '-n', 'sha256sum', str(installed)], text=True).split()[0] == hashlib.sha256((ROOT / 'build' / installed.name).read_bytes()).hexdigest()
    pid = subprocess.check_output(['systemctl', 'show', 'gpupanel-' + name, '-p', 'MainPID', '--value'], text=True).strip()
    target = subprocess.check_output(['sudo', '-n', 'readlink', '-f', '/proc/' + pid + '/exe'], text=True).strip()
    assert target == str(installed), 'Unexpected service executable'

for _ in range(120):
    ready = subprocess.run(['sudo', '-n', 'python3', str(ROOT / 'scripts/gpupanel-install-preflight.py'), '--agent-health'], capture_output=True)
    if ready.returncode == 0:
        break
    time.sleep(0.25)
else:
    raise SystemExit('Installed Agent did not become healthy')

DOCKER = ['sudo', '-n', 'docker', '--host', 'unix:///var/run/docker.sock']
run = uuid.uuid4().hex[:12]
canary = 'gpupanel-host-test-' + run
marker_path = '/opt/gpupanel/test-evidence/' + run + '/persistent.txt'
result = {'kind': 'LIVE bare-metal browser and authenticated Core→Agent APIs; no mocks', 'run': run, 'checks': {}}


def inspect():
    process = subprocess.run(DOCKER + ['inspect', canary], capture_output=True, text=True, timeout=10)
    if process.returncode:
        if 'no such object' in process.stderr.lower() or 'no such container' in process.stderr.lower():
            subprocess.run(DOCKER + ['info', '--format', '{{.ID}}'], check=True, capture_output=True, timeout=10)
            return None
        raise RuntimeError('Docker inspect unavailable; absence not proven')
    value = json.loads(process.stdout)[0]
    assert value['Config']['Labels'].get('gpupanel.acceptance.run') == run, 'Foreign container: refuse action'
    assert value['HostConfig']['NetworkMode'] == 'none'
    assert not value['Mounts'] and not value['HostConfig']['Privileged']
    assert not value['HostConfig']['PortBindings']
    return value


def wait_state(expected):
    for _ in range(60):
        value = inspect()
        if (value is None and expected == 'absent') or (value and value['State']['Status'] == expected):
            return value
        time.sleep(0.25)
    raise AssertionError('Canary did not reach expected state: ' + expected)


def denied(response):
    if response.status in (401, 403):
        return True
    try:
        return response.json().get('code', 200) != 200
    except ValueError:
        return False


created = False
try:
    assert subprocess.run(DOCKER + ['inspect', canary], capture_output=True).returncode != 0
    image = json.loads(subprocess.check_output(DOCKER + ['image', 'inspect', 'python:3.14-slim'], text=True))[0]
    result['canary_image_id'] = image['Id']
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        anonymous = browser.new_context()
        for endpoint in ['/api/v1/core/auth/current', '/api/v1/dashboard/base/os', '/api/v1/apps/installed/evidence/1', '/api/v1/hosts/terminal/local']:
            assert denied(anonymous.request.get(URL + endpoint)), 'Anonymous request accepted'
        anonymous.close()
        result['checks']['anonymous_denied'] = True
        context = browser.new_context(viewport={'width': 1440, 'height': 1100}, locale='en-US')
        context.add_init_script("""const NativeSocket = window.WebSocket;
            window.__hostAcceptanceSockets = [];
            window.WebSocket = class extends NativeSocket {
                constructor(...args) { super(...args); window.__hostAcceptanceSockets.push(this); }
            };""")
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL + '/' + credentials['entrance'])
        page.wait_for_load_state('networkidle')
        page.locator('input[autocomplete="username"]').fill(credentials['username'])
        page.locator('input[autocomplete="current-password"]').fill(credentials['password'])
        page.locator('button[type="submit"]').click()
        expect(page.get_by_role('heading', name='Workbench', exact=True)).to_be_visible(timeout=20000)
        assert any(c['name'] == 'SecurityEntrance' and c['httpOnly'] for c in context.cookies())
        assert 'SecurityEntrance=' not in page.evaluate('document.cookie')
        result['checks']['login_and_httponly_entry'] = True

        def api(path, body=None):
            value = page.evaluate('''async ({path,body}) => {
                const csrf=document.cookie.split('; ').find(x=>x.startsWith('pcsrftoken='))?.split('=')[1] || '';
                const r=await fetch('/api/v1'+path,{method:body===null?'GET':'POST',
                    headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(csrf),'CurrentNode':'local'},
                    credentials:'include',body:body===null?undefined:JSON.stringify(body)});
                const text=await r.text();let value;try{value=JSON.parse(text)}catch{value={code:r.status,message:text.slice(0,160)}};return {status:r.status,body:value};
            }''', {'path': path, 'body': body})
            assert value['status'] == 200 and value['body'].get('code') == 200, 'Authenticated API failed: ' + path + ' code=' + str(value['body'].get('code')) + ' ' + str(value['body'].get('message', ''))[:160]
            return value['body'].get('data')

        host = api('/dashboard/base/all/all')
        assert host['hostname'] == os.uname().nodename
        result['checks']['host_api_matches_machine'] = True
        docker = api('/containers/docker/status')
        assert docker['isExist'] and docker['isActive']
        result['checks']['docker_daemon_active'] = True
        gpu = api('/ai/gpu/load')
        result['gpu_observation'] = {'device_count': sum(len(gpu.get(kind) or []) for kind in ('gpu', 'npu', 'xpu')), 'warnings': gpu.get('warnings')}
        invalid = page.request.post(URL + '/api/v1/apps/installed/search', headers={'X-CSRF-Token': 'invalid'}, data={'page':1,'pageSize':10})
        assert denied(invalid)
        result['checks']['invalid_csrf_denied'] = True
        page.screenshot(path=str(STATE / 'workbench-live.png'), full_page=True)
        page.locator('.workspace-sidebar').get_by_role('link', name='Terminal', exact=True).click()
        expect(page.get_by_text('Connected', exact=True)).to_be_visible(timeout=15000)
        terminal = page.locator('.xterm-helper-textarea')
        terminal.focus()
        command = f"mkdir -p /opt/gpupanel/test-evidence/{run} && printf '%s' '{run}' > {marker_path} && printf '\\nGPUPANEL_TERMINAL_OK_{run}\\n'"
        page.keyboard.insert_text(command)
        page.keyboard.press('Enter')
        expect(page.locator('.xterm-rows')).to_contain_text('GPUPANEL_TERMINAL_OK_' + run, timeout=10000)
        data = subprocess.check_output(['sudo', '-n', 'cat', marker_path], text=True)
        assert data == run
        result['checks']['terminal_websocket_execution_and_file_observed'] = True
        sessions = api('/hosts/terminal/sessions/search', {})
        owned = [item for item in sessions if item['kind'] == 'local']
        assert len(owned) == 1
        session_id = owned[0]['id']
        page.evaluate("""() => window.__hostAcceptanceSockets.find(socket => socket.url.includes('/hosts/terminal/local') && socket.readyState === WebSocket.OPEN).close(4000, 'acceptance disconnect')""")
        page.get_by_role('button', name='Reconnect', exact=False).click()
        expect(page.get_by_text('Connected', exact=True)).to_be_visible(timeout=15000)
        resumed = api('/hosts/terminal/sessions/search', {})
        assert len(resumed) == 1 and resumed[0]['id'] == session_id
        result['checks']['terminal_unexpected_disconnect_reattaches_same_session'] = True
        terminal.focus()
        page.keyboard.insert_text(f"printf '%s' '{run}' > /opt/gpupanel/test-evidence/{run}/reconnected.txt")
        page.keyboard.press('Enter')
        for _ in range(30):
            check = subprocess.run(['sudo', '-n', 'cat', '/opt/gpupanel/test-evidence/' + run + '/reconnected.txt'], capture_output=True, text=True)
            if check.returncode == 0 and check.stdout == run:
                break
            time.sleep(0.1)
        else:
            raise AssertionError('Reattached terminal did not execute the second command')
        result['marker_path'] = marker_path
        page.screenshot(path=str(STATE / 'terminal-live.png'), full_page=True)
        page.goto(URL + '/containers')
        page.wait_for_load_state('networkidle')
        assert not errors, errors
        task_ids = []
        create_task_id = str(uuid.uuid4())
        task_ids.append(create_task_id)
        created = True  # A lost response can still mean acceptance; cleanup requires independent inspect.
        api('/containers', {'taskID': create_task_id, 'name': canary, 'image': 'python:3.14-slim',
            'forcePull': False, 'networks': [{'network': 'none'}], 'publishAllPorts': False,
            'exposedPorts': [], 'volumes': [], 'privileged': False, 'user': '65534:65534',
            'nanoCPUs': 0.25, 'memory': 64, 'restartPolicy': 'no', 'autoRemove': False,
            'labels': ['gpupanel.acceptance.run=' + run],
            'cmd': ['python', '-u', '-c', f"import time;print('GPUPANEL_CANARY_{run}',flush=True);time.sleep(300)"]})
        current = wait_state('running')
        assert current['Image'] == image['Id']
        container_id = current['Id']
        result['checks']['container_create_and_running_observed'] = True
        page.reload()
        page.wait_for_load_state('networkidle')
        page.get_by_role('tab', name='Containers', exact=True).click()
        expect(page.get_by_role('row').filter(has_text=canary)).to_be_visible(timeout=15000)
        logs = subprocess.check_output(DOCKER + ['logs', canary], text=True)
        assert 'GPUPANEL_CANARY_' + run in logs
        result['checks']['container_list_and_logs'] = True
        page.get_by_role('row').filter(has_text=canary).screenshot(path=str(STATE / 'container-live.png'))
        for operation, status in [('stop', 'exited'), ('start', 'running')]:
            assert inspect()
            operation_task_id = str(uuid.uuid4())
            task_ids.append(operation_task_id)
            api('/containers/operate', {'taskID': operation_task_id, 'names': [container_id], 'operation': operation})
            wait_state(status)
        result['checks']['container_stop_start_observed'] = True
        remove_task_id = str(uuid.uuid4())
        task_ids.append(remove_task_id)
        api('/containers/operate', {'taskID': remove_task_id, 'names': [container_id], 'operation': 'remove'})
        wait_state('absent')
        created = False
        result['checks']['container_removed_observed'] = True
        page.goto(URL + '/apps?tab=installed')
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('tab', name='Installed', exact=True)).to_have_attribute('aria-selected', 'true')
        api('/apps/installed/search', {'page':1,'pageSize':10,'name':'','tags':[],'update':False,'sync':False})
        page.goto(URL + '/gpu')
        page.wait_for_load_state('networkidle')
        page.goto(URL + '/logs?tab=task')
        page.wait_for_load_state('networkidle')
        for _ in range(30):
            tasks = api('/logs/tasks/search', {'page':1,'pageSize':100,'type':'','status':''})
            statuses = {item['id']:item['status'] for item in tasks['items'] or [] if item['id'] in task_ids}
            if len(statuses) == 4 and all(status == 'Success' for status in statuses.values()):
                break
            time.sleep(0.1)
        else:
            raise AssertionError('Real task records did not reach Success')
        result['checks']['container_task_records_persisted'] = True
        result['task_ids'] = task_ids
        result['checks']['apps_gpu_and_tasks_routes'] = True
        assert not errors, errors
        result['page_errors'] = errors
        context.close()
        browser.close()
    (STATE / 'browser-live.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))
finally:
    if created:
        value = inspect()
        if value:
            subprocess.run(DOCKER + ['rm', '-f', value['Id']], check=True, capture_output=True)
