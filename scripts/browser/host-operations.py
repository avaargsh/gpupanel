"""SIMULATED API: operation preview, explicit consent and uncertain outcome UX."""
import json
import re
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:4189'
CANARY = 'a' * 64
state = {'plans': [], 'confirms': 0, 'lost': False, 'container_mutations': 0, 'canary_running': True}


def api(route):
    path = route.request.url.split('/api/v1', 1)[1].split('?', 1)[0]
    data = {'items': [], 'total': 0}
    if path == '/core/auth/current':
        data = {'name': 'fixture', 'role': 'ADMIN'}
    elif path == '/hosts/operations/plan':
        intent = route.request.post_data_json
        assert 'command' not in intent
        assert ((intent['kind'] == 'host.diagnose' and intent['target'] == 'local') or
                (intent['kind'] in ('container.diagnose', 'container.restart', 'container.start', 'container.stop') and intent['target'] == CANARY))
        data = {'id': 'fixture-operation-' + str(len(state['plans'])), 'kind': intent['kind'], 'target': intent['target'],
                'host': 'local', 'impact': ('Read local OS only. No changes.' if intent['kind'] == 'host.diagnose' else
                'Read local Docker state only. No changes.' if intent['kind'] == 'container.diagnose' else
                'Container process state may change.'), 'expected': 'read-only',
                'hash': 'fixture-bound-hash', 'state': 'planned', 'output': '', 'error': '',
                'createdAt': '2026-10-16T00:00:00Z', 'expiresAt': '2099-01-01T00:00:00Z', 'verified': False}
        state['plans'].append(data)
    elif path.endswith('/confirm'):
        assert route.request.post_data_json == {'hash': 'fixture-bound-hash', 'confirm': True}
        state['confirms'] += 1
        data = state['plans'][-1]
        if state['lost']:
            data['state'] = 'unknown'
            route.abort('failed')
            return
        data['state'] = 'completed'
        if data['kind'] == 'container.diagnose':
            data['output'] = json.dumps({
                'schema': 'gpupanel.host.container-diagnosis.v1',
                'observation': 'read-only-docker-inspect',
                'containerId': CANARY, 'observedAt': '2026-10-18T11:58:00Z',
                'status': 'exited', 'running': False, 'exitCode': 137,
                'oomKilled': True, 'health': 'unhealthy',
                'environment': {'API_TOKEN': 'SECRET_CONTAINER_ENV'},
            })
        else:
            data['output'] = json.dumps({
                'hostname': 'observed-fixture',
                'os': 'linux', 'platform': 'ubuntu', 'arch': 'x86_64',
                'kernelVersion': '6.8.0-48-generic', 'uptimeSeconds': 3600,
                'rootFilesystem': {'totalBytes': 1000, 'usedBytes': 200, 'usedPercent': 20},
                'accelerators': [],
            })
    elif path == '/hosts/operations':
        data = state['plans']
    elif path == '/containers/search':
        data = {'items': [{'containerID': CANARY, 'name': 'fixture-canary',
                           'imageName': 'fixture:local', 'createTime': '2026-10-17',
                           'state': 'running' if state['canary_running'] else 'exited',
                           'runTime': '1m', 'network': [], 'ports': [],
                           'isFromApp': False, 'isFromCompose': False}], 'total': 1}
    elif path == '/containers/list/stats':
        data = []
    elif path == '/containers/status':
        data = {'containerCount': 1, 'running': 1}
    elif path == '/containers/docker/status':
        data = {'isExist': True, 'isActive': True}
    elif path == '/containers/operate':
        state['container_mutations'] += 1
        raise AssertionError('UI restart must not use unverified legacy /containers/operate')
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'code': 200, 'data': data}))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 960})
    context.add_init_script("""localStorage.setItem('gpupanel.auth',JSON.stringify({name:'fixture',role:'ADMIN',token:''}));
        localStorage.setItem('gpupanel.ui',JSON.stringify({language:'en',themeMode:'light',currentNode:'local'}));""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/v1/**', api)
    page.goto(URL + '/host?tab=operations')
    expect(page.get_by_role('button', name='Preview operation', exact=True)).to_be_visible()
    assert state['confirms'] == 0
    page.get_by_role('button', name='Preview operation', exact=True).click()
    expect(page.get_by_role('button', name='Confirm and execute', exact=True)).to_be_enabled()
    assert state['confirms'] == 0
    expect(page.get_by_text('Read local OS only. No changes.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Confirm and execute', exact=True).click()
    expect(page.get_by_role('region', name='Read-only local host snapshot').first).to_be_visible()
    expect(page.get_by_text('linux ubuntu', exact=True).first).to_be_visible()
    expect(page.get_by_text('No devices reported (hardware absence not proven)', exact=True).first).to_be_visible()
    assert page.get_by_text('observed-fixture').count() == 0
    assert page.locator('pre.log-output').filter(has_text='hostname').count() == 0
    assert state['confirms'] == 1
    page.reload()
    expect(page.locator('summary').filter(has_text='completed')).to_be_visible()
    assert state['confirms'] == 1
    # Read-only container diagnosis uses the same existing approval/receipt path.
    # Selecting and previewing never call Docker's legacy mutation API.
    planned = len(state['plans'])
    page.get_by_role('combobox', name='Operation', exact=True).select_option('container.diagnose')
    page.get_by_role('textbox', name='Full 64-character container ID', exact=True).fill(CANARY)
    assert len(state['plans']) == planned and state['container_mutations'] == 0
    page.get_by_role('button', name='Preview operation', exact=True).click()
    expect(page.get_by_role('button', name='Confirm and execute', exact=True)).to_be_enabled()
    assert state['confirms'] == 1
    page.get_by_role('button', name='Confirm and execute', exact=True).click()
    expect(page.get_by_role('region', name='Read-only container evidence').first).to_be_visible()
    expect(page.get_by_text('unhealthy', exact=True).first).to_be_visible()
    assert page.get_by_text('SECRET_CONTAINER_ENV').count() == 0
    assert state['container_mutations'] == 0 and state['confirms'] == 2
    page.get_by_role('combobox', name='Operation', exact=True).select_option('host.diagnose')
    state['lost'] = True
    page.get_by_role('button', name='Preview operation', exact=True).click()
    page.get_by_role('button', name='Confirm and execute', exact=True).click()
    expect(page.get_by_text('Outcome is not confirmed.', exact=False).first).to_be_visible()
    assert state['confirms'] == 3
    page.get_by_role('button', name='Refresh', exact=True).click()
    expect(page.locator('summary').filter(has_text='unknown')).to_be_visible()
    assert state['confirms'] == 3

    # Container -> HostOps bridge: full ID selects a plan intention, not execution.
    planned, confirmed = len(state['plans']), state['confirms']
    page.goto(URL + '/containers')
    page.get_by_role('tab', name='Containers', exact=True).click()
    row = page.get_by_role('row').filter(has_text='fixture-canary')
    expect(row).to_be_visible()
    # Entry is a deep link to manual review, not an automatic inspection.
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Inspect one container (read-only)', exact=True).click()
    expect(page).to_have_url(re.compile(r'/host\\?tab=operations&operationKind=container.diagnose&operationTarget=' + CANARY))
    assert len(state['plans']) == planned and state['confirms'] == confirmed
    page.goto(URL + '/containers')
    page.get_by_role('tab', name='Containers', exact=True).click()
    row = page.get_by_role('row').filter(has_text='fixture-canary')
    expect(row).to_be_visible()
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Review restart', exact=True).click()
    expect(page).to_have_url(re.compile(r'/host\?tab=operations&operationKind=container.restart&operationTarget=' + CANARY))
    expect(page.get_by_role('textbox', name='Full 64-character container ID', exact=True)).to_have_value(CANARY)
    assert len(state['plans']) == planned and state['confirms'] == confirmed
    assert state['container_mutations'] == 0
    page.get_by_role('button', name='Preview operation', exact=True).click()
    expect(page.get_by_role('button', name='Confirm and execute', exact=True)).to_be_enabled()
    assert len(state['plans']) == planned + 1 and state['confirms'] == confirmed
    # Do not confirm: only an authorized human confirms a real Docker operation.
    # Start and stop use the same verified HostOperations path; browsing never mutates.
    for operation, running in [('stop', True), ('start', False)]:
        state['canary_running'] = running
        page.goto(URL + '/containers')
        page.get_by_role('tab', name='Containers', exact=True).click()
        row = page.get_by_role('row').filter(has_text='fixture-canary')
        expect(row).to_be_visible()
        planned, confirmed = len(state['plans']), state['confirms']
        row.get_by_role('button', name=operation.capitalize(), exact=True).click()
        expect(page).to_have_url(re.compile(r'/host\?tab=operations&operationKind=container.' +
                                           operation + r'&operationTarget=' + CANARY))
        expect(page.get_by_role('textbox', name='Full 64-character container ID', exact=True)).to_have_value(CANARY)
        assert len(state['plans']) == planned and state['confirms'] == confirmed
        assert state['container_mutations'] == 0
        page.get_by_role('button', name='Preview operation', exact=True).click()
        expect(page.get_by_role('button', name='Confirm and execute', exact=True)).to_be_enabled()
        assert state['plans'][-1]['kind'] == 'container.' + operation
        assert len(state['plans']) == planned + 1 and state['confirms'] == confirmed
    page.set_viewport_size({'width': 1024, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    browser.close()
print(json.dumps({'kind': 'SIMULATED API, not deployment', 'checks': ['preview without execution', 'explicit confirmation', 'refresh restores receipts without replay', 'unknown outcome queries only', '1024 layout', 'container restart/start/stop deep links preview only, no legacy mutation'], 'page_errors': errors}))
