#!/usr/bin/env python3
"""Live browser smoke against only the task-owned installed VM, without API mocks."""
import json
import candidate_identity
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import vm

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / '.local/install-test'
if not vm.owned_pid('qemu.pid', str(vm.STATE / 'disk.qcow2')):
    raise SystemExit('Task-owned disposable VM is not running')
credentials = json.loads((STATE / 'credentials.json').read_text())
if credentials['url'] != f'http://127.0.0.1:{vm.PANEL_PORT}':
    raise SystemExit('Refuse a non-fixture target')
binary_before = candidate_identity.assert_installed_candidate(vm)
checkout_commit = candidate_identity.source_checkout_commit(ROOT)
result = {'kind': 'LIVE local VM; no intercepted APIs', 'target': credentials['url']}


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
if candidate_identity.assert_installed_candidate(vm) != binary_before:
    raise RuntimeError('installed candidate binary changed during live browser smoke')
if candidate_identity.source_checkout_commit(ROOT) != checkout_commit:
    raise RuntimeError('source checkout changed during live browser smoke')
result['binary_sha256'] = binary_before
result['candidate_commit'] = checkout_commit
(STATE / 'browser-live.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
