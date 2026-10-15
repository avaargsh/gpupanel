import type { App } from '@/api/interface/app';

const classes = new Set(['CONSISTENT', 'PARTIAL', 'CONFLICT', 'UNKNOWN']);
const reasonCode = /^[A-Z][A-Z0-9_]{0,63}$/;
const dockerState = /^[a-z][a-z0-9_-]{0,31}$/;

function record(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('invalid installation evidence payload');
    }
    return input as Record<string, unknown>;
}

function optionalPublicText(input: unknown): string | undefined {
    if (input == null || input === '') return undefined;
    if (typeof input !== 'string' || input.length > 256 || /[\u0000-\u001f\u007f]/.test(input)) {
        throw new Error('invalid public evidence field');
    }
    return input;
}

/**
 * Fail closed for schema drift or false verification. Never treat a diagnosis
 * as a durable operation receipt. Copy only the whitelisted redacted fields.
 */
export function parseAppInstallEvidence(input: unknown, expectedId: number): App.AppInstallEvidence {
    if (!Number.isSafeInteger(expectedId) || expectedId <= 0) {
        throw new Error('invalid requested install identity');
    }
    const value = record(input);
    if (value.installId !== expectedId || value.verified !== false ||
        typeof value.classification !== 'string' || !classes.has(value.classification)) {
        throw new Error('evidence identity/verification mismatch');
    }
    if (typeof value.observedAt !== 'string' || value.observedAt.length > 64 ||
        !Number.isFinite(Date.parse(value.observedAt))) {
        throw new Error('invalid evidence timestamp');
    }
    if (!Array.isArray(value.reasons) || value.reasons.length > 64 ||
        !value.reasons.every((item) => typeof item === 'string' && reasonCode.test(item))) {
        throw new Error('unsafe evidence reason codes');
    }
    if (!Array.isArray(value.containers) || value.containers.length > 32) {
        throw new Error('unbounded evidence containers');
    }
    const containers = value.containers.map((raw) => {
        const item = record(raw);
        const name = optionalPublicText(item.name);
        if (!name || typeof item.state !== 'string' || !dockerState.test(item.state)) {
            throw new Error('invalid container observation');
        }
        return { name, state: item.state };
    });
    return {
        installId: expectedId,
        name: optionalPublicText(value.name),
        appStatus: optionalPublicText(value.appStatus),
        taskId: optionalPublicText(value.taskId),
        taskStatus: optionalPublicText(value.taskStatus),
        classification: value.classification as App.AppInstallEvidence['classification'],
        reasons: [...value.reasons] as string[],
        containers,
        observedAt: value.observedAt,
        verified: false,
    };
}
