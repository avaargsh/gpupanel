/**
 * Core Host Operation receipt projections for the local Operations Center.
 *
 * These are session-scoped operation receipts, NOT ACP Agent tasks or
 * approvals. An expired plan is never presented as actionable.
 */
export interface OperationReceipt {
    id: string;
    state: string;
    expiresAt: string;
    createdAt: string;
}

const activeStates = new Set(['planned', 'running', 'unknown', 'failed']);

export function isConfirmablePlan(row: OperationReceipt, nowMs: number): boolean {
    const expires = Date.parse(row.expiresAt);
    return row.state === 'planned' && Number.isFinite(expires) && expires > nowMs;
}

export function projectOperationReceipts<T extends OperationReceipt>(
    rows: readonly T[],
    nowMs: number,
) {
    // API owns caller/session scope and retention; never infer more history.
    // Preserve stable order on invalid dates and do not mutate RTK data.
    const sorted = [...rows].sort((a, b) => {
        const av = Date.parse(a.createdAt);
        const bv = Date.parse(b.createdAt);
        const at = Number.isFinite(av) ? av : 0;
        const bt = Number.isFinite(bv) ? bv : 0;
        return bt - at;
    });
    return {
        activity: sorted,
        tasks: sorted.filter((row) =>
            row.state === 'running' || row.state === 'unknown'
            || row.state === 'failed' || isConfirmablePlan(row, nowMs)),
        pendingConfirmation: sorted.filter((row) => isConfirmablePlan(row, nowMs)),
        uncertain: sorted.filter((row) => row.state === 'unknown'),
        // The backend can also emit other states. Never translate unknown
        // values to "verified" or "successful" by default.
        otherActive: sorted.filter((row) =>
            activeStates.has(row.state) && !isConfirmablePlan(row, nowMs)),
    };
}
