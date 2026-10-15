import type { App } from '@/api/interface/app';

// Boundary validation for the existing 1Panel apps/search response. This is
// intentionally scoped to the single local catalog page, not a generic DTO SDK.
export function parseLocalAppPage(input: unknown): App.AppResPage {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('app page response is not an object');
    }
    const data = input as Record<string, unknown>;
    if (!Array.isArray(data.items) || !Number.isSafeInteger(data.total) || (data.total as number) < 0) {
        throw new Error('app page pagination is invalid');
    }
    const items = data.items.map((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('invalid local application');
        }
        const item = value as Record<string, unknown>;
        if (!Number.isSafeInteger(item.id) || (item.id as number) <= 0
            || typeof item.key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item.key)
            || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 256
            || typeof item.installed !== 'boolean'
            || !Number.isSafeInteger(item.limit) || (item.limit as number) < 0) {
            throw new Error('invalid local application identity or install state');
        }
        if (item.tags != null && (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== 'string'))) {
            throw new Error('invalid application tags');
        }
        return { ...item, description: typeof item.description === 'string' ? item.description : '',
            tags: item.tags || [], status: typeof item.status === 'string' ? item.status : '' } as App.AppItem;
    });
    if (items.length > (data.total as number)) {
        throw new Error('app page count exceeds total');
    }
    return { items, total: data.total as number };
}
