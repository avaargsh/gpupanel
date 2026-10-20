import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeInventory, parseNativeWatch } from './nativeSessions.ts';

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

function appserverSnapshot(overrides = {}) {
    return JSON.stringify({
        schemaVersion: 2, source: 'local-user-codex-appserver',
        readOnly: true, liveStatusVerified: false,
        observerScope: 'new-app-server-process', hasMore: true,
        sessions: [{
            sessionId: 'thr_a',
            runtimeKind: 'codex',
            projectLabel: 'my-project',
            startedAt: '2026-10-20T10:00:00Z',
            liveness: 'unknown',
            observerStatus: 'notLoaded',
            preview: 'SECRET_PROMPT_NOT_TO_RENDER',
        }],
        ...overrides,
    });
}

test('app-server snapshot retains only scoped state and omits preview', () => {
    const parsed = parseNativeInventory(appserverSnapshot());
    assert.equal(parsed.schemaVersion, 2);
    assert.equal(parsed.observerScope, 'new-app-server-process');
    assert.equal(parsed.hasMore, true);
    assert.equal(parsed.liveStatusVerified, false);
    assert.equal(parsed.sessions[0].sessionId, 'thr_a');
    assert.equal(parsed.sessions[0].observerStatus, 'notLoaded');
    assert.equal(parsed.sessions[0].liveness, 'unknown');
    assert.ok(!JSON.stringify(parsed).includes('SECRET_PROMPT'));
});

test('explicit attached-loopback observer import stays untrusted and sanitized', () => {
    const parsed = parseNativeInventory(appserverSnapshot({
        observerScope: 'attached-loopback-appserver',
        sessions: [{
            sessionId: 'thread-local-1',
            runtimeKind: 'codex',
            projectLabel: 'gpupanel',
            startedAt: '2026-10-20T10:00:00Z',
            liveness: 'unknown',
            observerStatus: 'active',
            prompt: 'SECRET_NEVER_EXPORT',
        }],
    }));
    assert.equal(parsed.observerScope, 'attached-loopback-appserver');
    assert.equal(parsed.liveStatusVerified, false);
    assert.equal(parsed.sessions[0].liveness, 'unknown');
    assert.ok(!JSON.stringify(parsed).includes('SECRET_NEVER_EXPORT'));
});

test('untrusted app-server imports cannot claim globally running or remote authority', () => {
    const original = JSON.parse(appserverSnapshot()).sessions[0];
    for (const bad of [
        { observerScope: 'existing-remote-server' },
        { liveStatusVerified: true },
        { sessions: [{ ...original, liveness: 'running' }] },
        { sessions: [{ ...original, observerStatus: 'executing' }] },
        { sessions: [{ ...original, sessionId: '../root' }] },
        { sessions: Array.from({ length: 26 }, (_, i) => ({
            ...original, sessionId: 'thr_' + i,
        })) },
    ]) {
        assert.throws(() => parseNativeInventory(appserverSnapshot(bad)));
    }
});

function nativeWatchLine(sequence, connection, snapshot, timestamp = '2026-10-20T10:00:00Z') {
    return JSON.stringify({
        schemaVersion: 1,
        source: 'local-user-codex-watch',
        sequence,
        observedAt: timestamp,
        connection,
        liveStatusVerified: false,
        snapshot,
    });
}

test('watch import discards earlier sessions when latest record is unavailable', () => {
    const source = JSON.parse(appserverSnapshot({
        observerScope: 'attached-loopback-appserver',
        hasMore: false,
    }));
    const observed = nativeWatchLine(1, 'observed', source);
    const offline = nativeWatchLine(2, 'unavailable', null, '2026-10-20T10:00:05Z');
    const latest = parseNativeWatch(observed + '\n' + offline + '\n');
    assert.equal(latest.observation, 'unavailable');
    assert.equal(latest.inventory, null);
    assert.equal(latest.sequence, 2);

    const restored = parseNativeWatch(observed + '\n' + offline + '\n' +
        nativeWatchLine(3, 'observed', source, '2026-10-20T10:00:10Z'));
    assert.equal(restored.observation, 'observed');
    assert.equal(restored.inventory.sessions[0].liveness, 'unknown');
    assert.equal(restored.inventory.observerScope, 'attached-loopback-appserver');
});

test('watch import rejects stale-data spoofing and malformed sequences', () => {
    const source = JSON.parse(appserverSnapshot({
        observerScope: 'attached-loopback-appserver',
        hasMore: false,
    }));
    for (const bad of [
        nativeWatchLine(1, 'unavailable', source),
        nativeWatchLine(2, 'observed', source),
        nativeWatchLine(1, 'observed', source) + '\n' + nativeWatchLine(1, 'observed', source),
        nativeWatchLine(1, 'observed', source) + '\n' +
            nativeWatchLine(2, 'observed', source, '2026-10-20T09:59:59Z'),
        nativeWatchLine(1, 'observed', { ...source, liveStatusVerified: true }),
        nativeWatchLine(1, 'observed', { ...source, observerScope: 'new-app-server-process' }),
        '{"schemaVersion":1,"source":"local-user-codex-watch"',
        '',
    ]) {
        assert.throws(() => parseNativeWatch(bad));
    }
    assert.throws(() => parseNativeWatch('x'.repeat(4 * 1024 * 1024 + 1)), /上限/);
});
