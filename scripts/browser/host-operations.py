"""SIMULATED API: operation preview, explicit consent and uncertain outcome UX."""
import json
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:4189'
state = {'plans': [], 'confirms': 0, 'lost': False}


def api(route):
    path = route.request.url.split('/api/v1', 1)[1].split('?', 1)[0]
    data = {'items': [], 'total': 0}
    if path == '/core/auth/current':
        data = {'name': 'fixture', 'role': 'ADMIN'}
    elif path == '/hosts/operations/plan':
        intent = route.request.post_data_json
        assert 'command' not in intent and intent['target'] == 'local'
        data = {'id': 'fixture-operation-' + str(len(state['plans'])), 'kind': intent['kind'], 'target': 'local',
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
    page.set_viewport_size({'width': 1024, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    browser.close()
print(json.dumps({'kind': 'SIMULATED API, not deployment', 'checks': ['preview without execution', 'explicit confirmation', 'refresh restores receipts without replay', 'unknown outcome queries only', '1024 layout'], 'page_errors': errors}))
