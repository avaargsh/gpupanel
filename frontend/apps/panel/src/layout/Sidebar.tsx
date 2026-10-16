import { ChevronLeft, ChevronRight, Component } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { currentNav, navSections } from '@/config/nav';
import { cn } from '@/lib/utils';
import { toggleSidebar } from '@/features/ui/uiSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export default function Sidebar() {
    const { t } = useTranslation();
    const location = useLocation();
    const dispatch = useAppDispatch();
    const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
    const active = currentNav(location.pathname, location.search)?.path;
    return <aside className={cn('workspace-sidebar', collapsed && 'is-collapsed')} aria-label={t('app.name')}>
        <Link className="workspace-brand" to="/" aria-label="GPUPanel">
            <span className="workspace-mark"><Component className="size-4" aria-hidden="true" /></span>
            {!collapsed && <span><strong>GPUPanel</strong></span>}
        </Link>
        <nav className="workspace-nav" aria-label={t('workbench.personal')}>
            {navSections.map((section) => <section key={section.titleKey}>
                <h2 className={collapsed ? 'visually-hidden' : 'workspace-nav-heading'}>{t(section.titleKey)}</h2>
                {section.items.filter((item) => !item.unavailable).map((item) =>
                    <Link key={item.path} className="workspace-nav-link" to={item.path}
                        title={t(item.labelKey)} aria-label={t(item.labelKey)}
                        aria-current={active === item.path ? 'page' : undefined}>
                        {item.icon}{!collapsed && <span>{t(item.labelKey)}</span>}
                    </Link>)}
            </section>)}
        </nav>
        <div className="workspace-sidebar-footer">
            <Button variant="ghost" size="icon" aria-label={collapsed ? t('common.expand') : t('common.collapse')}
                onClick={() => dispatch(toggleSidebar())}>
                {collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
            </Button>
        </div>
    </aside>;
}
