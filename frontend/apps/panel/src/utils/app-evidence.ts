export interface AppEvidence {
    installId: number;
    classification: 'CONSISTENT' | 'PARTIAL' | 'CONFLICT' | 'UNKNOWN';
    appStatus: string;
    taskStatus: string;
    taskId: string;
    observedAt: string;
    reasons: string[];
    containers: { name: string; state: string }[];
    verified: false;
}
const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid evidence');
    return value as Record<string, unknown>;
};
const text = (value: unknown, optional = false): string => {
    if (optional && value === undefined) return '';
    if (typeof value !== 'string' || value.length > 512) throw new Error('Invalid evidence text');
    return value;
};
/** Select only redacted fields; malformed data can never grant readiness or authority. */
export function parseAppEvidence(value: unknown, expectedId: number): AppEvidence {
    const data = record(value);
    if (data.installId !== expectedId || data.verified !== false ||
        !['CONSISTENT', 'PARTIAL', 'CONFLICT', 'UNKNOWN'].includes(String(data.classification))) throw new Error('Invalid evidence identity');
    const reasons = data.reasons ?? [];
    const containers = data.containers ?? [];
    if (!Array.isArray(reasons) || reasons.length > 64 || !Array.isArray(containers) || containers.length > 256) throw new Error('Invalid evidence bounds');
    return {
        installId: expectedId,
        classification: data.classification as AppEvidence['classification'],
        appStatus: text(data.appStatus, true), taskStatus: text(data.taskStatus, true),
        taskId: text(data.taskId, true),
        observedAt: text(data.observedAt), reasons: reasons.map((reason) => text(reason)),
        containers: containers.map((item) => { const row = record(item); return { name: text(row.name), state: text(row.state) }; }),
        verified: false,
    };
}
