import { createBrowserRouter } from 'react-router-dom';
import AppLayout from '@/layout/AppLayout';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import NotFoundPage from '@/pages/NotFoundPage';
import HostPage from '@/pages/host';
import ContainersPage from '@/pages/container';
import DatabasesPage from '@/pages/database';
import WebsitesPage from '@/pages/website';
import WebsiteDetailPage from '@/pages/website/detail';
import OpenrestyPage from '@/pages/openresty';
import AppsPage from '@/pages/app';
import AiPage from '@/pages/ai';
import GpuPage from '@/pages/ai/gpu';
import CronjobsPage from '@/pages/cronjob';
import ToolboxPage from '@/pages/toolbox';
import LogsPage from '@/pages/logs';
import SettingsPage from '@/pages/settings';
import ProtectedRoute from './ProtectedRoute';
import ProjectsPage from '@/pages/ProjectsPage';
import ProjectDetailPage from '@/pages/ProjectDetailPage';

/**
 * 路由骨架 —— 对应 12 个业务模块的占位路由已就位，
 * 每个模块迁移完成后只需把 PlaceholderPage 换成真实页面。
 */
export const router = createBrowserRouter([
    {
        path: '/login',
        element: <LoginPage />,
    },
    {
        path: '/',
        element: (
            <ProtectedRoute>
                <AppLayout />
            </ProtectedRoute>
        ),
        children: [
            { index: true, element: <HomePage /> },
            { path: 'host', element: <HostPage /> },
            { path: 'projects', element: <ProjectsPage /> },
            { path: 'projects/:id', element: <ProjectDetailPage /> },
            { path: 'containers', element: <ContainersPage /> },
            { path: 'databases', element: <DatabasesPage /> },
            { path: 'websites', element: <WebsitesPage /> },
            { path: 'websites/:id', element: <WebsiteDetailPage /> },
            { path: 'openresty', element: <OpenrestyPage /> },
            { path: 'apps', element: <AppsPage /> },
            { path: 'ai', element: <AiPage /> },
            { path: 'gpu', element: <GpuPage /> },
            { path: 'cronjobs', element: <CronjobsPage /> },
            { path: 'toolbox', element: <ToolboxPage /> },
            { path: 'logs', element: <LogsPage /> },
            { path: 'settings', element: <SettingsPage /> },
        ],
    },
    {
        path: '*',
        element: <NotFoundPage />,
    },
]);