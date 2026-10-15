/**
 * 设计 token —— 柔和中性灰 + 低饱和青绿强调色（参考 BioAI Workstation 的视觉语言）：
 * 浅色为暖白灰底（#f5f6f8）配纯白卡片，深色为冷调近黑底配略亮卡片；
 * 主色是克制的青绿，语义色低饱和但保持可读性。
 *
 * 注意：这些色值主要供 ECharts 等 JS 侧使用；
 * Semi 组件自身的颜色通过 `theme/semi-override.css` 覆盖 CSS 变量实现。
 */

/** 解析后的实际外观模式（'system' 已展开） */
export type ResolvedMode = 'light' | 'dark';

export interface BrandTokens {
    primary: string;
    primaryHover: string;
    backgroundDefault: string;
    backgroundPaper: string;
    backgroundElevated: string;
    divider: string;
    textPrimary: string;
    textSecondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
}

export const lightTokens: BrandTokens = {
    primary: '#357d73',
    primaryHover: '#20695f',
    backgroundDefault: '#f5f6f8',
    backgroundPaper: '#ffffff',
    backgroundElevated: '#ffffff',
    divider: '#e8eaee',
    textPrimary: '#20242a',
    textSecondary: '#66707a',
    success: '#2f9e77',
    warning: '#a46c27',
    error: '#b84f56',
    info: '#4c6ca4',
};

export const darkTokens: BrandTokens = {
    primary: '#7ac6b6',
    primaryHover: '#8ddccb',
    backgroundDefault: '#181c20',
    backgroundPaper: '#242a2f',
    backgroundElevated: '#242a2f',
    divider: '#343c40',
    textPrimary: '#e9eeed',
    textSecondary: '#b5c1bf',
    success: '#6fceac',
    warning: '#e1ba7c',
    error: '#f0969b',
    info: '#a1baf2',
};

export const getTokens = (mode: ResolvedMode): BrandTokens => (mode === 'dark' ? darkTokens : lightTokens);

/** 品牌渐变（Logo 底色等装饰性用途）：暗青绿 → 亮青绿 */
export const brandGradient = 'linear-gradient(135deg, #357d73 0%, #5aa695 100%)';

/** 圆角、间距、阴影等尺寸 token */
export const shape = {
    radiusSm: 6,
    radiusMd: 10,
    radiusLg: 14,
    sidebarWidth: 232,
    sidebarCollapsedWidth: 64,
    headerHeight: 54,
} as const;
