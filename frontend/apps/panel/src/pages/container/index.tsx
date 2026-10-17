import type { ContainerInfo } from '@/api/containerApi';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ManagementPageHeader from '@/components/ManagementPageHeader';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContainerExec from './exec';
import ContainerImages from './images';
import ContainerList from './list';
import ContainerLogs from './logs';
import ContainerOverview from './overview';

/**
 * 容器模块（迁移自旧版 frontend/ 的 container 模块）。
 * 五个页签：概览 / 容器 / 镜像 / 日志 / 终端(exec)。
 *
 * “运行中”作为容器列表的状态筛选（不再单列页签），
 * “执行终端”复用 Host 模块沉淀的 Terminal 组件。
 */
export default function ContainersPage() {
    const { t } = useTranslation();
    const [activeKey, setActiveKey] = useState('overview');
    const [logTarget, setLogTarget] = useState<ContainerInfo | null>(null);
    const [execTarget, setExecTarget] = useState<ContainerInfo | null>(null);

    const openLogs = (container: ContainerInfo) => {
        setLogTarget(container);
        setActiveKey('logs');
    };
    const openExec = (container: ContainerInfo) => {
        setExecTarget(container);
        setActiveKey('exec');
    };

    return (
        <div className="module-shell management-shell">
            <ManagementPageHeader title={t('nav.container')} />
            <Tabs value={activeKey} onValueChange={setActiveKey}>
                <TabsList variant="line" className="module-tabs">
                    <TabsTrigger value="overview">{t('container.tabs.overview')}</TabsTrigger>
                    <TabsTrigger value="list">{t('container.tabs.list')}</TabsTrigger>
                    <TabsTrigger value="images">{t('container.tabs.images')}</TabsTrigger>
                    <TabsTrigger value="logs">{t('container.tabs.logs')}</TabsTrigger>
                    <TabsTrigger value="exec">{t('container.tabs.exec')}</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="module-tab-content">
                    <ContainerOverview />
                </TabsContent>
                <TabsContent value="list" className="module-tab-content">
                    <ContainerList onOpenLogs={openLogs} onOpenExec={openExec} />
                </TabsContent>
                <TabsContent value="images" className="module-tab-content">
                    <ContainerImages />
                </TabsContent>
                <TabsContent value="logs" className="module-tab-content">
                    <ContainerLogs target={logTarget} />
                </TabsContent>
                <TabsContent value="exec" className="module-tab-content">
                    <ContainerExec target={execTarget} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
