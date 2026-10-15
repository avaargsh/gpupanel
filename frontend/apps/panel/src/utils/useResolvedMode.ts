import { useEffect, useState } from 'react';
import type { ThemeMode } from '@/features/ui/uiSlice';
import type { ResolvedMode } from '@/theme/tokens';

const QUERY = '(prefers-color-scheme: dark)';

/** 将 'system' 解析为实际亮/暗；同时订阅系统配色变化 */
export function useResolvedMode(mode: ThemeMode): ResolvedMode {
    const [systemMode, setSystemMode] = useState<ResolvedMode>(() =>
        typeof window !== 'undefined' && window.matchMedia(QUERY).matches ? 'dark' : 'light',
    );

    useEffect(() => {
        const mql = window.matchMedia(QUERY);
        const onChange = (e: MediaQueryListEvent) => setSystemMode(e.matches ? 'dark' : 'light');
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, []);

    return mode === 'system' ? systemMode : mode;
}
