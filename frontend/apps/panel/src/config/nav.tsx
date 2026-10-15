import type { ReactNode } from 'react';
import {
    IconAIWandLevel1,
    IconApps,
    IconArticle,
    IconBox,
    IconClock,
    IconGlobe,
    IconHome,
    IconLayers,
    IconServer,
    IconSetting,
    IconWrench,
} from '@douyinfe/semi-icons';

export interface NavItem {
    path: string;
    labelKey: string;
    icon: ReactNode;
}

export interface NavSection {
    titleKey: string;
    items: NavItem[];
}

/**
 * 侧栏导航 —— 与旧版 GPUPanel 的路由模块一一对应，
 * 新模块就绪后把 Placeholder 页面替换为真实页面即可。
 */
export const navSections: NavSection[] = [
    {
        titleKey: 'nav.section.overview',
        items: [{ path: '/', labelKey: 'nav.home', icon: <IconHome /> }],
    },
    {
        titleKey: 'nav.section.resources',
        items: [
            { path: '/host', labelKey: 'nav.host', icon: <IconServer /> },
            { path: '/containers', labelKey: 'nav.container', icon: <IconBox /> },
            { path: '/databases', labelKey: 'nav.database', icon: <IconLayers /> },
            { path: '/websites', labelKey: 'nav.website', icon: <IconGlobe /> },
        ],
    },
    {
        titleKey: 'nav.section.apps',
        items: [
            { path: '/apps', labelKey: 'nav.apps', icon: <IconApps /> },
            { path: '/ai', labelKey: 'nav.ai', icon: <IconAIWandLevel1 /> },
            { path: '/cronjobs', labelKey: 'nav.cronjob', icon: <IconClock /> },
            { path: '/toolbox', labelKey: 'nav.toolbox', icon: <IconWrench /> },
        ],
    },
    {
        titleKey: 'nav.section.system',
        items: [
            { path: '/logs', labelKey: 'nav.logs', icon: <IconArticle /> },
            { path: '/settings', labelKey: 'nav.settings', icon: <IconSetting /> },
        ],
    },
];

/** 扁平列表，供命令面板检索 */
export const flatNav: NavItem[] = navSections.flatMap((section) => section.items);
