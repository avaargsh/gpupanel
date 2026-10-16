/**
 * Global-search gating: search must not open behind any other open dialog.
 * Covers native `<dialog open>` (e.g. the assistant panel) and Radix Dialog/Sheet
 * content, which is exposed as `[role="dialog"][data-state="open"]` rather than
 * through the native `open` attribute. The command palette marks itself with
 * `[data-command-palette]` so re-pressing the shortcut is not treated as blocked.
 */
export function isBlockingDialogOpen(): boolean {
    if (typeof document === 'undefined') return false;
    if (document.querySelector('[role="dialog"][data-state="open"]:not([data-command-palette])')) return true;
    return Boolean(document.querySelector('dialog[open]'));
}
