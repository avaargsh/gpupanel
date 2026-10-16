export function normalizeIPs(value: string): string {
    return value
        .split(/[\s,]+/)
        .filter(Boolean)
        .join("\n");
}

export function isAnyIP(value: string): boolean {
    const entries = new Set(normalizeIPs(value).split("\n"));
    return entries.has("0.0.0.0/0") && entries.has("::/0");
}

export function formatDateTime(value?: string | null): string {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
