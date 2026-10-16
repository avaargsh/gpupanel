import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProjectName, projectWorkspaceReady, validProjectId } from './project-registry.ts';

test('metadata names reject traversal and controls without rewriting user input', () => {
    assert.equal(normalizeProjectName('  GPU 实验  '), 'GPU 实验');
    assert.equal(normalizeProjectName(''), null);
    assert.equal(normalizeProjectName('../escape'), null);
    assert.equal(normalizeProjectName('bad\\name'), null);
    assert.equal(normalizeProjectName('line\nbreak'), null);
    assert.equal(normalizeProjectName('a'.repeat(81)), null);
    assert.equal(normalizeProjectName('项目'), '项目');
});

test('a registered project is never misrepresented as a ready Workspace', () => {
    assert.equal(projectWorkspaceReady('NotProvisioned'), false);
    assert.equal(projectWorkspaceReady('Registered'), false);
    assert.equal(projectWorkspaceReady('Unknown'), false);
    assert.equal(projectWorkspaceReady('Provisioned'), true);
});

test('detail deep links accept canonical project UUIDs only', () => {
    assert.equal(validProjectId('123e4567-e89b-42d3-a456-426614174000'), true);
    assert.equal(validProjectId('123E4567-E89B-42D3-A456-426614174000'), false);
    assert.equal(validProjectId('../projects'), false);
    assert.equal(validProjectId(''), false);
    assert.equal(validProjectId('123e4567-e89b-42d3-a456-426614174000/anything'), false);
});
