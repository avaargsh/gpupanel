import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalAppPage } from '../src/views/app-store/apps/local-app-page.ts';

const app = { id: 1, key: 'python-local', name: 'Python', installed: false,
    limit: 1, description: 'Reviewed local recipe', tags: ['Dev'] };

test('accepts a real local app page and normalizes nullable tags', () => {
    assert.deepEqual(parseLocalAppPage({ items: [app], total: 1 }).items[0].tags, ['Dev']);
    const noTags = parseLocalAppPage({ items: [{ ...app, tags: null }], total: 1 });
    assert.deepEqual(noTags.items[0].tags, []);
    assert.deepEqual(parseLocalAppPage({ items: [], total: 0 }), { items: [], total: 0 });
});

test('refuses malformed API payload instead of showing a false empty success', () => {
    for (const payload of [null, [], {}, { items: null, total: 0 },
        { items: [], total: -1 }, { items: [], total: NaN },
        { items: [app], total: 0 }, { items: [null], total: 1 }]) {
        assert.throws(() => parseLocalAppPage(payload));
    }
});

test('rejects forged/unsafe local application identities and install flags', () => {
    const mutations = [{ key: '../remote' }, { key: '' }, { key: 'hello/world' },
        { id: 0 }, { id: 1.2 }, { name: '' }, { installed: 'true' },
        { limit: -1 }, { tags: 'untrusted' }, { tags: [3] }];
    for (const mutation of mutations) {
        assert.throws(() => parseLocalAppPage({ items: [{ ...app, ...mutation }], total: 1 }),
            JSON.stringify(mutation));
    }
});
