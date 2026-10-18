import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHostDiagnosis } from './host-diagnosis.ts';

const GOOD = {
    hostname: 'private-host',
    os: 'linux',
    platform: 'ubuntu',
    kernelVersion: '6.8.0-48-generic',
    arch: 'x86_64',
    uptimeSeconds: 3600,
    rootFilesystem: { totalBytes: 1_000, usedBytes: 200, usedPercent: 20 },
    accelerators: [{ name: 'untrusted GPU display name', pci: '0000:00:02.0' }],
};

test('real host diagnosis receipt displays only bounded allowlisted fields', () => {
    const result = parseHostDiagnosis(JSON.stringify(GOOD));
    assert.deepEqual(result, {
        os: 'linux', platform: 'ubuntu', kernel: '6.8.0-48-generic',
        architecture: 'x86_64', uptimeSeconds: 3600,
        rootUsedPercent: 20, rootUsedBytes: 200, rootTotalBytes: 1000,
        acceleratorStatus: 'reported', acceleratorCount: 1,
    });
    assert.equal(JSON.stringify(result).includes('private-host'), false);
    assert.equal(JSON.stringify(result).includes('untrusted GPU display name'), false);
});

test('missing GPU devices cannot be reported as hardware absence', () => {
    const result = parseHostDiagnosis(JSON.stringify({ ...GOOD, accelerators: [] }));
    assert.equal(result?.acceleratorStatus, 'reported');
    assert.equal(result?.acceleratorCount, 0);
    assert.equal(parseHostDiagnosis(JSON.stringify({ ...GOOD, accelerators: null }))?.acceleratorStatus, 'unknown');
    assert.equal(parseHostDiagnosis(JSON.stringify({
        ...GOOD, acceleratorStatus: 'unavailable', accelerators: [],
    }))?.acceleratorStatus, 'unavailable');
});

test('injected or invalid scalar fields are suppressed, not rendered', () => {
    const result = parseHostDiagnosis(JSON.stringify({
        ...GOOD, os: 'token=secret', platform: 'ubuntu\nsecret',
        kernelVersion: '<script>alert(1)</script>', arch: 'A'.repeat(500),
        uptimeSeconds: -4,
        rootFilesystem: { totalBytes: 100, usedBytes: 300, usedPercent: '99' },
    }));
    assert.equal(result?.os, null);
    assert.equal(result?.platform, null);
    assert.equal(result?.kernel, null);
    assert.equal(result?.architecture, null);
    assert.equal(result?.uptimeSeconds, null);
    assert.equal(result?.rootUsedPercent, null);
    assert.equal(result?.rootUsedBytes, null);
});

test('invalid JSON, unexpected shape and unbounded response fail closed', () => {
    for (const payload of [null, '', 'not-json', '[]', '{}',
        '{"rootFilesystem":false}', 'x'.repeat(16_385),
        JSON.stringify({ rootFilesystem: { usedPercent: '99' } })]) {
        assert.equal(parseHostDiagnosis(payload), null);
    }
});

test('overlarge GPU list does not mislead as successful device inventory', () => {
    const result = parseHostDiagnosis(JSON.stringify({
        ...GOOD, accelerators: Array.from({length: 129}, () => ({})),
    }));
    assert.equal(result?.acceleratorStatus, 'unknown');
    assert.equal(result?.acceleratorCount, null);
});
