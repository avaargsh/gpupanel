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
    observerScope?: 'new-app-server-process';
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
        data.observerScope === 'new-app-server-process' && typeof data.hasMore === 'boolean';
    if (!isRollout && !isAppServer) throw new Error('不兼容的 Codex 清单格式');

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
        liveStatusVerified: false, observerScope: 'new-app-server-process',
        hasMore: data.hasMore as boolean, sessions,
    } : {
        schemaVersion: 1, source: 'local-user-codex-rollouts', readOnly: true,
        liveStatusVerified: false, sessions,
    };
}
