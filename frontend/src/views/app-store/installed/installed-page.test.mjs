import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstalledListRevision, parseInstalledAppPage } from './installed-page.ts';

const row = (id = 1) => ({
    id, name: 'jupyter', status: 'Running', appKey: 'jupyter',
    path: '/opt/apps/jupyter', serviceName: 'jupyter', favorite: false,
    app: { website: '', document: '', github: '' }, container: 'example',
});

test('installed apps: valid empty and populated pages', () => {
    assert.deepEqual(parseInstalledAppPage({ items: [], total: 0 }), { items: [], total: 0 });
    const result = parseInstalledAppPage({ items: [row()], total: 3 });
    assert.equal(result.items[0].name, 'jupyter');
    assert.equal(result.total, 3);
});

test('installed apps: malformed response is an error, never empty success', () => {
    for (const value of [null, undefined, {}, [], { items: {}, total: 0 },
        { items: [], total: -1 }, { items: [], total: Number.NaN },
        { items: [], total: 1.5 }, { items: [row()], total: 0 },
        { items: [null], total: 1 }, { items: [{ ...row(), id: 0 }], total: 1 },
        { items: [{ ...row(), status: undefined }], total: 1 },
        { items: [{ ...row(), favorite: 'false' }], total: 1 },
        { items: [{ ...row(), app: null }], total: 1 }]) {
        assert.throws(() => parseInstalledAppPage(value));
    }
});

test('installed apps: accepts transitional backend status without interpreting as complete', () => {
    assert.equal(parseInstalledAppPage({ items: [{ ...row(), status: 'Unknown' }], total: 1 })
        .items[0].status, 'Unknown');
});

test('installed apps: latest query wins over late same-node response', () => {
    const fence = new InstalledListRevision();
    const oldSearch = fence.next('alpha');
    const latest = fence.next('alpha');
    assert.equal(fence.active(oldSearch, 'alpha'), false);
    assert.equal(fence.active(latest, 'alpha'), true);
});

test('installed apps: moving nodes rejects previously started query', () => {
    const fence = new InstalledListRevision();
    const first = fence.next('alpha');
    assert.equal(fence.active(first, 'beta'), false);
    fence.invalidate();
    const second = fence.next('beta');
    assert.equal(fence.active(first, 'alpha'), false);
    assert.equal(fence.active(second, 'beta'), true);
});

test('installed apps: unmount and sorting invalidate pending list response', () => {
    const fence = new InstalledListRevision();
    const ticket = fence.next('local');
    fence.invalidate();
    assert.equal(fence.active(ticket, 'local'), false);
});
