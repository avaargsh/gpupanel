import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppEvidence } from './app-evidence.ts';
const sample = () => ({ installId: 7, classification: 'UNKNOWN', verified: false,
    observedAt: '2026-10-15T00:00:00Z', reasons: ['partial observation'], containers: [{ name: 'demo', state: 'exited' }] });
test('evidence selects redacted fields and never upgrades verified', () => {
    const result = parseAppEvidence({ ...sample(), env: 'secret', token: 'secret' }, 7);
    assert.equal(result.verified, false);
    assert.equal(result.classification, 'UNKNOWN');
    assert.equal('env' in result, false);
    assert.equal('token' in result, false);
});
test('foreign identity, untrusted classification and verified=true fail closed', () => {
    for (const row of [{ ...sample(), installId: 8 }, { ...sample(), verified: true }, { ...sample(), classification: 'SUCCESS' }, null]) {
        assert.throws(() => parseAppEvidence(row, 7));
    }
});
test('nonarrays and oversized fields cannot masquerade as evidence', () => {
    for (const row of [{ ...sample(), reasons: {} }, { ...sample(), containers: [null] }, { ...sample(), reasons: ['x'.repeat(513)] }]) assert.throws(() => parseAppEvidence(row, 7));
});
