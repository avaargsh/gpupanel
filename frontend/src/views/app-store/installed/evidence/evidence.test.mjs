import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAppInstallEvidence } from './evidence.ts';

const good = {
    installId: 17,
    name: 'my-llm',
    appStatus: 'Unknown',
    taskId: '11111111-1111-4111-8111-111111111111',
    taskStatus: 'Unknown',
    classification: 'UNKNOWN',
    reasons: ['INSTALL_OUTCOME_NOT_RECONCILED'],
    containers: [{ name: 'my-llm', state: 'running' }],
    observedAt: '2026-10-15T13:40:00Z',
    verified: false,
    env: 'DO_NOT_LEAK_SECRET',
    dockerCompose: 'sensitive compose',
    labels: { token: 'hidden' },
};

test('only server-approved redacted evidence fields reach the UI', () => {
    const result = parseAppInstallEvidence(good, 17);
    assert.equal(result.classification, 'UNKNOWN');
    assert.equal(result.verified, false);
    assert.equal(result.containers[0].state, 'running');
    assert.equal('env' in result, false);
    assert.equal('dockerCompose' in result, false);
    assert.equal('labels' in result, false);
    assert.equal(JSON.stringify(result).includes('DO_NOT_LEAK_SECRET'), false);
});

test('identity mismatch, success claims and forged verification fail closed', () => {
    assert.throws(() => parseAppInstallEvidence(good, 18));
    assert.throws(() => parseAppInstallEvidence({ ...good, verified: true }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, classification: 'RECOVERED' }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, installId: -1 }, 17));
});

test('do not display secret-bearing reasons or unbounded/container payloads', () => {
    assert.throws(() => parseAppInstallEvidence({ ...good, reasons: ['password=secret'] }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, reasons: Array(65).fill('UNKNOWN') }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, containers: Array(33).fill(good.containers[0]) }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, containers: [{ name: 'app', state: '<script>' }] }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, containers: [{ name: 'app\nsecret', state: 'running' }] }, 17));
});

test('malformed timestamps and partial success-looking responses cannot pass', () => {
    assert.throws(() => parseAppInstallEvidence({ ...good, observedAt: 'wrong-time' }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, reasons: null }, 17));
    assert.throws(() => parseAppInstallEvidence({ ...good, containers: null }, 17));
    assert.throws(() => parseAppInstallEvidence(null, 17));
});
