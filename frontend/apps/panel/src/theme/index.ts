import type { ResolvedMode } from './tokens';

/**
 * Redux is the sole theme source. shadcn/ui activates dark tokens through the
 * `dark` class on the html element (`@custom-variant dark` in globals.css).
 */
export function applyThemeMode(mode: ResolvedMode): void {
    document.documentElement.classList.toggle('dark', mode === 'dark');
}

export type { ResolvedMode } from './tokens';
export { brandColor, getTokens, shape, lightTokens, darkTokens } from './tokens';
