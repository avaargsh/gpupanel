import { Button } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight, IconComponent } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { currentNav, navSections } from '@/config/nav';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/features/ui/uiSlice';

export default function Sidebar() {
    const { t } = useTranslation();
    const location = useLocation();
    const dispatch = useAppDispatch();
    const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
    const active = currentNav(location.pathname, location.search)?.path;
    return <aside className={`workspace-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label={t('app.name')}>
        <Link className="workspace-brand" to="/" aria-label="GPUPanel">
            <span className="workspace-mark"><IconComponent size="large" /></span>
            {!collapsed && <span><strong>GPUPanel</strong><small>Developer workspace</small></span>}
        </Link>
        <nav className="workspace-nav" aria-label={t('workbench.personal')}>
            {navSections.map((section) => <section key={section.titleKey}>
                <h2 className={collapsed ? 'visually-hidden' : 'workspace-nav-heading'}>{t(section.titleKey)}</h2>
                {section.items.map((item) => item.unavailable ?
                    <button key={item.path} className="workspace-nav-link unavailable" aria-disabled="true" aria-label={`${t(item.labelKey)} · ${t('workbench.notConnected')}`}
                        title={`${t(item.labelKey)} · ${t('workbench.notConnected')}`}>
                        {item.icon}{!collapsed && <><span>{t(item.labelKey)}</span><small>{t('workbench.notConnected')}</small></>}
                    </button> :
                    <Link key={item.path} className="workspace-nav-link" to={item.path}
                        title={t(item.labelKey)} aria-label={t(item.labelKey)}
                        aria-current={active === item.path ? 'page' : undefined}>
                        {item.icon}{!collapsed && <span>{t(item.labelKey)}</span>}
                    </Link>)}
            </section>)}
        </nav>
        <div className="workspace-sidebar-footer">
            {!collapsed && <span>vNext <small>Development</small></span>}
            <Button theme="borderless" type="tertiary" icon={collapsed ? <IconChevronRight /> : <IconChevronLeft />}
                aria-label={collapsed ? t('common.expand') : t('common.collapse')} onClick={() => dispatch(toggleSidebar())} />
        </div>
    </aside>;
}
