/** Missing, non-finite or out-of-range observations are never rendered as zero. */
export function observedPercent(value: unknown): string {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value.toFixed(1)}%` : '--';
}
