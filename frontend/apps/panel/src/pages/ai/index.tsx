import { useSearchParams } from 'react-router-dom';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import AccountsTab from './accounts';
import LocalTab from './local';
import McpTab from './mcp';
import GpuTab from './gpu';
import AgentsTab from './agents';

export default function AiPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const tab = query.get('tab') || 'accounts';
    const setTab = (value: string) => setQuery({ tab: value });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))}>
                <TabPane tab={t('ai.tabs.accounts')} itemKey="accounts">
                    <AccountsTab />
                </TabPane>
                <TabPane tab={t('ai.tabs.local')} itemKey="local">
                    <LocalTab />
                </TabPane>
                <TabPane tab={t('ai.tabs.mcp')} itemKey="mcp">
                    <McpTab />
                </TabPane>
                <TabPane tab={t('ai.tabs.gpu')} itemKey="gpu">
                    <GpuTab />
                </TabPane>
                <TabPane tab={t('ai.tabs.agents')} itemKey="agents">
                    <AgentsTab />
                </TabPane>
            </Tabs>
        </div>
    );
}
