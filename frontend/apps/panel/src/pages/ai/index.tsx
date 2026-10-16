import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import AccountsTab from './accounts';
import LocalTab from './local';
import McpTab from './mcp';
import GpuTab from './gpu';
import AgentsTab from './agents';

const TABS = ['accounts', 'local', 'mcp', 'gpu', 'agents'] as const;

export default function AiPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const requested = query.get('tab') || 'accounts';
    const tab = (TABS as readonly string[]).includes(requested) ? requested : 'accounts';
    const setTab = (value: string) => setQuery({ tab: value });
    return (
        <div className="module-shell">
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    {TABS.map((key) => (
                        <TabsTrigger key={key} value={key}>
                            {t(`ai.tabs.${key}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="accounts" className="module-tab-content">
                    <AccountsTab />
                </TabsContent>
                <TabsContent value="local" className="module-tab-content">
                    <LocalTab />
                </TabsContent>
                <TabsContent value="mcp" className="module-tab-content">
                    <McpTab />
                </TabsContent>
                <TabsContent value="gpu" className="module-tab-content">
                    <GpuTab />
                </TabsContent>
                <TabsContent value="agents" className="module-tab-content">
                    <AgentsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
