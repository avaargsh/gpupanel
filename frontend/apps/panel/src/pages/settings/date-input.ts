/** Native datetime-local controls use local time, API callers retain their ISO conversion. */
export function localDateTime(value?: Date | string | number | null): string {
    if (value == null) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 19);
}
