/** Untrusted local export parser. No Agent/Host API or authorization is inferred. */
export interface ImportedNativeSession {
    sessionId: string;
    runtimeKind: 'codex';
    projectLabel: string;
    startedAt: string;
    liveness: 'unknown';
}

export interface ImportedNativeInventory {
    schemaVersion: 1;
    source: 'local-user-codex-rollouts';
    readOnly: true;
    liveStatusVerified: false;
    sessions: ImportedNativeSession[];
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_ITEMS = 100;
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
    if (!isRecord(data) || data.schemaVersion !== 1 ||
        data.source !== 'local-user-codex-rollouts' ||
        data.readOnly !== true || data.liveStatusVerified !== false ||
        !Array.isArray(data.sessions) || data.sessions.length > MAX_ITEMS) {
        throw new Error('不兼容的 Codex 清单格式');
    }
    const ids = new Set<string>();
    const sessions: ImportedNativeSession[] = data.sessions.map((row: unknown) => {
        if (!isRecord(row) || typeof row.sessionId !== 'string' ||
            !UUID.test(row.sessionId) || row.runtimeKind !== 'codex' ||
            row.liveness !== 'unknown' || typeof row.projectLabel !== 'string' ||
            row.projectLabel.length > 80 || !row.projectLabel ||
            /[\u0000-\u001f\u007f/\\]/.test(row.projectLabel) ||
            typeof row.startedAt !== 'string' || row.startedAt.length > 40 ||
            !Number.isFinite(Date.parse(row.startedAt))) {
            throw new Error('清单包含无效 Session 元数据');
        }
        const id = row.sessionId.toLowerCase();
        if (ids.has(id)) throw new Error('清单包含重复的原生 Session ID');
        ids.add(id);
        return {
            sessionId: id,
            runtimeKind: 'codex',
            projectLabel: row.projectLabel,
            startedAt: row.startedAt,
            liveness: 'unknown',
        };
    });
    return {
        schemaVersion: 1, source: 'local-user-codex-rollouts',
        readOnly: true, liveStatusVerified: false, sessions,
    };
}
