"""SIMULATED API: container mutation loss, no replay and manual reconcile."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:4189'
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local/install-test/vnext'
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'gpupanel:container-operation:pending:v1'
calls = {'operate': 0, 'search': 0}
row = {
    'containerID': 'fixture-id-1', 'name': 'fixture-nginx',
    'imageName': 'nginx:fixture', 'createTime': '2026-10-17',
    'state': 'running', 'runTime': '1h', 'network': [], 'ports': [],
    'isFromApp': False, 'isFromCompose': False,
}

def api(route):
    url = route.request.url
    path = url.split('/api/v1', 1)[1].split('?', 1)[0]
    data = {'items': [], 'total': 0}
    if path == '/core/auth/current':
        data = {'name': 'fixture', 'role': 'ADMIN'}
    elif path == '/containers/search':
        calls['search'] += 1
        data = {'items': [row], 'total': 1}
    elif path == '/containers/list/stats':
        data = []
    elif path == '/containers/status':
        data = {'containerCount': 1, 'running': 1, 'exited': 0,
                'created': 0, 'paused': 0, 'restarting': 0, 'dead': 0}
    elif path == '/containers/docker/status':
        data = {'isExist': True, 'isActive': True}
    elif path == '/containers/operate':
        body = route.request.post_data_json
        assert body == {'names': ['fixture-nginx'], 'operation': 'stop'}
        calls['operate'] += 1
        route.abort('failed')  # Docker could have acted; ACK was lost.
        return
    elif path == '/ai/gpu/load':
        data = {'gpu': [], 'npu': [], 'xpu': []}
    route.fulfill(status=200, content_type='application/json',
                  body=json.dumps({'code': 200, 'data': data}))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 960})
    context.add_init_script("""localStorage.setItem('gpupanel.auth', JSON.stringify({name:'fixture',role:'ADMIN',token:''}));
        localStorage.setItem('gpupanel.ui', JSON.stringify({language:'en',themeMode:'light',currentNode:'local'}));""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/v1/**', api)
    page.goto(URL + '/containers')
    page.wait_for_load_state('networkidle')
    page.get_by_role('tab', name='Containers', exact=True).click()
    expect(page.get_by_role('row').filter(has_text='fixture-nginx')).to_be_visible()
    page.get_by_role('row').filter(has_text='fixture-nginx').get_by_role('button', name='Stop', exact=True).click()
    expect(page.get_by_role('status', name='Container operation requires review')).to_be_visible()
    expect(page.get_by_role('status', name='Container operation requires review').get_by_text('Request outcome unknown.', exact=False)).to_be_visible()
    assert calls['operate'] == 1
    receipt = page.evaluate(f"JSON.parse(sessionStorage.getItem('{KEY}'))")
    assert set(receipt) == {'node', 'operation', 'names', 'createdAt'}
    assert receipt['node'] == 'local' and receipt['names'] == ['fixture-nginx']

    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('tab', name='Containers', exact=True).click()
    expect(page.get_by_role('status', name='Container operation requires review')).to_be_visible()
    page.get_by_role('row').filter(has_text='fixture-nginx').get_by_role('button', name='Stop', exact=True).click()
    assert calls['operate'] == 1, 'unreviewed reload must never resend a mutation'
    page.get_by_role('button', name='Refresh observations', exact=True).click()
    assert calls['operate'] == 1, 'read-only refresh must not retry mutation'
    page.screenshot(path=str(OUT / 'container-operation-unknown.png'), full_page=True)

    page.once('dialog', lambda d: d.accept())
    page.get_by_role('button', name='Reviewed manually', exact=True).click()
    expect(page.get_by_role('status', name='Container operation requires review')).to_have_count(0)
    assert page.evaluate(f"sessionStorage.getItem('{KEY}')") is None
    assert calls['operate'] == 1
    assert not errors, errors
    context.close()
    browser.close()
print(json.dumps({'kind': 'SIMULATED API only', 'mutations': calls['operate'],
                  'checks': ['lost ACK', 'pre-POST persisted hint', 'reload no replay',
                             'read-only refresh', 'explicit review clears hint'],
                  'page_errors': errors}))
