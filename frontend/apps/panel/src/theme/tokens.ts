/** GPUPanel vNext: neutral developer surfaces, blue actions, explicit semantic states. */

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
    primary: '#306fe6',
    primaryHover: '#245dcb',
    backgroundDefault: '#f7f8fa',
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
    primary: '#7aa5ff',
    primaryHover: '#a1bfff',
    backgroundDefault: '#0f1117',
    backgroundPaper: '#191d26',
    backgroundElevated: '#191d26',
    divider: '#303644',
    textPrimary: '#edf0f7',
    textSecondary: '#a7b0c1',
    success: '#6fceac',
    warning: '#e1ba7c',
    error: '#f0969b',
    info: '#a1baf2',
};

export const getTokens = (mode: ResolvedMode): BrandTokens => (mode === 'dark' ? darkTokens : lightTokens);

/** Solid brand surface shared by legacy consumers. */
export const brandColor = '#306fe6';

/** 圆角、间距、阴影等尺寸 token */
export const shape = {
    radiusSm: 6,
    radiusMd: 8,
    radiusLg: 12,
    sidebarWidth: 240,
    sidebarCollapsedWidth: 64,
    headerHeight: 56,
} as const;
