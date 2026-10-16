export type ProjectSource = 'manual' | 'uv' | 'catalog';

export function normalizeProjectName(input: string): string | null {
    const name = input.trim();
    if (!name || name === '.' || name === '..' ||
        Array.from(name).length > 80 || name.includes('/') || name.includes('\\') ||
        /[\u0000-\u001f\u007f]/.test(name)) {
        return null;
    }
    return name;
}

// Unknown external provider states must never be presented as provisioned.
export function projectWorkspaceReady(state: string): boolean {
    return state === 'Provisioned';
}

// Only canonical project UUIDs are accepted in the detail route. A malformed
// deep link never starts a network request or selects a prior cached record.
export function validProjectId(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
