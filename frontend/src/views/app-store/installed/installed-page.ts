import type { App } from '@/api/interface/app';

// Validate the actual Agent AppInstallDTO fields consumed by Installed Apps.
// Never interpret a malformed response as an empty successful installation list.
export function parseInstalledAppPage(input: unknown): { items: App.AppInstalled[]; total: number } {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('installed apps page is not an object');
    }
    const page = input as Record<string, unknown>;
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total) || (page.total as number) < 0) {
        throw new Error('invalid installed apps pagination');
    }
    const items = page.items.map((value): App.AppInstalled => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('invalid installed app row');
        }
        const row = value as Record<string, unknown>;
        if (!Number.isSafeInteger(row.id) || (row.id as number) <= 0 ||
            typeof row.name !== 'string' || !row.name.trim() ||
            typeof row.status !== 'string' || !row.status ||
            typeof row.appKey !== 'string' || typeof row.path !== 'string' ||
            typeof row.serviceName !== 'string' || typeof row.favorite !== 'boolean' ||
            !row.app || typeof row.app !== 'object' || Array.isArray(row.app)) {
            throw new Error('invalid installed app identity or status');
        }
        return row as unknown as App.AppInstalled;
    });
    if (items.length > (page.total as number)) {
        throw new Error('installed apps rows exceed total');
    }
    return { items, total: page.total as number };
}

// One fence for background polling, explicit refresh, sort view and node switches.
export class InstalledListRevision {
    private revision = 0;

    next(node: string): { revision: number; node: string } {
        return { revision: ++this.revision, node };
    }

    active(ticket: { revision: number; node: string }, activeNode: string): boolean {
        return ticket.revision === this.revision && ticket.node === activeNode;
    }

    invalidate(): void {
        ++this.revision;
    }
}
