/** UTF-8 安全的 Base64 编码（用于 EntranceCode 请求头） */
export function encodeBase64(input: string): string {
    try {
        const bytes = new TextEncoder().encode(input);
        let binary = '';
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });
        return window.btoa(binary);
    } catch {
        return '';
    }
}

/** UTF-8 安全的 Base64 解码（终端/日志流协议使用） */
export function decodeBase64(input: string): string {
    try {
        const binary = window.atob(input);
        const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    } catch {
        return '';
    }
}

/** Optional deployment override. Verified browser entries use the server's HttpOnly cookie. */
export function getEntranceCode(): string {
    return (import.meta.env.VITE_ENTRANCE_CODE as string | undefined) ?? '';
}
