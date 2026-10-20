/** A user-selected, append-only observation file: never a native session authority. */
import type { ImportedWatchRecord } from './nativeSessions';

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_AGE_MS = 90_000;
const MAX_FUTURE_MS = 30_000;

export type LocalTailResult = {
    state: 'pending' | 'observed' | 'unavailable' | 'stale';
    record: ImportedWatchRecord | null;
};

// A writer may have appended half of a JSON record. Only completed newline-
// terminated records can be shown. No incomplete line is promoted to success.
export function readLocalWatchTail(
    text: string, parseWatch: (input: string) => ImportedWatchRecord, now = Date.now(),
): LocalTailResult {
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) {
        throw new Error('本地观察文件超过 4 MiB 上限');
    }
    const end = text.lastIndexOf('\n');
    if (end < 0) return { state: 'pending', record: null };
    const complete = text.slice(0, end + 1);
    if (!complete.trim()) return { state: 'pending', record: null };
    const record = parseWatch(complete);
    const observed = Date.parse(record.observedAt);
    if (observed > now + MAX_FUTURE_MS || now - observed > MAX_AGE_MS) {
        return { state: 'stale', record: null };
    }
    return { state: record.observation, record };
}
