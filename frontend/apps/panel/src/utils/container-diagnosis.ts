/** Exact-resource, allowlisted client interpretation of a Host Operations
 * container.diagnose receipt. A read observation is never remediation proof.
 */
export interface ContainerDiagnosisSummary {
    containerId: string;
    status: 'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead';
    running: boolean;
    exitCode: number;
    oomKilled: boolean;
    health: 'starting' | 'healthy' | 'unhealthy' | 'unknown';
    observedAt: string;
}

const CONTAINER_ID = /^[a-f0-9]{64}$/;
const STATUS = new Set(['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead']);
const HEALTH = new Set(['starting', 'healthy', 'unhealthy', 'unknown']);

export function parseContainerDiagnosis(output: unknown, expectedId: string): ContainerDiagnosisSummary | null {
    if (typeof output !== 'string' || output.length === 0 || output.length > 16_384 ||
        !CONTAINER_ID.test(expectedId)) return null;
    let data: unknown;
    try {
        data = JSON.parse(output);
    } catch {
        return null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const item = data as Record<string, unknown>;
    if (item.schema !== 'gpupanel.host.container-diagnosis.v1' ||
        item.observation !== 'read-only-docker-inspect' ||
        item.containerId !== expectedId ||
        typeof item.status !== 'string' || !STATUS.has(item.status) ||
        typeof item.running !== 'boolean' ||
        typeof item.oomKilled !== 'boolean' ||
        typeof item.exitCode !== 'number' || !Number.isSafeInteger(item.exitCode) ||
        item.exitCode < -1 || item.exitCode > 2_147_483_647 ||
        typeof item.health !== 'string' || !HEALTH.has(item.health) ||
        typeof item.observedAt !== 'string' || item.observedAt.length > 40 ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(item.observedAt) ||
        Number.isNaN(Date.parse(item.observedAt))) return null;
    return {
        containerId: expectedId,
        status: item.status as ContainerDiagnosisSummary['status'],
        running: item.running,
        exitCode: item.exitCode,
        oomKilled: item.oomKilled,
        health: item.health as ContainerDiagnosisSummary['health'],
        observedAt: item.observedAt,
    };
}

/** Rules produce review prompts, not root-cause verdicts or executable actions.
 * They operate only on the allowlisted, exact-ID snapshot above.
 */
export type ContainerInvestigationHint =
    'memoryPressure' | 'healthProbe' | 'nonzeroExit' | 'unstableState' |
    'stopped' | 'insufficientEvidence';

export function containerInvestigationHints(report: ContainerDiagnosisSummary): ContainerInvestigationHint[] {
    const hints: ContainerInvestigationHint[] = [];
    if (report.oomKilled) {
        hints.push('memoryPressure');
    } else if (!report.running && report.status === 'exited' && report.exitCode !== 0) {
        // Exit 137 alone is not evidence of an OOM kill.
        hints.push('nonzeroExit');
    }
    if (report.health === 'unhealthy') hints.push('healthProbe');
    if (report.status === 'paused' || report.status === 'restarting' || report.status === 'dead') {
        hints.push('unstableState');
    }
    if (!report.running && report.status === 'exited' && report.exitCode === 0 && !report.oomKilled) {
        hints.push('stopped');
    }
    return hints.length ? hints : ['insufficientEvidence'];
}
