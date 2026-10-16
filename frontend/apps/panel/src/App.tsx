import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { store } from '@/store';
import { useAppSelector } from '@/store/hooks';
import { applyThemeMode } from '@/theme';
import { useResolvedMode } from '@/utils/useResolvedMode';

function ThemedApp() {
    const mode = useAppSelector((s) => s.ui.themeMode);
    const resolvedMode = useResolvedMode(mode);

    // Redux is the sole theme source; shadcn switches through the html.dark class.
    useEffect(() => {
        applyThemeMode(resolvedMode);
    }, [resolvedMode]);

    return (
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster theme={resolvedMode} position="bottom-right" />
        </TooltipProvider>
    );
}

export default function App() {
    return (
        <Provider store={store}>
            <ThemedApp />
        </Provider>
    );
}
