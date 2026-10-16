import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line">
                    <TabsTrigger value="accounts">{t('ai.tabs.accounts')}</TabsTrigger>
                    <TabsTrigger value="local">{t('ai.tabs.local')}</TabsTrigger>
                    <TabsTrigger value="mcp">{t('ai.tabs.mcp')}</TabsTrigger>
                    <TabsTrigger value="gpu">{t('ai.tabs.gpu')}</TabsTrigger>
                    <TabsTrigger value="agents">{t('ai.tabs.agents')}</TabsTrigger>
                </TabsList>
                <TabsContent value="accounts">
                    <AccountsTab />
                </TabsContent>
                <TabsContent value="local">
                    <LocalTab />
                </TabsContent>
                <TabsContent value="mcp">
                    <McpTab />
                </TabsContent>
                <TabsContent value="gpu">
                    <GpuTab />
                </TabsContent>
                <TabsContent value="agents">
                    <AgentsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
