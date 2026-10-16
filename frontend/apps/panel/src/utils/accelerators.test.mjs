import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeXpu } from './accelerators.ts';

test('Intel nested API inventory retains identity and unknown telemetry', () => {
 const d=normalizeXpu({basic:{deviceID:0,deviceName:'Intel Arc',pciBdfAddress:'0000:00:02.0',driverVersion:'i915',memory:'',freeMemory:'',uuid:''},stats:{gpuUtil:'',memoryUsed:'',temperature:'',power:''},processStatus:'unavailable',processes:null});
 assert.equal(d.productName,'Intel Arc');
 assert.equal(d.busID,'0000:00:02.0');
 assert.equal(d.memTotal,'');
 assert.equal(d.gpuUtil,'');
 assert.equal(d.processStatus,'unavailable');
 assert.deepEqual(d.processes,[]);
});
