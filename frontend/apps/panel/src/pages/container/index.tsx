import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import type { ContainerInfo } from '@/api/containerApi';
import ContainerOverview from './overview';
import ContainerList from './list';
import ContainerImages from './images';
import ContainerLogs from './logs';
import ContainerExec from './exec';

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
        <div style={{ padding: '0 4px' }}>
            <Tabs type="line" activeKey={activeKey} onChange={setActiveKey} lazyRender>
                <TabPane itemKey="overview" tab={t('container.tabs.overview')}>
                    <div style={{ paddingTop: 16 }}>
                        <ContainerOverview />
                    </div>
                </TabPane>
                <TabPane itemKey="list" tab={t('container.tabs.list')}>
                    <div style={{ paddingTop: 16 }}>
                        <ContainerList onOpenLogs={openLogs} onOpenExec={openExec} />
                    </div>
                </TabPane>
                <TabPane itemKey="images" tab={t('container.tabs.images')}>
                    <div style={{ paddingTop: 16 }}>
                        <ContainerImages />
                    </div>
                </TabPane>
                <TabPane itemKey="logs" tab={t('container.tabs.logs')}>
                    <div style={{ paddingTop: 16 }}>
                        <ContainerLogs target={logTarget} />
                    </div>
                </TabPane>
                <TabPane itemKey="exec" tab={t('container.tabs.exec')}>
                    <div style={{ paddingTop: 16 }}>
                        <ContainerExec target={execTarget} />
                    </div>
                </TabPane>
            </Tabs>
        </div>
    );
}
