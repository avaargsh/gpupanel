/** Wire DTOs stay at the API boundary; pages consume one explicit observed view. */
const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid dashboard response');
    return value as Record<string, unknown>;
};
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const number = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function normalizeOsInfo(value: unknown) {
    const data = record(value);
    return { os: text(data.os), arch: text(data.kernelArch), kernelVersion: text(data.kernelVersion),
        prettyDistro: text(data.prettyDistro), platform: text(data.platform) };
}

export function normalizeDashboard(value: unknown) {
    const data = record(value);
    const current = record(data.currentInfo);
    // The root filesystem is an explicit resource, not an average of unrelated mounts.
    const root = Array.isArray(current.diskData) ? current.diskData.map(record).find((disk) => disk.path === '/') : undefined;
    return {
        hostname: text(data.hostname), os: text(data.os), arch: text(data.kernelArch),
        kernelVersion: text(data.kernelVersion),
        cpuUsedPercent: number(current.cpuUsedPercent), memoryUsedPercent: number(current.memoryUsedPercent),
        diskUsedPercent: number(root?.usedPercent), diskTotal: number(root?.total),
        load1: number(current.load1), load5: number(current.load5), load15: number(current.load15),
        timeSinceUptime: text(current.timeSinceUptime), cpuTotal: number(current.cpuTotal), memoryTotal: number(current.memoryTotal),
    };
}
