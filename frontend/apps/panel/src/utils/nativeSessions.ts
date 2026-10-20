/** Untrusted same-user local exports. Neither format attests OS principal nor global runtime liveness. */
export interface ImportedNativeSession {
    sessionId: string;
    runtimeKind: 'codex';
    projectLabel: string;
    startedAt: string;
    liveness: 'unknown';
    observerStatus?: 'notLoaded' | 'idle' | 'active' | 'systemError';
}

export type ImportedNativeInventory = {
    schemaVersion: 1 | 2;
    source: 'local-user-codex-rollouts' | 'local-user-codex-appserver';
    readOnly: true;
    liveStatusVerified: false;
    sessions: ImportedNativeSession[];
    observerScope?: 'new-app-server-process' | 'attached-loopback-appserver' | 'attached-owner-verified-unix-appserver';
    hasMore?: boolean;
};

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const NATIVE_ID = /^[A-Za-z0-9_.:-]{1,128}$/;
const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_ITEMS = 100;
const STATUSES = ['notLoaded', 'idle', 'active', 'systemError'];
function isRecord(x: unknown): x is Record<string, unknown> {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
}

export function parseNativeInventory(text: string): ImportedNativeInventory {
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
        throw new Error('清单超过 1 MiB 上限');
    }
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error('JSON 文件无法解析');
    }
    if (!isRecord(data) || !Array.isArray(data.sessions) || data.sessions.length > MAX_ITEMS ||
        data.readOnly !== true || data.liveStatusVerified !== false) {
        throw new Error('不兼容的 Codex 清单格式');
    }
    const isRollout = data.schemaVersion === 1 && data.source === 'local-user-codex-rollouts';
    const isAppServer = data.schemaVersion === 2 && data.source === 'local-user-codex-appserver' &&
        (data.observerScope === 'new-app-server-process' ||
         data.observerScope === 'attached-loopback-appserver' ||
         data.observerScope === 'attached-owner-verified-unix-appserver') && typeof data.hasMore === 'boolean';
    if (!isRollout && !isAppServer) throw new Error('不兼容的 Codex 清单格式');
    if (isAppServer && data.sessions.length > 25) throw new Error('app-server 快照超过单页上限');

    const ids = new Set<string>();
    const sessions: ImportedNativeSession[] = data.sessions.map((row: unknown) => {
        if (!isRecord(row) || typeof row.sessionId !== 'string' ||
            !(isRollout ? UUID : NATIVE_ID).test(row.sessionId) ||
            row.runtimeKind !== 'codex' || row.liveness !== 'unknown' ||
            typeof row.projectLabel !== 'string' || row.projectLabel.length > 80 ||
            !row.projectLabel || /[\u0000-\u001f\u007f/\\]/.test(row.projectLabel) ||
            typeof row.startedAt !== 'string' || row.startedAt.length > 40 ||
            !Number.isFinite(Date.parse(row.startedAt)) ||
            (isAppServer
                ? !STATUSES.includes(String(row.observerStatus))
                : row.observerStatus !== undefined)) {
            throw new Error('清单包含无效 Session 元数据');
        }
        const id = isRollout ? row.sessionId.toLowerCase() : row.sessionId;
        if (ids.has(id)) throw new Error('清单包含重复的原生 Session ID');
        ids.add(id);
        const parsed: ImportedNativeSession = {
            sessionId: id,
            runtimeKind: 'codex',
            projectLabel: row.projectLabel,
            startedAt: row.startedAt,
            liveness: 'unknown',
        };
        if (isAppServer) {
            parsed.observerStatus = row.observerStatus as ImportedNativeSession['observerStatus'];
        }
        return parsed;
    });
    return isAppServer ? {
        schemaVersion: 2, source: 'local-user-codex-appserver', readOnly: true,
        liveStatusVerified: false, observerScope: data.observerScope as 'new-app-server-process' | 'attached-loopback-appserver' | 'attached-owner-verified-unix-appserver',
        hasMore: data.hasMore as boolean, sessions,
    } : {
        schemaVersion: 1, source: 'local-user-codex-rollouts', readOnly: true,
        liveStatusVerified: false, sessions,
    };
}

/** One selected, completed NDJSON recording. Never treat it as a live stream. */
export interface ImportedWatchRecord {
    observation: 'observed' | 'unavailable';
    observedAt: string;
    sequence: number;
    inventory: ImportedNativeInventory | null;
}

const MAX_WATCH_BYTES = 4 * 1024 * 1024;
const MAX_WATCH_ROWS = 120;

export function parseNativeWatch(text: string): ImportedWatchRecord {
    if (new TextEncoder().encode(text).byteLength > MAX_WATCH_BYTES) {
        throw new Error('观察记录超过 4 MiB 上限');
    }
    const trimmed = text.trimEnd();
    if (!trimmed) throw new Error('观察记录为空');
    const lines = trimmed.split('\n');
    if (lines.length < 1 || lines.length > MAX_WATCH_ROWS) {
        throw new Error('观察记录数量超限');
    }
    let last: ImportedWatchRecord | null = null;
    let previousTime = Number.NEGATIVE_INFINITY;
    for (const [index, line] of lines.entries()) {
        let item: unknown;
        try {
            item = JSON.parse(line);
        } catch {
            throw new Error('观察记录包含不完整的 JSON 行');
        }
        if (!isRecord(item) || item.schemaVersion !== 1 ||
            item.source !== 'local-user-codex-watch' ||
            item.sequence !== index + 1 ||
            item.liveStatusVerified !== false ||
            (item.connection !== 'observed' && item.connection !== 'unavailable') ||
            typeof item.observedAt !== 'string' || item.observedAt.length > 40) {
            throw new Error('不兼容的观察记录');
        }
        const timestamp = Date.parse(item.observedAt);
        if (!Number.isFinite(timestamp) || timestamp < previousTime) {
            throw new Error('观察记录时间无效或倒序');
        }
        previousTime = timestamp;
        if (item.connection === 'unavailable') {
            if (item.snapshot !== null) throw new Error('断连记录包含未经验证的旧会话');
            last = { observation: 'unavailable', sequence: index + 1,
                observedAt: item.observedAt, inventory: null };
            continue;
        }
        if (!isRecord(item.snapshot)) {
            throw new Error('观察记录缺少原生服务快照');
        }
        const inventory = parseNativeInventory(JSON.stringify(item.snapshot));
        if (inventory.schemaVersion !== 2 ||
            inventory.observerScope !== 'attached-loopback-appserver') {
            throw new Error('不兼容的原生服务观察范围');
        }
        last = { observation: 'observed', sequence: index + 1,
            observedAt: item.observedAt, inventory };
    }
    if (last === null) throw new Error('观察记录为空');
    return last;
}
