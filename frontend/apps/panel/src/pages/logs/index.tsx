import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LoginLogTab from './login';
import OperationLogTab from './operation';
import SSHLogTab from './ssh';
import SystemLogTab from './system';
import TaskLogTab from './task';

const TABS = ['operation', 'login', 'system', 'task', 'ssh'] as const;

/**
 * 日志模块对应旧版 `frontend/src/views/log`：五个页签统一收拢到一个路由，
 * 面板日志 / 登录日志走 core 服务（`/core/logs/*`），主机系统日志 / 任务日志
 * 走 agent（`/logs/*`），SSH 登录日志走 `/hosts/ssh/log`。
 */
export default function LogsPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const requested = query.get('tab') || 'operation';
    const tab = (TABS as readonly string[]).includes(requested) ? requested : 'operation';
    const setTab = (value: string) => setQuery({ tab: value });

    return (
        <div className="module-shell">
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    {TABS.map((key) => (
                        <TabsTrigger key={key} value={key}>
                            {t(`logs.tabs.${key}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="operation" className="module-tab-content">
                    <OperationLogTab />
                </TabsContent>
                <TabsContent value="login" className="module-tab-content">
                    <LoginLogTab />
                </TabsContent>
                <TabsContent value="system" className="module-tab-content">
                    <SystemLogTab />
                </TabsContent>
                <TabsContent value="task" className="module-tab-content">
                    <TaskLogTab />
                </TabsContent>
                <TabsContent value="ssh" className="module-tab-content">
                    <SSHLogTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
