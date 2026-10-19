import test from 'node:test';
import assert from 'node:assert/strict';
import { projectAgentTasks } from './agentTaskViews.ts';

test('only explicit running, failed, unknown or canceled tasks need attention', () => {
    const states = ['Executing', 'Failed', 'Unknown', 'Canceled', 'Success', 'Completed', '', 'Running'];
    const source = Object.freeze(states.map((status, i) => Object.freeze({
        id: String(i), status, createdAt: '2026-10-19T00:00:00Z',
    })));
    const result = projectAgentTasks(source);
    assert.deepEqual(result.needsAttention.map((row) => row.status), states.slice(0, 4));
    assert.deepEqual(result.activity.map((row) => row.status), states);
    assert.equal(result.activity.length, source.length);
    assert.equal(source[0].status, 'Executing');
});

test('empty tasks are empty and a future unknown state is not invented as an approval', () => {
    assert.deepEqual(projectAgentTasks([]), { activity: [], needsAttention: [] });
    assert.deepEqual(projectAgentTasks([{ id:'a', status:'Approved', createdAt:'' }]).needsAttention, []);
});
