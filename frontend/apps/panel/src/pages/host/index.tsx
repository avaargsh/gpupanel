import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import HostOverview from './overview';
import HostMonitor from './monitor';
import HostTerminal from './terminal';
import HostOperations from './operations';

/**
 * 主机模块（迁移自旧版 frontend/ 的 host 模块）。
 * 三个页签：概览 / 监控 / 终端。
 */
export default function HostPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const tab = query.get('tab') || 'overview';
    return (
        <div style={{ padding: '0 4px' }}>
            <Tabs type="line" activeKey={tab} onChange={(key) => setQuery({ tab: String(key) })} lazyRender>
                <TabPane itemKey="overview" tab={t('host.tabs.overview')}>
                    <div style={{ paddingTop: 16 }}>
                        <HostOverview />
                    </div>
                </TabPane>
                <TabPane itemKey="monitor" tab={t('host.tabs.monitor')}>
                    <div style={{ paddingTop: 16 }}>
                        <HostMonitor />
                    </div>
                </TabPane>
                <TabPane itemKey="operations" tab={t('hostOps.title')}>
                    <div style={{ paddingTop: 16 }}><HostOperations /></div>
                </TabPane>
                <TabPane itemKey="terminal" tab={t('host.tabs.terminal')}>
                    <div style={{ paddingTop: 16 }}>
                        <HostTerminal />
                    </div>
                </TabPane>
            </Tabs>
        </div>
    );
}