/**
 * A per-tab, non-secret receipt for a potentially accepted App Store POST.
 *
 * This is a frontend recovery hint, NOT a proof of installation or a backend
 * idempotency guarantee. Do not store form parameters, env values or tokens.
 * Persist BEFORE POST so a reload during the request stays fail-closed.
 */
export interface PendingAppInstall {
    taskID: string;
    node: string;
    appKey: string;
}

export const PENDING_APP_INSTALL_KEY = 'gpupanel:app-install:pending:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_RECEIPT_BYTES = 1024;

const valid = (receipt: PendingAppInstall): boolean =>
    UUID.test(receipt.taskID) &&
    typeof receipt.node === 'string' && receipt.node.trim().length > 0 && receipt.node.length <= 128 &&
    typeof receipt.appKey === 'string' && receipt.appKey.trim().length > 0 && receipt.appKey.length <= 128;

export const readPendingAppInstall = (): PendingAppInstall | null => {
    try {
        const raw = window.sessionStorage.getItem(PENDING_APP_INSTALL_KEY);
        if (!raw) return null;
        if (raw.length > MAX_RECEIPT_BYTES) return null;
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const record = parsed as Record<string, unknown>;
        const receipt = {
            taskID: record.taskID,
            node: record.node,
            appKey: record.appKey,
        };
        if (typeof receipt.taskID !== 'string' ||
            typeof receipt.node !== 'string' ||
            typeof receipt.appKey !== 'string' ||
            !valid(receipt as PendingAppInstall)) return null;
        return receipt as PendingAppInstall;
    } catch {
        // Storage disabled or malformed: never trust unvalidated browser state.
        return null;
    }
};

export const savePendingAppInstall = (receipt: PendingAppInstall): boolean => {
    if (!valid(receipt)) return false;
    try {
        window.sessionStorage.setItem(PENDING_APP_INSTALL_KEY, JSON.stringify(receipt));
        // A failed/quota-blocked write must prevent the privileged submission.
        return readPendingAppInstall()?.taskID === receipt.taskID;
    } catch {
        return false;
    }
};

export const clearPendingAppInstall = (): void => {
    try {
        window.sessionStorage.removeItem(PENDING_APP_INSTALL_KEY);
    } catch {
        // Authorization is server-side. Failing to clear must not grant rights.
    }
};
