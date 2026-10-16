"""SIMULATED API browser acceptance for React integration; no host services are started."""
import json
import re
import subprocess
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:4189'
KEY = 'gpupanel:app-install:pending:v1'
TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
state = {'installs': 0, 'login': 0, 'mfa': 0, 'captcha': 0, 'fail_list': False, 'no_key': False}

# Only a synthetic public key enters browser cookies. Never touch real panel credentials.
private = subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048'], capture_output=True, check=True).stdout
public = subprocess.run(['openssl', 'pkey', '-pubout'], input=private, capture_output=True, check=True).stdout
import base64
COOKIE = base64.b64encode(public).decode()

def api(route):
    path = route.request.url.split('/api/v1', 1)[1].split('?')[0]
    data = {}; code = 200
    if path.endswith('/core/auth/current'): data = {'name': 'admin', 'role': 'ADMIN'}
    elif path.endswith('/core/auth/setting'): data = {'needCaptcha': state['login'] > 0}
    elif path.endswith('/core/auth/captcha'):
        state['captcha'] += 1
        data = {'captchaID': 'fixture', 'imagePath': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E'}
    elif path.endswith('/core/auth/login'):
        state['login'] += 1
        body = route.request.post_data_json
        assert body['password'] != 'fixture-password', 'password must never fall back to plaintext'
        if state['login'] == 1:
            code = 400
        else:
            assert body['captchaID'] == 'fixture' and body['captcha'] == '1234'
            data = {'name': 'admin', 'mfaStatus': 'Enable', 'mfaSession': 'mfa-fixture'}
    elif path.endswith('/core/auth/mfalogin'):
        state['mfa'] += 1
        assert route.request.post_data_json['sessionId'] == 'mfa-fixture'
        assert route.request.post_data_json['code'] == '654321'
        data = {'name': 'admin', 'role': 'ADMIN', 'token': '', 'mfaStatus': 'Disable', 'mfaSession': ''}
    elif path == '/apps/installed/search':
        data = {'total': 1, 'items': [{'id': 7, 'name': 'Uncertain app', 'appKey': 'localdemo', 'status': 'Unknown', 'version': '1.0'}]}
    elif path == '/apps/installed/evidence/7':
        data = {'installId': 7, 'classification': 'UNKNOWN', 'verified': False, 'observedAt': '2026-10-15T00:00:00Z', 'reasons': ['Operator review required'], 'containers': [], 'env': 'SECRET_FIXTURE_NOT_FOR_UI'}
    elif path == '/apps/search':
        assert route.request.post_data_json['resource'] == 'local'
        if state['fail_list']: code = 500
        data = {'total': 1, 'items': [{'id': 1, 'key': 'localdemo', 'name': 'Demo', 'description': 'Fixture', 'installed': False}]}
    elif path == '/apps/tags': data = []
    elif path == '/apps/localdemo': data = {'id': 1, 'key': 'localdemo', 'name': 'Demo', 'versions': ['1.0'], 'installed': False}
    elif path.startswith('/apps/detail/'): data = {'id': 11, 'params': {'formFields': []}}
    elif path == '/apps/install':
        state['installs'] += 1
        body = route.request.post_data_json
        assert re.fullmatch(r'[0-9a-f-]{36}', body['taskID'])
        # Simulate lost ACK after possible acceptance. No actual Docker call.
        route.abort('failed'); return
    elif path == '/logs/tasks/read': data = {'scope': 'admission', 'taskStatus': 'Unknown', 'lines': ['Outcome UNKNOWN'], 'end': True}
    elif path == '/containers/docker/status': data = {'isExist': True, 'isActive': False}
    elif path == '/dashboard/base/os': data = {'os': 'linux', 'prettyDistro': 'Ubuntu fixture', 'kernelArch': 'amd64'}
    elif path.startswith('/dashboard/base/'): data = {'hostname': 'fixture', 'currentInfo': {'cpuUsedPercent': 12, 'load1': 0, 'load5': 0, 'load15': 0, 'diskData': []}}
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'code': code, 'message': 'fixture error' if code != 200 else '', 'data': data}))

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    context.add_cookies([{'name': 'panel_public_key', 'value': COOKIE, 'url': URL}])
    page = context.new_page()
    page.set_default_timeout(10000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/v1/**', api)
    page.goto(URL + '/login'); page.wait_for_load_state('networkidle')
    page.locator('input[autocomplete="username"]').fill('admin')
    page.locator('input[autocomplete="current-password"]').fill('fixture-password')
    page.locator('button[type="submit"]').click()
    expect(page.get_by_label('验证码 / Captcha', exact=True)).to_be_visible()
    page.get_by_label('验证码 / Captcha', exact=True).fill('1234')
    page.locator('button[type="submit"]').click()
    expect(page.locator('input[autocomplete="one-time-code"]')).to_be_visible()
    assert page.evaluate("localStorage.getItem('gpupanel.auth')") is None
    assert '/login' in page.url, 'MFA challenge must not mount privileged layout'
    page.locator('input[autocomplete="one-time-code"]').fill('654321')
    page.locator('button[type="submit"]').click()
    expect(page.get_by_text('Readiness checks', exact=True)).to_be_visible()
    assert state['mfa'] == 1
    page.goto(URL + '/apps'); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name=re.compile('^(安装|Install)$')).first.click()
    modal = page.get_by_role('dialog')
    expect(modal).to_be_visible()
    page.wait_for_load_state('networkidle')
    # Handle the existing native destructive-action confirmation explicitly.
    decisions = [False, True]
    observed = []
    def confirmation(dialog):
        accept = decisions.pop(0)
        observed.append(accept)
        dialog.accept() if accept else dialog.dismiss()
    page.on('dialog', confirmation)
    with page.expect_event('dialog'):
        modal.get_by_role('button', name=re.compile('^(confirm|Install|安装)$', re.I)).click()
    assert observed == [False] and state['installs'] == 0
    with page.expect_event('dialog'):
        modal.get_by_role('button', name=re.compile('^(confirm|Install|安装)$', re.I)).click()
    expect(page.get_by_text(re.compile('结果未核对，禁止再次提交'))).to_be_visible()
    assert state['installs'] == 1
    receipt = page.evaluate(f"JSON.parse(sessionStorage.getItem('{KEY}'))")
    assert set(receipt) == {'taskID', 'node', 'appKey'}
    expect(modal.get_by_role('button', name=re.compile('^(安装|Install|confirm)$', re.I))).to_be_disabled()
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name=re.compile('检查未核对安装|Review unresolved install')).click()
    expect(modal.get_by_role('button', name=re.compile('^(安装|Install|confirm)$', re.I))).to_be_disabled()
    assert state['installs'] == 1
    page.screenshot(path='/tmp/gpupanel-react-recovery.png', full_page=True)
    modal.get_by_role('button', name=re.compile('^(cancel|取消)$', re.I)).click()
    page.get_by_role('tab', name='Installed', exact=True).click()
    row = page.get_by_role('row').filter(has_text='Uncertain app')
    expect(row).to_be_visible()
    expect(row.get_by_role('button', name='Stop', exact=True)).to_have_count(0)
    row.get_by_role('button', name='证据 / Evidence', exact=True).click()
    expect(page.get_by_text('Operator review required', exact=True)).to_be_visible()
    assert 'SECRET_FIXTURE_NOT_FOR_UI' not in page.locator('body').inner_text()
    assert state['installs'] == 1
    page.get_by_role('dialog', name=re.compile('Read-only application evidence')).evaluate("async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))); }")
    page.screenshot(path='/tmp/gpupanel-react-evidence.png', full_page=True)
    assert not errors, errors
    context.close()
    browser.close()
print('PASS simulated browser: captcha retry, MFA challenge/completion, local-only catalog, cancelled install, lost ACK, receipt reload, duplicate denial, UNKNOWN mutation denial, redacted evidence; no page errors')
