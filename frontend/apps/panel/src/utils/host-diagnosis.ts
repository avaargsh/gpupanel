/** Render-only allowlist for existing Host Operations read-only diagnosis receipts.
 * Never treat serialized receipt Output as HTML, a command, or proof of remediation.
 */
export interface HostDiagnosisSummary {
    os: string | null;
    platform: string | null;
    kernel: string | null;
    architecture: string | null;
    uptimeSeconds: number | null;
    rootUsedPercent: number | null;
    rootUsedBytes: number | null;
    rootTotalBytes: number | null;
    acceleratorCount: number | null;
    acceleratorStatus: 'reported' | 'unavailable' | 'unknown';
}

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/;
const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

function identity(value: unknown): string | null {
    return typeof value === 'string' && identityPattern.test(value) ? value : null;
}

function measured(value: unknown, min: number, max: number): number | null {
    return typeof value === 'number' && Number.isFinite(value) &&
        value >= min && value <= max ? value : null;
}

export function parseHostDiagnosis(output: unknown): HostDiagnosisSummary | null {
    if (typeof output !== 'string' || !output || output.length > 16_384) return null;
    let report: unknown;
    try {
        report = JSON.parse(output);
    } catch {
        return null;
    }
    if (!record(report) || !record(report.rootFilesystem)) return null;
    const root = report.rootFilesystem;
    const total = measured(root.totalBytes, 0, Number.MAX_SAFE_INTEGER);
    const used = measured(root.usedBytes, 0, Number.MAX_SAFE_INTEGER);
    const pct = measured(root.usedPercent, 0, 100);
    const validBytes = total !== null && used !== null && used <= total;
    const rawDevices = report.accelerators;
    // Absence of a reported device is not proof of absent GPU hardware.
    const acceleratorStatus: HostDiagnosisSummary['acceleratorStatus'] =
        report.acceleratorStatus === 'unavailable' ? 'unavailable' :
        Array.isArray(rawDevices) && rawDevices.length <= 128 ? 'reported' : 'unknown';
    const summary: HostDiagnosisSummary = {
        os: identity(report.os),
        platform: identity(report.platform),
        kernel: identity(report.kernelVersion),
        architecture: identity(report.arch),
        uptimeSeconds: measured(report.uptimeSeconds, 0, Number.MAX_SAFE_INTEGER),
        rootUsedPercent: pct,
        rootUsedBytes: validBytes ? used : null,
        rootTotalBytes: validBytes ? total : null,
        acceleratorStatus,
        acceleratorCount: acceleratorStatus === 'reported' && Array.isArray(rawDevices)
            ? rawDevices.length : null,
    };
    if (!summary.os && !summary.platform && !summary.kernel &&
        !summary.architecture && summary.uptimeSeconds === null &&
        summary.rootUsedPercent === null && summary.acceleratorStatus === 'unknown') {
        return null;
    }
    return summary;
}
