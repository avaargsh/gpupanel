import type { ReactNode } from 'react';
import {
    Box,
    Clock,
    Code,
    Component,
    FileText,
    Folder,
    Globe,
    Home,
    Layers,
    LayoutGrid,
    Server,
    Settings,
    Wrench,
} from 'lucide-react';

export interface NavItem { path: string; labelKey: string; icon: ReactNode; unavailable?: boolean }
export interface NavSection { titleKey: string; items: NavItem[] }

/** Decorative icons; the owning link/option already exposes the accessible label. */
const navIcon = (Icon: typeof Component) => <Icon className="size-4" aria-hidden="true" />;

// Project registration is connected to Core metadata only. Environment lifecycle remains unavailable.
export const navSections: NavSection[] = [
    { titleKey: 'workbench.personal', items: [
        { path: '/', labelKey: 'workbench.title', icon: navIcon(Home) },
        { path: '/projects', labelKey: 'workbench.projects', icon: navIcon(Folder) },
        { path: '/environments', labelKey: 'workbench.environments', icon: navIcon(Layers), unavailable: true },
        { path: '/apps', labelKey: 'workbench.apps', icon: navIcon(LayoutGrid) },
        { path: '/host?tab=terminal', labelKey: 'workbench.terminal', icon: navIcon(Code) },
    ] },
    { titleKey: 'workbench.infrastructure', items: [
        { path: '/host', labelKey: 'nav.host', icon: navIcon(Server) },
        { path: '/gpu', labelKey: 'workbench.gpu', icon: navIcon(Layers) },
        { path: '/containers', labelKey: 'nav.container', icon: navIcon(Box) },
        { path: '/databases', labelKey: 'nav.database', icon: navIcon(Layers) },
        { path: '/websites', labelKey: 'nav.website', icon: navIcon(Globe) },
        { path: '/openresty', labelKey: 'workbench.proxy', icon: navIcon(Globe) },
    ] },
    { titleKey: 'workbench.operations', items: [
        { path: '/cronjobs', labelKey: 'nav.cronjob', icon: navIcon(Clock) },
        { path: '/toolbox', labelKey: 'nav.toolbox', icon: navIcon(Wrench) },
        { path: '/logs', labelKey: 'nav.logs', icon: navIcon(FileText) },
        { path: '/settings', labelKey: 'nav.settings', icon: navIcon(Settings) },
        { path: '/ai', labelKey: 'workbench.advancedAI', icon: navIcon(Settings) },
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
