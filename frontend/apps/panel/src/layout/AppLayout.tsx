import { useEffect } from 'react';
import { Layout } from '@douyinfe/semi-ui';
import { Outlet } from 'react-router-dom';
import { setCommandOpen } from '@/features/ui/uiSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import CommandPalette from './CommandPalette';
import Header from './Header';
import AssistantDock from '@/components/AssistantDock';
import Sidebar from './Sidebar';
import './workspace.css';
import { useTranslation } from 'react-i18next';


export default function AppLayout() {
    const dispatch = useAppDispatch();
    const { t } = useTranslation();
    const node = useAppSelector((s) => s.ui.currentNode) || 'local';

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (document.querySelector('dialog[open]')) return;
                dispatch(setCommandOpen(true));
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [dispatch]);

    return (
        <Layout className="workspace-shell" style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
            <a className="skip-content" href="#workspace-content">{t('workbench.skip')}</a>
            <Sidebar />
            <Layout style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, height: '100%' }}>
                <Header />
                <main id="workspace-content" className="workspace-content" tabIndex={-1}>
                    <div key={node} className="workspace-page"><Outlet /></div>
                </main>
            </Layout>
            <CommandPalette />
            <AssistantDock />
        </Layout>
    );
}
