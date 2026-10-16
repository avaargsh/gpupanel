import { useMemo } from 'react';
import { Languages, LogOut, Menu, Monitor, Moon, Search, Sun, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { baseApi } from '@/api/baseApi';
import { useLogoutMutation } from '@/api/authApi';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { currentNav } from '@/config/nav';
import { clearCredentials } from '@/features/auth/authSlice';
import { setCommandOpen, setLanguage, setThemeMode, setSidebarCollapsed, type ThemeMode } from '@/features/ui/uiSlice';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { shape } from '@/theme';
import { isBlockingDialogOpen } from './dialogOpen';
import HostScope from './HostScope';

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
        const found = currentNav(location.pathname, location.search);
        return t(found?.labelKey ?? 'app.name');
    }, [location.pathname, location.search, t]);

    const cycleTheme = () => {
        const next = THEME_CYCLE[(THEME_CYCLE.indexOf(themeMode) + 1) % THEME_CYCLE.length];
        dispatch(setThemeMode(next));
    };

    const themeIcon =
        themeMode === 'light' ? <Sun aria-hidden="true" /> : themeMode === 'dark' ? <Moon aria-hidden="true" /> : <Monitor aria-hidden="true" />;

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
        <header className="workspace-header"
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
                backgroundColor: 'var(--background)',
                borderBottom: '1px solid var(--border)',
            }}
        >
            <Button
                variant="ghost"
                size="icon"
                aria-label={collapsed ? t('common.expand') : t('common.collapse')}
                onClick={() => dispatch(setSidebarCollapsed(!collapsed))}
            >
                <Menu aria-hidden="true" />
            </Button>

            <span className="workspace-page-title">{currentTitle}</span>
            <HostScope />

            <div style={{ flexGrow: 1 }} />

            <button className="workspace-search" type="button" aria-label={t('workbench.search')}
                onClick={() => { if (isBlockingDialogOpen()) return; dispatch(setCommandOpen(true)); }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: 210,
                    padding: '6px 12px',
                    borderRadius: shape.radiusMd,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--muted)',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                }}
            >
                <Search className="size-4" aria-hidden="true" />
                <span style={{ flexGrow: 1, fontSize: 13 }}>{t('common.search')}</span>
                <span
                    style={{
                        fontSize: 11,
                        padding: '2px 6px',
                        borderRadius: 6,
                        backgroundColor: 'var(--muted)',
                    }}
                >
                    Ctrl K
                </span>
            </button>

            <Button
                variant="ghost"
                size="icon"
                aria-label={t('workbench.theme')} title={t(`common.theme${themeMode === 'light' ? 'Light' : themeMode === 'dark' ? 'Dark' : 'System'}`)}
                onClick={cycleTheme}
            >
                {themeIcon}
            </Button>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('common.language')} title={t('common.language')}>
                        <Languages aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {SUPPORTED_LANGUAGES.map((lang) => (
                        <DropdownMenuItem key={lang.value} onSelect={() => changeLanguage(lang.value)}>
                            {lang.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full" aria-label={t('common.profile')}>
                        <Avatar size="sm">
                            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                                {(auth.name ?? 'U').slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuLabel>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600 }}>{auth.name ?? '-'}</span>
                            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{auth.role ?? '-'}</span>
                        </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>
                        <User aria-hidden="true" />{t('common.profile')}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => { void handleLogout(); }}>
                        <LogOut aria-hidden="true" />{t('common.logout')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </header>
    );
}
