import type { ContainerOperation } from '@/api/containerApi';

/** Per-tab hint recorded before a potentially destructive Docker request.
 * It is not a server receipt, operation ownership proof or idempotency key.
 * Never store credentials, command output or container environment values.
 */
export interface PendingContainerOperation {
    node: string;
    operation: ContainerOperation;
    names: string[];
    createdAt: number;
}

export const PENDING_CONTAINER_OPERATION_KEY = 'gpupanel:container-operation:pending:v1';
const ALLOWED = new Set<ContainerOperation>(['up', 'start', 'stop', 'restart', 'kill', 'pause', 'unpause', 'remove']);
const valid = (r: PendingContainerOperation) =>
    typeof r.node === 'string' && r.node.trim().length > 0 && r.node.length <= 128 &&
    ALLOWED.has(r.operation) && Array.isArray(r.names) && r.names.length >= 1 &&
    r.names.length <= 100 && r.names.every((n) => typeof n === 'string' && n.length > 0 && n.length <= 128) &&
    new Set(r.names).size === r.names.length &&
    Number.isSafeInteger(r.createdAt) && r.createdAt > 0;
const MAX_BYTES = 16384;

export function readPendingContainerOperation(): PendingContainerOperation | null {
    try {
        const raw = window.sessionStorage.getItem(PENDING_CONTAINER_OPERATION_KEY);
        if (!raw || raw.length > MAX_BYTES) return null;
        const r: unknown = JSON.parse(raw);
        if (!r || typeof r !== 'object') return null;
        const candidate = r as PendingContainerOperation;
        return valid(candidate) ? candidate : null;
    } catch {
        return null;
    }
}

/** Fail closed if a stale/malformed receipt exists or storage is unavailable. */
export function savePendingContainerOperation(receipt: PendingContainerOperation): boolean {
    if (!valid(receipt)) return false;
    try {
        if (window.sessionStorage.getItem(PENDING_CONTAINER_OPERATION_KEY) !== null) return false;
        window.sessionStorage.setItem(PENDING_CONTAINER_OPERATION_KEY, JSON.stringify(receipt));
        const restored = readPendingContainerOperation();
        return restored?.createdAt === receipt.createdAt &&
            restored.node === receipt.node && restored.operation === receipt.operation &&
            JSON.stringify(restored.names) === JSON.stringify(receipt.names);
    } catch {
        return false;
    }
}

export function clearPendingContainerOperation(expectedCreatedAt: number): boolean {
    try {
        const stored = readPendingContainerOperation();
        if (!stored || stored.createdAt !== expectedCreatedAt) return false;
        window.sessionStorage.removeItem(PENDING_CONTAINER_OPERATION_KEY);
        return window.sessionStorage.getItem(PENDING_CONTAINER_OPERATION_KEY) === null;
    } catch {
        return false;
    }
}
