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
