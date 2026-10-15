import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDashboard, normalizeOsInfo } from './dashboard.ts';

test('real dashboard envelope separates metadata and nested observations', () => {
    const result = normalizeDashboard({hostname:'observed-host',kernelArch:'x86_64',cpuUsedPercent:99,
        currentInfo:{cpuUsedPercent:24,memoryUsedPercent:38,cpuTotal:16,
            diskData:[{path:'/tmp',usedPercent:0},{path:'/',usedPercent:53,total:1000}],timeSinceUptime:'actual uptime'}});
    assert.equal(result.hostname,'observed-host');
    assert.equal(result.cpuUsedPercent,24);
    assert.equal(result.memoryUsedPercent,38);
    assert.equal(result.diskUsedPercent,53);
    assert.equal(result.cpuTotal,16);
    assert.equal(result.timeSinceUptime,'actual uptime');
    const os=normalizeOsInfo({os:'linux',kernelArch:'amd64',kernelVersion:'actual kernel',prettyDistro:'Ubuntu'});
    assert.equal(os.arch,'amd64');
    assert.equal(os.prettyDistro,'Ubuntu');
    assert.equal('hostname' in os,false);
});
test('missing or malformed observations never become plausible zeroes', () => {
    for(const value of [null,[],{}, {cpuUsedPercent:12}, {currentInfo:[]}]) assert.throws(()=>normalizeDashboard(value));
    const result=normalizeDashboard({currentInfo:{cpuUsedPercent:'24',memoryUsedPercent:NaN,diskData:[{path:'/tmp',usedPercent:10}]}});
    assert.equal(result.cpuUsedPercent,undefined);
    assert.equal(result.memoryUsedPercent,undefined);
    assert.equal(result.diskUsedPercent,undefined);
});
