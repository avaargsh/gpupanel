"""SIMULATED API: vNext layout, accessibility, unavailable capabilities and scope."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

URL = 'http://127.0.0.1:4189'
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / '.local/install-test/vnext'
OUTPUT.mkdir(parents=True, exist_ok=True)
state = {'fail': False, 'requests': [], 'sockets': []}


def api(route):
    parsed = urlparse(route.request.url)
    path = parsed.path.split('/api/v1', 1)[1]
    state['requests'].append((path, route.request.headers.get('currentnode', 'local'), parsed.query))
    node = route.request.headers.get('currentnode', 'local')
    data = {'items': [], 'total': 0}
    if path.endswith('/core/auth/current'):
        data = {'name': 'fixture', 'role': 'ADMIN'}
    elif path == '/dashboard/base/os':
        data = {'os': 'linux', 'prettyDistro': 'Ubuntu fixture', 'kernelArch': 'amd64'}
    elif path.startswith('/dashboard/base/'):
        data = {'hostname': 'observed-fixture-host' if node == 'local' else 'observed-fixture-remote', 'currentInfo': {'cpuUsedPercent': 24 if node == 'local' else 61, 'memoryUsedPercent': 38, 'diskData': [], 'timeSinceUptime': 'fixture uptime'}}
    elif path == '/ai/gpu/load':
        data = {'gpu': [], 'npu': [], 'xpu': []}
    elif path == '/containers/docker/status':
        data = {'isActive': False, 'isExist': True}
    elif path.startswith('/apps/tags'):
        data = []
    failed = state['fail'] and path.startswith('/dashboard/base/')
    route.fulfill(status=503 if failed else 200, content_type='application/json',
                  body=json.dumps({'code': 503 if failed else 200, 'data': data, 'message': 'fixture unavailable' if failed else ''}))


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1100}, reduced_motion='reduce')
    context.add_init_script("""if (!localStorage.getItem('gpupanel.auth')) {
        localStorage.setItem('gpupanel.auth', JSON.stringify({name:'fixture',role:'ADMIN',token:''}));
        localStorage.setItem('gpupanel.ui', JSON.stringify({language:'en',themeMode:'light',sidebarCollapsed:false,currentNode:''}));
    }""")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/v1/**', api)
    page.route_web_socket('**/api/v1/hosts/terminal/**', lambda ws: state['sockets'].append(ws.url))
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('heading', name='Workbench', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='New project', exact=True)).to_be_disabled()
    expect(page.get_by_text('Project records are not connected', exact=True)).to_be_visible()
    expect(page.get_by_text('24.0%', exact=True)).to_be_visible()
    expect(page.locator('.workspace-sidebar')).to_have_css('width', '240px')
    expect(page.locator('.workspace-header')).to_have_css('height', '56px')
    # Visual structure invariants: aligned chrome, real primary actions,
    # resources above the empty project state and no fabricated project route.
    brand_box = page.locator('.workspace-brand').bounding_box()
    header_box = page.locator('.workspace-header').bounding_box()
    assert brand_box and header_box and round(brand_box['height']) == round(header_box['height']) == 56
    assert round(brand_box['y']) == round(header_box['y']) == 0
    hero_box = page.locator('.workbench-start').bounding_box()
    resource_box = page.locator('.workbench-resources').bounding_box()
    project_box = page.locator('.workbench-columns').bounding_box()
    assert hero_box and resource_box and project_box
    assert hero_box['y'] + hero_box['height'] <= resource_box['y']
    assert resource_box['y'] + resource_box['height'] <= project_box['y']
    assert page.locator('.workbench-action').count() == 2
    assert not page.locator('.workspace-sidebar .workspace-nav-link.unavailable').count()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.get_by_role('dialog').count() == 0
    assert not any(path.startswith(('/projects', '/workspaces', '/sessions')) for path, _, _ in state['requests'])
    assert page.get_by_role('link', name='Advanced AI settings', exact=True).count() == 1
    assert page.locator('.workspace-sidebar').get_by_role('link', name='GPU & accelerators', exact=True).get_attribute('href') == '/gpu'
    assert page.locator('.workbench-tool-links a').filter(has_text='View background tasks').get_attribute('href') == '/logs?tab=task'
    page.keyboard.press('Tab')
    expect(page.get_by_role('link', name='Skip to main content')).to_be_focused()
    page.keyboard.press('Enter')
    expect(page.locator('#workspace-content')).to_be_focused()
    assert page.locator('.workspace-sidebar').bounding_box()['x'] == 0
    assert page.locator('.workspace-header').bounding_box()['x'] == 240
    page.locator('#workspace-content').evaluate('(el) => { el.scrollTop = 0; el.blur(); }')
    page.screenshot(path=str(OUTPUT / 'home-light.png'), full_page=True)
    page.get_by_role('button', name='Switch theme', exact=True).click()
    expect(page.locator('html')).to_have_class(re.compile(r'(^|\s)dark(\s|$)'))
    expect(page.locator('.workbench-start')).to_have_css('background-color', 'rgb(25, 29, 38)')
    expect(page.locator('.workspace-brand')).to_have_css('color', 'rgb(237, 240, 247)')
    page.screenshot(path=str(OUTPUT / 'home-dark.png'), full_page=True)
    page.get_by_role('button', name='Collapse sidebar', exact=True).first.click()
    expect(page.locator('.workspace-sidebar')).to_have_css('width', '64px')
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(page.locator('.workspace-sidebar')).to_have_css('width', '64px')
    page.get_by_role('button', name='Expand sidebar', exact=True).first.click()
    page.set_viewport_size({'width': 1024, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.locator('.workspace-header').evaluate('(el) => el.scrollWidth <= el.clientWidth')
    page.screenshot(path=str(OUTPUT / 'home-1024.png'), full_page=True)
    page.get_by_role('button', name='AI assistant', exact=True).click()
    expect(page.get_by_role('dialog', name='GPUPanel Assistant')).to_be_visible()
    expect(page.get_by_text('Chat is not connected yet', exact=False)).to_be_visible()
    page.keyboard.press('Control+k')
    assert page.get_by_role('dialog').count() == 1, 'global search must not open behind the assistant'
    page.get_by_label('Question draft').fill('fixture question')
    for _ in range(10):
        page.keyboard.press('Tab')
        assert page.get_by_role('dialog', name='GPUPanel Assistant').evaluate('(el) => el.contains(document.activeElement)')
    page.screenshot(path=str(OUTPUT / 'assistant.png'), full_page=True)
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog', name='GPUPanel Assistant')).not_to_be_visible()
    expect(page.get_by_role('button', name='AI assistant', exact=True)).to_be_focused()
    page.keyboard.press('Control+k')
    search = page.get_by_role('dialog')
    expect(search).to_be_visible()
    search.locator('input').fill('Environments')
    expect(page.get_by_text('No matches', exact=False)).to_be_visible()
    page.keyboard.press('Escape')
    # A failed refresh must remove the previous observed numbers and connection claim.
    state['fail'] = True
    page.get_by_role('button', name='Read again', exact=True).click()
    expect(page.get_by_text('24.0%', exact=True)).not_to_be_visible()
    expect(page.locator('.host-scope')).to_have_attribute('data-state', 'unavailable')
    state['fail'] = False
    page.get_by_role('button', name='Read again', exact=True).click()
    expect(page.get_by_text('24.0%', exact=True)).to_be_visible()
    # Drive the existing store scope transition; no remote enrollment is claimed.
    page.evaluate("""async () => {
        const {store} = await import('/src/store/index.ts');
        const {setCurrentNode} = await import('/src/features/ui/uiSlice.ts');
        store.dispatch(setCurrentNode('fixture-remote'));
    }""")
    expect(page.locator('.host-scope strong')).to_have_text('fixture-remote')
    expect(page.get_by_text('observed-fixture-remote', exact=True)).to_be_visible()
    expect(page.get_by_text('61.0%', exact=True)).to_be_visible()
    expect(page.get_by_text('24.0%', exact=True)).not_to_be_visible()
    page.get_by_role('button', name='AI assistant', exact=True).click()
    expect(page.get_by_label('Question draft')).to_have_value('')
    page.keyboard.press('Escape')
    page.locator('.workspace-sidebar').get_by_role('link', name='Terminal', exact=True).click()
    page.wait_for_load_state('networkidle')
    expect(page.locator('.workspace-sidebar').get_by_role('link', name='Terminal', exact=True)).to_have_attribute('aria-current', 'page')
    page.wait_for_function("document.querySelector('.xterm') !== null")
    for _ in range(100):
        if state['sockets']:
            break
        page.wait_for_timeout(50)
    terminal_requests = [(path, query) for path, _, query in state['requests'] if path == '/hosts/terminal/local']
    assert terminal_requests, 'terminal auth probe missing'
    assert all(parse_qs(query).get('operateNode') == ['fixture-remote'] for _, query in terminal_requests)
    assert state['sockets'] and all(parse_qs(urlparse(url).query).get('operateNode') == ['fixture-remote'] for url in state['sockets'])
    page.goto(URL + '/apps?tab=installed')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('tab', name='Installed', exact=True)).to_have_attribute('aria-selected', 'true')
    page.goto(URL)
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='Language', exact=True).click()
    page.get_by_text('简体中文', exact=True).click()
    expect(page.get_by_role('heading', name='工作台', exact=True)).to_be_visible()
    page.get_by_role('heading', name='工作台', exact=True).click()
    page.set_viewport_size({'width': 1280, 'height': 1000})
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    page.screenshot(path=str(OUTPUT / 'home-zh.png'), full_page=True)
    # Fixed assistant must not obscure readiness links at the desktop viewport.
    launcher = page.get_by_role('button', name='AI 助手').bounding_box()
    assert launcher
    for link in page.locator('.workbench-readiness-actions a').all():
        target = link.bounding_box()
        assert target
        intersects = (launcher['x'] < target['x'] + target['width']
                      and launcher['x'] + launcher['width'] > target['x']
                      and launcher['y'] < target['y'] + target['height']
                      and launcher['y'] + launcher['height'] > target['y'])
        assert not intersects, 'AI launcher must not cover readiness links'
    page.set_viewport_size({'width': 640, 'height': 900})
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.locator('.workspace-header').evaluate('(el) => el.scrollWidth <= el.clientWidth')
    expect(page.locator('.host-scope')).to_be_visible()
    page.screenshot(path=str(OUTPUT / 'home-640.png'), full_page=True)
    assert not errors, errors
    result = {'kind': 'SIMULATED API; not real device or deployment acceptance', 'page_errors': errors,
              'checks': ['light/dark', '1440/1280/1024/640 layout', 'Chinese/English', 'collapse persistence', 'keyboard skip/search/escape',
                         'unavailable project state', 'failed refresh clears metrics', 'scope resets draft',
                         'terminal HTTP and WebSocket select remote scope', 'installed deep link'],
              'terminal_scope_requests': len(terminal_requests)}
    (OUTPUT / 'browser.json').write_text(json.dumps(result, indent=2) + '\n')
    context.close()
    browser.close()
print('PASS simulated vNext shell: layout, keyboard, unavailable states, refresh recovery and terminal scope')
