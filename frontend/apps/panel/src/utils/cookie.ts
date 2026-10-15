export function getCookie(name: string): string | undefined {
    const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[-.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : undefined;
}
