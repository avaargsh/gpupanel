import type { ResolvedMode } from './tokens';

/**
 * 切换 Semi Design 的亮/暗色盘。
 * Semi 会在 body 下同时挂载两套色盘，通过 `body[theme-mode='dark']` 激活暗色。
 * 参考：https://semi.design/zh-CN/advanced/dark-mode
 */
export function applyThemeMode(mode: ResolvedMode): void {
    const body = document.body;
    if (mode === 'dark') {
        body.setAttribute('theme-mode', 'dark');
    } else {
        body.removeAttribute('theme-mode');
    }
}

export type { ResolvedMode } from './tokens';
export { brandGradient, getTokens, shape, lightTokens, darkTokens } from './tokens';
