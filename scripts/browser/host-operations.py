"""SIMULATED API: operation preview, explicit consent and uncertain outcome UX."""
import json
import re
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:4189'
CANARY = 'a' * 64
state = {'plans': [], 'confirms': 0, 'lost': False, 'container_mutations': 0}


def api(route):
    path = route.request.url.split('/api/v1', 1)[1].split('?', 1)[0]
    data = {'items': [], 'total': 0}
    if path == '/core/auth/current':
        data = {'name': 'fixture', 'role': 'ADMIN'}
    elif path == '/hosts/operations/plan':
        intent = route.request.post_data_json
        assert 'command' not in intent
        assert ((intent['kind'] == 'host.diagnose' and intent['target'] == 'local') or
                (intent['kind'] == 'container.restart' and intent['target'] == CANARY))
        data = {'id': 'fixture-operation-' + str(len(state['plans'])), 'kind': intent['kind'], 'target': intent['target'],
                'host': 'local', 'impact': 'Read local OS only. No changes.', 'expected': 'read-only',
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
        data['output'] = '{"hostname":"observed-fixture"}'
    elif path == '/hosts/operations':
        data = state['plans']
    elif path == '/containers/search':
        data = {'items': [{'containerID': CANARY, 'name': 'fixture-canary',
                           'imageName': 'fixture:local', 'createTime': '2026-10-17',
                           'state': 'running', 'runTime': '1m', 'network': [], 'ports': [],
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
    expect(page.get_by_text('{"hostname":"observed-fixture"}', exact=True).first).to_be_visible()
    assert state['confirms'] == 1
    page.reload()
    expect(page.locator('summary').filter(has_text='completed')).to_be_visible()
    assert state['confirms'] == 1
    state['lost'] = True
    page.get_by_role('button', name='Preview operation', exact=True).click()
    page.get_by_role('button', name='Confirm and execute', exact=True).click()
    expect(page.get_by_text('Outcome is not confirmed.', exact=False).first).to_be_visible()
    assert state['confirms'] == 2
    page.get_by_role('button', name='Refresh', exact=True).click()
    expect(page.locator('summary').filter(has_text='unknown')).to_be_visible()
    assert state['confirms'] == 2

    # Container -> HostOps bridge: full ID selects a plan intention, not execution.
    planned, confirmed = len(state['plans']), state['confirms']
    page.goto(URL + '/containers')
    page.get_by_role('tab', name='Containers', exact=True).click()
    row = page.get_by_role('row').filter(has_text='fixture-canary')
    expect(row).to_be_visible()
    row.get_by_role('button', name='Actions', exact=True).click()
    page.get_by_role('menuitem', name='Review restart', exact=True).click()
    expect(page).to_have_url(re.compile(r'/host\?tab=operations&restartTarget=' + CANARY))
    expect(page.get_by_role('textbox', name='Full 64-character container ID', exact=True)).to_have_value(CANARY)
    assert len(state['plans']) == planned and state['confirms'] == confirmed
    assert state['container_mutations'] == 0
    page.get_by_role('button', name='Preview operation', exact=True).click()
    expect(page.get_by_role('button', name='Confirm and execute', exact=True)).to_be_enabled()
    assert len(state['plans']) == planned + 1 and state['confirms'] == confirmed
    # Do not confirm: only an authorized human confirms a real Docker operation.
    page.set_viewport_size({'width': 1024, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    browser.close()
print(json.dumps({'kind': 'SIMULATED API, not deployment', 'checks': ['preview without execution', 'explicit confirmation', 'refresh restores receipts without replay', 'unknown outcome queries only', '1024 layout', 'container deep-link requests preview only, no legacy mutation'], 'page_errors': errors}))
