/** 字节数格式化为人类可读字符串（B / KB / MB / GB / TB，1024 进制） */
export function formatBytes(bytes?: number | null, digits = 1): string {
    if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—';
    if (bytes === 0) return '0 B';
    if (bytes < 0) return `-${formatBytes(-bytes, digits)}`;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exp;
    return `${value.toFixed(exp === 0 ? 0 : digits)} ${units[exp]}`;
}

/** 数字百分比格式化，缺省返回 “—” */
export function formatPercent(value?: number | null, digits = 2): string {
    if (value === undefined || value === null || Number.isNaN(value)) return '—';
    return `${value.toFixed(digits)} %`;
}

const UNIT_FACTORS: Record<string, number> = {
    b: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 ** 2,
    mib: 1024 ** 2,
    gb: 1024 ** 3,
    gib: 1024 ** 3,
    tb: 1024 ** 4,
    tib: 1024 ** 4,
};

/**
 * 解析形如 “42GB” / “1.5 GiB” / “1024” 的容量字符串为字节数。
 * 无法解析时返回 undefined。
 */
export function parseMetricBytes(value?: string | number | null): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;
    const match = String(value)
        .trim()
        .match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
    if (!match) return undefined;
    const num = Number.parseFloat(match[1]);
    if (Number.isNaN(num)) return undefined;
    const unit = (match[2] ?? 'b').toLowerCase();
    const factor = UNIT_FACTORS[unit] ?? 1;
    return num * factor;
}

/** 由 “已用 / 总量” 字符串计算百分比 */
export function metricPercent(used?: string | number | null, total?: string | number | null): number | undefined {
    const u = parseMetricBytes(used);
    const t = parseMetricBytes(total);
    if (u === undefined || t === undefined || t <= 0) return undefined;
    return Math.max(0, Math.min(100, (u / t) * 100));
}
