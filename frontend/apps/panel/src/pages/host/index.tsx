import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HostOverview from './overview';
import HostMonitor from './monitor';
import HostTerminal from './terminal';
import HostOperations from './operations';

/**
 * 主机模块（迁移自旧版 frontend/ 的 host 模块）。
 * 三个页签：概览 / 监控 / 终端 + 诊断操作。
 */
export default function HostPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const tab = query.get('tab') || 'overview';
    const setTab = (value: string) => setQuery({ tab: value });
    return (
        <div className="module-shell">
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    <TabsTrigger value="overview">{t('host.tabs.overview')}</TabsTrigger>
                    <TabsTrigger value="monitor">{t('host.tabs.monitor')}</TabsTrigger>
                    <TabsTrigger value="operations">{t('hostOps.title')}</TabsTrigger>
                    <TabsTrigger value="terminal">{t('host.tabs.terminal')}</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="module-tab-content">
                    <HostOverview />
                </TabsContent>
                <TabsContent value="monitor" className="module-tab-content">
                    <HostMonitor />
                </TabsContent>
                <TabsContent value="operations" className="module-tab-content">
                    <HostOperations />
                </TabsContent>
                <TabsContent value="terminal" className="module-tab-content">
                    <HostTerminal />
                </TabsContent>
            </Tabs>
        </div>
    );
}
