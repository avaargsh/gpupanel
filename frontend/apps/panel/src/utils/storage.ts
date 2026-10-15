const PREFIX = 'gpupanel.';

export function readJSON<T>(key: string, fallback?: T): T | undefined {
    try {
        const raw = window.localStorage.getItem(PREFIX + key);
        if (raw == null) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function writeJSON(key: string, value: unknown): void {
    try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        /* ignore quota / private mode errors */
    }
}

export function removeKey(key: string): void {
    try {
        window.localStorage.removeItem(PREFIX + key);
    } catch {
        /* ignore */
    }
}
