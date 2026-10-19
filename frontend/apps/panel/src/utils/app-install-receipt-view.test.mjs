import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canQueryInstallReceipt, visibleInstallReceipt } from './app-install-receipt-view.ts';

const oldReceipt = Object.freeze({
    lines: ['old successful receipt'],
    taskStatus: 'Success',
    scope: 'task',
});
const resolved = (flags = {}) => ({
    isSuccess: true,
    isFetching: false,
    isError: false,
    currentData: oldReceipt,
    ...flags,
});

test('receipt may be read only for its original selected Host', () => {
    assert.equal(canQueryInstallReceipt('local', 'local'), true);
    assert.equal(canQueryInstallReceipt('gpu-node-a', 'gpu-node-a'), true);
    assert.equal(canQueryInstallReceipt('gpu-node-a', 'gpu-node-b'), false);
    assert.equal(canQueryInstallReceipt('local', 'gpu-node-a'), false);
    assert.equal(canQueryInstallReceipt('', ''), false);
});

test('changing Host hides a cached success without changing TaskDB', () => {
    assert.equal(visibleInstallReceipt(resolved(), false), undefined);
    assert.deepEqual(visibleInstallReceipt(resolved(), true), oldReceipt);
});

test('failed refresh does not expose stale last-success response', () => {
    assert.equal(visibleInstallReceipt(resolved({ isSuccess: false, isError: true }), true), undefined);
    assert.equal(visibleInstallReceipt(resolved({ isSuccess: true, isError: true }), true), undefined);
});

test('loading or fetching hides cached data until this request succeeds', () => {
    assert.equal(visibleInstallReceipt(resolved({ isFetching: true }), true), undefined);
    assert.equal(visibleInstallReceipt(resolved({ isSuccess: false }), true), undefined);
    assert.equal(visibleInstallReceipt(resolved({ currentData: undefined }), true), undefined);
});

test('read-only admission is still displayed as an observation, never completion proof', () => {
    const admission = { lines: ['admission only'], taskStatus: 'Executing', scope: 'admission' };
    assert.deepEqual(visibleInstallReceipt(resolved({ currentData: admission }), true), admission);
});
