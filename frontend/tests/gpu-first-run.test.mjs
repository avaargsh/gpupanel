import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeGPUReadiness } from '../src/utils/gpu-first-run.ts';

const nvidia = { type: 'nvidia' };
const amd = { type: 'amd' };
const ascend = { type: 'ascend' };

test('missing or invalid snapshots are unavailable, not healthy', () => {
    assert.equal(summarizeGPUReadiness(null).state, 'unavailable');
    assert.equal(summarizeGPUReadiness({}).state, 'unavailable');
    assert.equal(summarizeGPUReadiness({ gpu: 'not-an-array' }).state, 'unavailable');
    assert.equal(summarizeGPUReadiness({ gpu: [], npu: {}, xpu: [] }).state, 'unavailable');
});

test('empty, valid telemetry means no detected device, not success', () => {
    assert.deepEqual(summarizeGPUReadiness({ gpu: [], npu: [], xpu: [] }), {
        state: 'none', devices: 0, driver: '', cudaCompatibility: '',
    });
});

test('NVIDIA snapshot uses driver compatibility data without toolkit claim', () => {
    assert.deepEqual(summarizeGPUReadiness({
        gpu: [nvidia, nvidia], npu: [], xpu: [],
        driverVersion: '575.64.03', cudaVersion: '12.9',
    }), {
        state: 'ready', devices: 2, driver: '575.64.03', cudaCompatibility: '12.9',
    });
});

test('mixed AMD + XPU and legacy NPU snapshots are counted without double counting', () => {
    const result = summarizeGPUReadiness({
        gpu: [amd, ascend], npu: [{}, {}], xpu: [{}], driverVersion: 'AMD',
        cudaVersion: '999',
    });
    assert.equal(result.devices, 4);
    assert.equal(result.driver, '');
    assert.equal(result.cudaCompatibility, '');
    assert.equal(result.state, 'ready');
});

test('partial collection and unknown device types never report healthy', () => {
    assert.equal(summarizeGPUReadiness({ gpu: [nvidia], warnings: ['collector timeout'] }).state, 'partial');
    assert.equal(summarizeGPUReadiness({ gpu: [], warnings: ['collector timeout'] }).state, 'unavailable');
    assert.equal(summarizeGPUReadiness({ gpu: [{ type: 'mystery' }] }).state, 'unavailable');
    assert.equal(summarizeGPUReadiness({ gpu: [nvidia, { type: 'mystery' }] }).state, 'partial');
    assert.equal(summarizeGPUReadiness({ gpu: [nvidia], warnings: 'untrusted' }).state, 'partial');
});

test('untrusted version fields are withheld from the UI', () => {
    const result = summarizeGPUReadiness({
        gpu: [nvidia],
        driverVersion: '535.1\\nsecret-path',
        cudaVersion: '<script>alert(1)</script>',
    });
    assert.equal(result.state, 'ready');
    assert.equal(result.driver, '');
    assert.equal(result.cudaCompatibility, '');
});
