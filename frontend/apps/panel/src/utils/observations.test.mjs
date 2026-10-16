import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observedPercent } from './observations.ts';
test('only actual bounded numeric observations are percentages', () => {
    for (const value of [undefined, null, '', '12', NaN, Infinity, -1, 101]) assert.equal(observedPercent(value), '--');
    assert.equal(observedPercent(0), '0.0%');
    assert.equal(observedPercent(24.35), '24.4%');
    assert.equal(observedPercent(100), '100.0%');
});
