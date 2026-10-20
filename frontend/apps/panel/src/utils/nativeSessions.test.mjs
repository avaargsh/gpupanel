import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeInventory } from './nativeSessions.ts';

const id = '123e4567-e89b-12d3-a456-426614174000';
function snapshot(overrides = {}) {
    return JSON.stringify({
        schemaVersion: 1,
        source: 'local-user-codex-rollouts',
        readOnly: true,
        liveStatusVerified: false,
        sessions: [{
            sessionId: id,
            runtimeKind: 'codex',
            projectLabel: 'gpupanel',
            startedAt: '2026-10-20T10:00:00.000Z',
            liveness: 'unknown',
        }],
        ...overrides,
    });
}

test('valid import preserves native ID and unknown, never infers running', () => {
    const parsed = parseNativeInventory(snapshot());
    assert.equal(parsed.sessions[0].sessionId, id);
    assert.equal(parsed.sessions[0].liveness, 'unknown');
    assert.equal(parsed.liveStatusVerified, false);
});

test('rejects untrusted claimed-live or writable contracts', () => {
    assert.throws(() => parseNativeInventory(snapshot({ liveStatusVerified: true })), /不兼容/);
    assert.throws(() => parseNativeInventory(snapshot({ readOnly: false })), /不兼容/);
    assert.throws(() => parseNativeInventory(snapshot({ source: 'remote-agent' })), /不兼容/);
});

test('rejects duplicate IDs and unsafe labels', () => {
    const good = JSON.parse(snapshot()).sessions[0];
    assert.throws(() => parseNativeInventory(snapshot({ sessions: [good, good] })), /重复/);
    assert.throws(() => parseNativeInventory(snapshot({
        sessions: [{ ...good, projectLabel: '../secret' }],
    })), /无效/);
    assert.throws(() => parseNativeInventory(snapshot({
        sessions: [{ ...good, liveness: 'running' }],
    })), /无效/);
    assert.throws(() => parseNativeInventory(snapshot({
        sessions: [{ ...good, sessionId: 'not-a-native-id' }],
    })), /无效/);
});

test('rejects giant and malformed files without partial rows', () => {
    assert.throws(() => parseNativeInventory('x'.repeat(1024 * 1024 + 1)), /上限/);
    assert.throws(() => parseNativeInventory('not json'), /解析/);
    assert.throws(() => parseNativeInventory(snapshot({
        sessions: Array.from({ length: 101 }, () => JSON.parse(snapshot()).sessions[0]),
    })), /不兼容/);
});
