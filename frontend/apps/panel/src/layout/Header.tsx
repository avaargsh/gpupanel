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
import { setCommandOpen, setCurrentNode, setLanguage, setThemeMode, setSidebarCollapsed, type ThemeMode } from '@/features/ui/uiSlice';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
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
    const currentNode = useAppSelector((s) => s.ui.currentNode) || 'local';
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
        <header className="workspace-header">
            <Button
                variant="ghost"
                size="icon"
                aria-label={collapsed ? t('common.expand') : t('common.collapse')}
                onClick={() => dispatch(setSidebarCollapsed(!collapsed))}
            >
                <Menu aria-hidden="true" />
            </Button>

            <span className="workspace-page-title">{currentTitle}</span>
            <LocalModeChip node={currentNode} />
            <HostScope />

            <div className="flex-1" />

            <button className="workspace-search" type="button" aria-label={t('workbench.search')}
                onClick={() => { if (isBlockingDialogOpen()) return; dispatch(setCommandOpen(true)); }}
            >
                <Search className="size-4" aria-hidden="true" />
                <span className="workspace-search-label">{t('common.search')}</span>
                <span className="workspace-search-hint">Ctrl K</span>
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
                        <div className="flex flex-col">
                            <span className="font-semibold">{auth.name ?? '-'}</span>
                            <span className="text-xs text-muted-foreground">{auth.role ?? '-'}</span>
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

/** 轻量本地模式芯片：显示当前连接模式，轻量可点击，不承担导航（对应参考页“本地模式”标识）。 */
export function LocalModeChip({ node }: { node: string }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const isLocal = node === 'local' || node === '';
    return (
        <span
            className="local-mode-chip"
            data-state={isLocal ? 'ok' : 'unknown'}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dispatch(setCurrentNode(node)); } }}
            onClick={() => void dispatch(setCurrentNode(node))}
            aria-label={t('workbench.scope')}
            title={t('workbench.scope')}
        >
            <span className="chip-dot" aria-hidden="true" />
            <span className="chip-label">{isLocal ? t('workbench.local') : node}</span>
        </span>
    );
}
