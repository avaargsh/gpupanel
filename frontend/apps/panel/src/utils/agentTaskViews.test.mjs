import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceMatchesTask, linkedInstallId, projectAgentTasks } from './agentTaskViews.ts';

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

test('only explicit App TaskInstall with a safe persisted resource ID supports evidence lookup', () => {
    const task = { id: 'task-1', type: 'App', operate: 'TaskInstall', resourceID: 42 };
    assert.equal(linkedInstallId(task), 42);
    for (const change of [
        { type: 'Compose' }, { type: 'AppStore' }, { operate: 'TaskUpgrade' },
        { id: '' }, { id: 'x'.repeat(129) }, { resourceID: 0 },
        { resourceID: -1 }, { resourceID: 1.5 },
        { resourceID: Number.MAX_SAFE_INTEGER + 1 }, { resourceID: NaN },
    ]) {
        assert.equal(linkedInstallId({ ...task, ...change }), null);
    }
});

test('do not attribute latest application resource evidence to a different task attempt', () => {
    const task = { id: 'task-1', type: 'App', operate: 'TaskInstall', resourceID: 42 };
    const evidence = { installId: 42, taskId: 'task-1', verified: false };
    assert.equal(evidenceMatchesTask(task, evidence), true);
    assert.equal(evidenceMatchesTask(task, { ...evidence, taskId: 'newer-install' }), false);
    assert.equal(evidenceMatchesTask(task, { ...evidence, taskId: '' }), false);
    assert.equal(evidenceMatchesTask(task, { ...evidence, installId: 43 }), false);
    assert.equal(evidenceMatchesTask({ ...task, type: 'Compose' }, evidence), false);
    assert.equal(evidenceMatchesTask(task, { ...evidence, verified: true }), false);
});
