import assert from 'node:assert/strict';
import test from 'node:test';
import { readLocalWatchTail as readTail } from './nativeWatchTail.ts';\nimport { parseNativeWatch } from './nativeSessions.ts';\nconst readLocalWatchTail = (text, now) => readTail(text, parseNativeWatch, now);

const now = Date.parse('2026-10-20T12:00:10.000Z');
function line(sequence, state, iso = '2026-10-20T12:00:00.000Z') {
    return JSON.stringify({
        schemaVersion: 1, source: 'local-user-codex-watch',
        sequence, observedAt: iso, connection: state,
        liveStatusVerified: false,
        snapshot: state === 'observed' ? {
            schemaVersion: 2, source: 'local-user-codex-appserver',
            readOnly: true, liveStatusVerified: false,
            observerScope: 'attached-loopback-appserver',
            hasMore: false, sessions: [{
                sessionId: 'thread-' + sequence, runtimeKind: 'codex',
                projectLabel: 'my-project', startedAt: iso,
                observerStatus: 'idle', liveness: 'unknown',
            }],
        } : null,
    }) + '\n';
}
test('complete records update to newest, incomplete trailing JSON is ignored', () => {
    const text = line(1, 'observed') + line(2, 'observed') + '{"sequence":3';
    const result = readLocalWatchTail(text, now);
    assert.equal(result.state, 'observed');
    assert.equal(result.record?.sequence, 2);
    assert.equal(result.record?.inventory?.sessions[0].sessionId, 'thread-2');
    assert.equal(result.record?.inventory?.liveStatusVerified, false);
});

test('native disconnect removes previously seen sessions', () => {
    const result = readLocalWatchTail(line(1, 'observed') + line(2, 'unavailable'), now);
    assert.equal(result.state, 'unavailable');
    assert.equal(result.record?.inventory, null);
});

test('truncated writer without complete newline stays pending and cannot claim ready', () => {
    assert.deepEqual(readLocalWatchTail('', now), { state: 'pending', record: null });
    assert.deepEqual(readLocalWatchTail('{"schemaVersion":1', now),
        { state: 'pending', record: null });
});

test('stopped observer and impossible future clock both invalidate previous state', () => {
    const stale = readLocalWatchTail(line(1, 'observed'), now + 91_000);
    assert.deepEqual(stale, { state: 'stale', record: null });
    const future = readLocalWatchTail(line(1, 'observed'), now - 41_000);
    assert.deepEqual(future, { state: 'stale', record: null });
});

test('completed malformed or forged records fail closed instead of retaining old data', () => {
    assert.throws(() => readLocalWatchTail(line(1, 'observed') + '{bad}\n', now));
    assert.throws(() => readLocalWatchTail(line(1, 'observed') +
        line(3, 'observed'), now));
    assert.throws(() => readLocalWatchTail('x'.repeat(4 * 1024 * 1024 + 1), now));
});
