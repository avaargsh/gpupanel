import test from 'node:test';
import assert from 'node:assert/strict';
import { isConfirmablePlan, projectOperationReceipts } from './operationViews.ts';

const time = Date.parse('2026-10-19T09:00:00Z');
const receipt = (id, state, expiresAt = '2026-10-19T10:00:00Z', createdAt = '2026-10-19T08:00:00Z') =>
    ({ id, state, expiresAt, createdAt });

test('only unexpired explicitly planned receipts are pending confirmation', () => {
    const data = [
        receipt('ready', 'planned'),
        receipt('expired', 'planned', '2026-10-19T08:00:00Z'),
        receipt('at-deadline', 'planned', '2026-10-19T09:00:00Z'),
        receipt('invalid', 'planned', 'not-a-time'),
        receipt('failed', 'failed'),
        receipt('unknown', 'unknown'),
        receipt('verified', 'verified'),
        receipt('running', 'running'),
    ];
    const result = projectOperationReceipts(data, time);
    assert.deepEqual(result.pendingConfirmation.map((x) => x.id), ['ready']);
    assert.deepEqual(
        result.tasks.map((x) => x.id),
        ['ready', 'failed', 'unknown', 'running'],
    );
    assert.deepEqual(result.uncertain.map((x) => x.id), ['unknown']);
    assert.equal(result.activity.length, data.length);
    assert.equal(isConfirmablePlan(data[1], time), false);
    assert.equal(isConfirmablePlan(data[2], time), false);
    assert.equal(isConfirmablePlan(data[3], time), false);
});

test('sorting remains stable and input is not mutated', () => {
    const first = receipt('old', 'completed', '', '2026-10-18T10:00:00Z');
    const latest = receipt('new', 'verified', '', '2026-10-19T08:00:00Z');
    const unknownDate = receipt('bad', 'future-state', '', 'invalid');
    const source = Object.freeze([first, unknownDate, latest]);
    const result = projectOperationReceipts(source, time);
    assert.deepEqual(result.activity.map((x) => x.id), ['new', 'old', 'bad']);
    assert.deepEqual(source.map((x) => x.id), ['old', 'bad', 'new']);
    assert.deepEqual(result.tasks, []);
    assert.deepEqual(result.pendingConfirmation, []);
});

test('unrecognized state must never be reported as verified or actionable', () => {
    const result = projectOperationReceipts(
        [receipt('unexpected', 'approved'), receipt('in-flight', 'running')],
        time,
    );
    assert.deepEqual(result.tasks.map((x) => x.id), ['in-flight']);
    assert.deepEqual(result.pendingConfirmation, []);
    assert.equal(result.activity[0].state, 'approved');
});
