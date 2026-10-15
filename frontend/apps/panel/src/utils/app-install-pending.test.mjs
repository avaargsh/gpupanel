import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    PENDING_APP_INSTALL_KEY,
    readPendingAppInstall,
    savePendingAppInstall,
    clearPendingAppInstall,
} from './app-install-pending.ts';

const first = Object.freeze({
    taskID: '11111111-1111-4111-8111-111111111111',
    node: 'local',
    appKey: 'jupyter',
});
const second = Object.freeze({
    taskID: '22222222-2222-4222-8222-222222222222',
    node: 'local',
    appKey: 'jupyter',
});

function mockStorage({ blockedRead = false, blockedWrite = false, ignoredWrite = false } = {}) {
    const values = new Map();
    return {
        getItem(key) {
            if (blockedRead) throw new Error('storage disabled');
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            if (blockedWrite) throw new Error('quota exceeded');
            if (!ignoredWrite) values.set(key, value);
        },
        removeItem(key) {
            values.delete(key);
        },
        values,
    };
}

function host(options) {
    const sessionStorage = mockStorage(options);
    globalThis.window = { sessionStorage };
    return sessionStorage;
}

test('same-tab receipt survives reload and is not an installation outcome', () => {
    const storage = host();
    assert.equal(savePendingAppInstall(first), true);
    assert.deepEqual(readPendingAppInstall(), first);
    assert.deepEqual(Object.keys(JSON.parse(storage.getItem(PENDING_APP_INSTALL_KEY))).sort(),
        ['appKey', 'node', 'taskID']);
    assert.equal(clearPendingAppInstall(first.taskID), true);
    assert.equal(readPendingAppInstall(), null);
});

test('a second task cannot overwrite an unresolved install', () => {
    host();
    assert.equal(savePendingAppInstall(first), true);
    assert.equal(savePendingAppInstall(second), false);
    assert.deepEqual(readPendingAppInstall(), first);
});

test('same Task ID may not be rebound to another node or application', () => {
    host();
    assert.equal(savePendingAppInstall(first), true);
    assert.equal(savePendingAppInstall({ ...first, node: 'remote' }), false);
    assert.equal(savePendingAppInstall({ ...first, appKey: 'maxkb' }), false);
    assert.deepEqual(readPendingAppInstall(), first);
});

test('invalid or oversized old receipt remains a fail-closed blocker', () => {
    const storage = host();
    for (const raw of ['not-json', JSON.stringify({ ...first, taskID: 'invalid' }), 'x'.repeat(1025)]) {
        storage.setItem(PENDING_APP_INSTALL_KEY, raw);
        assert.equal(readPendingAppInstall(), null);
        assert.equal(savePendingAppInstall(first), false);
        assert.equal(storage.getItem(PENDING_APP_INSTALL_KEY), raw);
    }
});

test('disabled, rejected and silently dropped writes deny install submission', () => {
    host({ blockedRead: true });
    assert.equal(savePendingAppInstall(first), false);
    host({ blockedWrite: true });
    assert.equal(savePendingAppInstall(first), false);
    host({ ignoredWrite: true });
    assert.equal(savePendingAppInstall(first), false);
});

test('stale completion may not erase newer task', () => {
    host();
    assert.equal(savePendingAppInstall(second), true);
    assert.equal(clearPendingAppInstall(first.taskID), false);
    assert.deepEqual(readPendingAppInstall(), second);
    assert.equal(clearPendingAppInstall(second.taskID), true);
});

test('invalid caller-supplied receipt never reaches storage', () => {
    const storage = host();
    for (const bad of [
        { ...first, taskID: 'not-a-uuid' },
        { ...first, node: '' },
        { ...first, appKey: ' ' },
        { ...first, node: 'a'.repeat(129) },
    ]) {
        assert.equal(savePendingAppInstall(bad), false);
    }
    assert.equal(storage.getItem(PENDING_APP_INSTALL_KEY), null);
});
