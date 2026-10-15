import { Layout, Nav, Button } from '@douyinfe/semi-ui';
import { IconChevronLeft, IconChevronRight, IconComponent } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { navSections } from '@/config/nav';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { toggleSidebar } from '@/features/ui/uiSlice';
import { brandGradient, shape } from '@/theme';

export default function Sidebar() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useAppDispatch();
    const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
    const width = collapsed ? shape.sidebarCollapsedWidth : shape.sidebarWidth;

    return (
        <Layout.Sider
            style={{
                width,
                minWidth: width,
                maxWidth: width,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRight: '1px solid var(--semi-color-border)',
                backgroundColor: 'var(--semi-color-bg-2)',
                transition: 'width 0.2s ease, min-width 0.2s ease, max-width 0.2s ease',
            }}
        >
            <div
                style={{
                    height: shape.headerHeight,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: collapsed ? 0 : '0 16px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        background: brandGradient,
                        flexShrink: 0,
                    }}
                >
                    <IconComponent size="small" />
                </div>
                {!collapsed && (
                    <span style={{ fontWeight: 750, fontSize: 15, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
                        {t('app.name')}
                    </span>
                )}
            </div>

            <div style={{ flexGrow: 1, overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' }}>
                {navSections.map((section) => (
                    <div key={section.titleKey} style={{ marginBottom: 4 }}>
                        {!collapsed && (
                            <div
                                style={{
                                    padding: '10px 20px 4px',
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    letterSpacing: 0.8,
                                    textTransform: 'uppercase',
                                    color: 'var(--semi-color-text-2)',
                                }}
                            >
                                {t(section.titleKey)}
                            </div>
                        )}
                        <Nav
                            mode="vertical"
                            isCollapsed={collapsed}
                            selectedKeys={[location.pathname]}
                            onSelect={({ itemKey }) => navigate(String(itemKey))}
                            items={section.items.map((item) => ({
                                itemKey: item.path,
                                text: t(item.labelKey),
                                icon: item.icon,
                            }))}
                            style={{ width: '100%' }}
                        />
                    </div>
                ))}
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: collapsed ? 'center' : 'flex-end',
                    padding: 6,
                    borderTop: '1px solid var(--semi-color-border)',
                    flexShrink: 0,
                }}
            >
                <Button
                    theme="borderless"
                    type="tertiary"
                    icon={collapsed ? <IconChevronRight /> : <IconChevronLeft />}
                    onClick={() => dispatch(toggleSidebar())}
                    aria-label={collapsed ? t('common.expand') : t('common.collapse')}
                />
            </div>
        </Layout.Sider>
    );
}
