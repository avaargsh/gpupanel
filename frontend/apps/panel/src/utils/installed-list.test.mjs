import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installedSearchRequest, parseInstalledPage } from './installed-list.ts';

const query = (scopeNode) => ({
    scopeNode, page: 1, pageSize: 20, name: '', tags: [], update: false, sync: false,
});
const app = (id = 7) => ({ id, name: 'Jupyter', status: 'Running', appKey: 'jupyter',
    appID: 2, appDetailID: 3, version: '1.0', path: '/opt/jupyter' });

test('installed-list request is explicitly bound to one node and preserves the Agent DTO', () => {
    const request = installedSearchRequest(query('host-1'));
    assert.equal(request.url, '/apps/installed/search');
    assert.equal(request.method, 'POST');
    assert.deepEqual(request.headers, { CurrentNode: 'host-1' });
    assert.equal(request.body.pageSize, 20);
    assert.equal('scopeNode' in request.body, false);
});

test('different nodes cannot share the same query argument or CurrentNode header', () => {
    const a = installedSearchRequest(query('local'));
    const b = installedSearchRequest(query('server/B'));
    assert.equal(a.headers.CurrentNode, 'local');
    assert.equal(b.headers.CurrentNode, 'server%2FB');
    assert.notDeepEqual(a, b);
});

test('reject malicious or missing node scope instead of using ambient scope', () => {
    for (const node of ['', 'evil\r\nAnother: header', '\u0000', 'x'.repeat(257)]) {
        assert.throws(() => installedSearchRequest(query(node)));
    }
});

test('real Agent nil items and zero total are a valid empty list', () => {
    assert.deepEqual(parseInstalledPage({ items: null, total: 0 }), { items: [], total: 0 });
    assert.deepEqual(parseInstalledPage({ items: [], total: 0 }), { items: [], total: 0 });
});

test('valid installed items remain unchanged including UNKNOWN, not silently Running', () => {
    const row = { ...app(), status: 'Unknown' };
    const result = parseInstalledPage({ items: [row], total: 1 });
    assert.equal(result.items[0].status, 'Unknown');
    assert.equal(result.items[0].id, row.id);
});

test('malformed list is error rather than empty successful state', () => {
    for (const value of [null, [], {}, { items: null, total: 2 }, { items: [app()], total: 0 },
        { items: [], total: -1 }, { items: [], total: 0.3 }, { items: [], total: NaN },
        { items: [null], total: 1 }, { items: [{ ...app(), id: 0 }], total: 1 },
        { items: [{ ...app(), status: null }], total: 1 },
        { items: [{ ...app(), appKey: 99 }], total: 1 }]) {
        assert.throws(() => parseInstalledPage(value));
    }
});
