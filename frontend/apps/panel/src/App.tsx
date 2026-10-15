import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { ConfigProvider } from '@douyinfe/semi-ui';
import en_US from '@douyinfe/semi-ui/lib/es/locale/source/en_US';
import zh_CN from '@douyinfe/semi-ui/lib/es/locale/source/zh_CN';
import { useTranslation } from 'react-i18next';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { store } from '@/store';
import { useAppSelector } from '@/store/hooks';
import { applyThemeMode } from '@/theme';
import { useResolvedMode } from '@/utils/useResolvedMode';

function ThemedApp() {
    const mode = useAppSelector((s) => s.ui.themeMode);
    const resolvedMode = useResolvedMode(mode);
    const { i18n } = useTranslation();

    // Semi 通过 body 上的 theme-mode 属性切换色盘（body 下同时挂载亮/暗两套变量）
    useEffect(() => {
        applyThemeMode(resolvedMode);
    }, [resolvedMode]);

    // 将 Semi 内置组件（分页、表格、日期等）的文案与 App 语言联动
    const locale = i18n.language.startsWith('en') ? en_US : zh_CN;

    return (
        <ConfigProvider locale={locale}>
            <RouterProvider router={router} />
        </ConfigProvider>
    );
}

export default function App() {
    return (
        <Provider store={store}>
            <ThemedApp />
        </Provider>
    );
}
