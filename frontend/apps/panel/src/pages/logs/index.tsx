import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import OperationLogTab from './operation';
import LoginLogTab from './login';
import SystemLogTab from './system';
import TaskLogTab from './task';
import SSHLogTab from './ssh';

/**
 * 日志模块对应旧版 `frontend/src/views/log`：五个页签统一收拢到一个路由，
 * 面板日志 / 登录日志走 core 服务（`/core/logs/*`），主机系统日志 / 任务日志
 * 走 agent（`/logs/*`），SSH 登录日志走 `/hosts/ssh/log`。
 */
export default function LogsPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('operation');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))} lazyRender>
                <TabPane tab={t('logs.tabs.operation')} itemKey="operation">
                    <OperationLogTab />
                </TabPane>
                <TabPane tab={t('logs.tabs.login')} itemKey="login">
                    <LoginLogTab />
                </TabPane>
                <TabPane tab={t('logs.tabs.system')} itemKey="system">
                    <SystemLogTab />
                </TabPane>
                <TabPane tab={t('logs.tabs.task')} itemKey="task">
                    <TaskLogTab />
                </TabPane>
                <TabPane tab={t('logs.tabs.ssh')} itemKey="ssh">
                    <SSHLogTab />
                </TabPane>
            </Tabs>
        </div>
    );
}
