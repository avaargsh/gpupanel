import type { ReactNode } from 'react';
import { IconApps, IconArticle, IconBox, IconClock, IconGlobe, IconHome, IconLayers, IconServer, IconSetting, IconWrench, IconCode, IconFolder } from '@douyinfe/semi-icons';

export interface NavItem { path: string; labelKey: string; icon: ReactNode; unavailable?: boolean }
export interface NavSection { titleKey: string; items: NavItem[] }

// Only connected capabilities navigate. Project/environment lifecycle needs a backend contract.
export const navSections: NavSection[] = [
    { titleKey: 'workbench.personal', items: [
        { path: '/', labelKey: 'workbench.title', icon: <IconHome /> },
        { path: '/projects', labelKey: 'workbench.projects', icon: <IconFolder />, unavailable: true },
        { path: '/environments', labelKey: 'workbench.environments', icon: <IconLayers />, unavailable: true },
        { path: '/apps', labelKey: 'workbench.apps', icon: <IconApps /> },
        { path: '/host?tab=terminal', labelKey: 'workbench.terminal', icon: <IconCode /> },
    ] },
    { titleKey: 'workbench.infrastructure', items: [
        { path: '/host', labelKey: 'nav.host', icon: <IconServer /> },
        { path: '/gpu', labelKey: 'workbench.gpu', icon: <IconLayers /> },
        { path: '/containers', labelKey: 'nav.container', icon: <IconBox /> },
        { path: '/databases', labelKey: 'nav.database', icon: <IconLayers /> },
        { path: '/websites', labelKey: 'nav.website', icon: <IconGlobe /> },
        { path: '/openresty', labelKey: 'workbench.proxy', icon: <IconGlobe /> },
    ] },
    { titleKey: 'workbench.operations', items: [
        { path: '/cronjobs', labelKey: 'nav.cronjob', icon: <IconClock /> },
        { path: '/toolbox', labelKey: 'nav.toolbox', icon: <IconWrench /> },
        { path: '/logs', labelKey: 'nav.logs', icon: <IconArticle /> },
        { path: '/settings', labelKey: 'nav.settings', icon: <IconSetting /> },
        { path: '/ai', labelKey: 'workbench.advancedAI', icon: <IconSetting /> },
    ] },
];
export const flatNav = navSections.flatMap((section) => section.items).filter((item) => !item.unavailable);

/** Query-specific entries win over a parent page; root never matches unrelated pages. */
export function currentNav(pathname: string, search: string): NavItem | undefined {
    const query = new URLSearchParams(search);
    return flatNav.find((item) => {
        const [path, params] = item.path.split('?');
        return params && path === pathname && [...new URLSearchParams(params)].every(([key, value]) => query.get(key) === value);
    }) ?? flatNav.find((item) => !item.path.includes('?') &&
        (item.path === '/' ? pathname === '/' : pathname === item.path || pathname.startsWith(item.path + '/')));
}
