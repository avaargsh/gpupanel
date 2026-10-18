import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContainerDiagnosis } from './container-diagnosis.ts';

const id = 'a'.repeat(64);
const fixture = {
    schema: 'gpupanel.host.container-diagnosis.v1', observation: 'read-only-docker-inspect',
    containerId: id, observedAt: '2026-10-18T11:58:00Z',
    status: 'exited', running: false, exitCode: 137, oomKilled: true, health: 'unhealthy',
};

test('valid report is resource bound, with only approved primitives', () => {
    const view = parseContainerDiagnosis(JSON.stringify({
        ...fixture, environment: { PASSWORD: 'SECRET' }, rawLogs: 'SECRET LOG',
        command: '/bin/sh', mountPath: '/home/private',
    }), id);
    assert.deepEqual(view, {
        containerId: id, status: 'exited', running: false,
        exitCode: 137, oomKilled: true, health: 'unhealthy',
        observedAt: '2026-10-18T11:58:00Z',
    });
    assert.equal(JSON.stringify(view).includes('SECRET'), false);
});

test('rejects receipt from another container or invalid target', () => {
    assert.equal(parseContainerDiagnosis(JSON.stringify(fixture), 'b'.repeat(64)), null);
    assert.equal(parseContainerDiagnosis(JSON.stringify(fixture), 'name;rm -rf /'), null);
    assert.equal(parseContainerDiagnosis(JSON.stringify({...fixture, containerId: 'b'.repeat(64)}), id), null);
});

test('rejects malformed state, uncertain date and wrong observation contract', () => {
    for (const partial of [
        {status: 'ERROR=SECRET'}, {status: 'RUNNING'}, {running: 'true'},
        {exitCode: Number.MAX_SAFE_INTEGER}, {exitCode: 1.1},
        {oomKilled: 'false'}, {health: 'PASSWORD=SECRET'},
        {observedAt: 'yesterday'}, {observedAt: '2026-99-18T11:58:00Z'},
        {observation: 'mutated'}, {schema: 'unknown'},
    ]) {
        assert.equal(parseContainerDiagnosis(JSON.stringify({...fixture,...partial}), id), null);
    }
});

test('rejects unexpected payloads and unbounded text', () => {
    for (const value of ['not-json', '[]', '{}', '', 'a'.repeat(16385), null]) {
        assert.equal(parseContainerDiagnosis(value, id), null);
    }
});
