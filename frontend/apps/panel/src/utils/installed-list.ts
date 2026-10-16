import type { AppInstallDto, AppInstalledSearchInput, PageResult } from '@/api/appApi';

// Scope is a cache-key and transport invariant. Never leak it into the Agent DTO.
export type ScopedInstalledSearch = AppInstalledSearchInput & { scopeNode: string };

export function installedSearchRequest({ scopeNode, ...body }: ScopedInstalledSearch) {
    if (!scopeNode || scopeNode.length > 256 || /[\r\n\x00]/.test(scopeNode)) {
        throw new Error('invalid installed-app node scope');
    }
    return {
        url: '/apps/installed/search',
        method: 'POST' as const,
        headers: { CurrentNode: encodeURIComponent(scopeNode) },
        body,
    };
}

// Runtime data is not guaranteed by a TypeScript type or HTTP 2xx.
// Existing Agent serializes nil items as null on an actually empty page.
export function parseInstalledPage(input: unknown): PageResult<AppInstallDto> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('installed list must be an object');
    }
    const value = input as Record<string, unknown>;
    const total = value.total;
    if (!Number.isSafeInteger(total) || (total as number) < 0) {
        throw new Error('invalid installed list total');
    }
    if (value.items === null && total === 0) return { items: [], total: 0 };
    if (!Array.isArray(value.items) || value.items.length > (total as number)) {
        throw new Error('invalid installed list items');
    }
    const items = value.items.map((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('invalid installed application row');
        }
        const row = raw as Record<string, unknown>;
        if (!Number.isSafeInteger(row.id) || (row.id as number) <= 0
            || typeof row.name !== 'string' || !row.name.trim()
            || typeof row.status !== 'string' || !row.status.trim()
            || typeof row.appKey !== 'string') {
            throw new Error('invalid installed application identity');
        }
        return raw as AppInstallDto;
    });
    return { items, total: total as number };
}
