import { useEffect } from 'react';
import { Layout } from '@douyinfe/semi-ui';
import { Outlet } from 'react-router-dom';
import { setCommandOpen } from '@/features/ui/uiSlice';
import { useAppDispatch } from '@/store/hooks';
import CommandPalette from './CommandPalette';
import Header from './Header';
import AssistantDock from '@/components/AssistantDock';
import Sidebar from './Sidebar';

const { Content } = Layout;

export default function AppLayout() {
    const dispatch = useAppDispatch();

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                dispatch(setCommandOpen(true));
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [dispatch]);

    return (
        <Layout style={{ height: '100vh', overflow: 'hidden' }}>
            <Sidebar />
            <Layout style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Header />
                <Content style={{ flexGrow: 1, overflowY: 'auto', padding: 24, backgroundColor: 'var(--semi-color-bg-1)' }}>
                    <Outlet />
                </Content>
            </Layout>
            <CommandPalette />
            <AssistantDock />
        </Layout>
    );
}
