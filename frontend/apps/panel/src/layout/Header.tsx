import { useMemo } from 'react';
import { Avatar, Button, Dropdown } from '@douyinfe/semi-ui';
import { IconDesktop, IconExit, IconLanguage, IconMenu, IconMoon, IconSearch, IconSun, IconUser } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { baseApi } from '@/api/baseApi';
import { useLogoutMutation } from '@/api/authApi';
import { flatNav } from '@/config/nav';
import { clearCredentials } from '@/features/auth/authSlice';
import { setCommandOpen, setLanguage, setThemeMode, setSidebarCollapsed, type ThemeMode } from '@/features/ui/uiSlice';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { shape } from '@/theme';

const THEME_CYCLE: ThemeMode[] = ['light', 'dark', 'system'];

export default function Header() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useAppDispatch();
    const auth = useAppSelector((s) => s.auth);
    const themeMode = useAppSelector((s) => s.ui.themeMode);
    const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
    const [logout] = useLogoutMutation();

    const currentTitle = useMemo(() => {
        const found = flatNav.find((item) =>
            item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
        );
        return t(found?.labelKey ?? 'app.name');
    }, [location.pathname, t]);

    const cycleTheme = () => {
        const next = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
        dispatch(setThemeMode(next));
    };

    const themeIcon =
        themeMode === 'light' ? <IconSun /> : themeMode === 'dark' ? <IconMoon /> : <IconDesktop />;

    const changeLanguage = (lang: string) => {
        i18n.changeLanguage(lang);
        dispatch(setLanguage(lang));
    };

    const handleLogout = async () => {
        try {
            await logout().unwrap();
        } catch {
            /* 忽略登出接口失败，前端照常清理 */
        }
        dispatch(clearCredentials());
        dispatch(baseApi.util.resetApiState());
        navigate('/login', { replace: true });
    };

    return (
        <header
            style={{
                height: shape.headerHeight,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 16px',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: 'var(--semi-color-bg-0)',
                borderBottom: '1px solid var(--semi-color-border)',
            }}
        >
            <Button
                theme="borderless"
                type="tertiary"
                icon={<IconMenu />}
                aria-label={collapsed ? t('common.expand') : t('common.collapse')}
                onClick={() => dispatch(setSidebarCollapsed(!collapsed))}
            />

            <span style={{ fontWeight: 650, fontSize: 15, marginLeft: 4 }}>{currentTitle}</span>

            <div style={{ flexGrow: 1 }} />

            <div
                role="button"
                tabIndex={0}
                onClick={() => dispatch(setCommandOpen(true))}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') dispatch(setCommandOpen(true));
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: 260,
                    padding: '6px 12px',
                    borderRadius: shape.radiusMd,
                    border: '1px solid var(--semi-color-border)',
                    backgroundColor: 'var(--semi-color-fill-0)',
                    color: 'var(--semi-color-text-2)',
                    cursor: 'pointer',
                }}
            >
                <IconSearch />
                <span style={{ flexGrow: 1, fontSize: 13 }}>{t('common.search')}</span>
                <span
                    style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 6,
                        backgroundColor: 'var(--semi-color-fill-1)',
                    }}
                >
                    ⌘K
                </span>
            </div>

            <Button
                theme="borderless"
                type="tertiary"
                icon={themeIcon}
                aria-label={t(`common.theme${themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'System'}`)}
                onClick={cycleTheme}
            />

            <Dropdown
                trigger="click"
                position="bottomRight"
                render={
                    <Dropdown.Menu>
                        {SUPPORTED_LANGUAGES.map((lang) => (
                            <Dropdown.Item
                                key={lang.value}
                                active={i18n.language === lang.value}
                                onClick={() => changeLanguage(lang.value)}
                            >
                                {lang.label}
                            </Dropdown.Item>
                        ))}
                    </Dropdown.Menu>
                }
            >
                <Button theme="borderless" type="tertiary" icon={<IconLanguage />} aria-label={t('common.language')} />
            </Dropdown>

            <Dropdown
                trigger="click"
                position="bottomRight"
                render={
                    <Dropdown.Menu>
                        <Dropdown.Title>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{auth.name ?? '-'}</span>
                                <span style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>{auth.role ?? '-'}</span>
                            </div>
                        </Dropdown.Title>
                        <Dropdown.Divider />
                        <Dropdown.Item icon={<IconUser />}>{t('common.profile')}</Dropdown.Item>
                        <Dropdown.Item icon={<IconExit />} onClick={handleLogout}>
                            {t('common.logout')}
                        </Dropdown.Item>
                    </Dropdown.Menu>
                }
            >
                <Avatar size="small" style={{ backgroundColor: 'var(--semi-color-primary)', cursor: 'pointer' }}>
                    {(auth.name ?? 'U').slice(0, 1).toUpperCase()}
                </Avatar>
            </Dropdown>
        </header>
    );
}
