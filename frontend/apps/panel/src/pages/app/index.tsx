import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ManagementPageHeader from '@/components/ManagementPageHeader';
import { useTranslation } from 'react-i18next';
import AppStoreTab from './store';
import InstalledTab from './installed';
import AppSettingsTab from './settings';

const TABS = ['store', 'installed', 'upgrade', 'settings'] as const;

export default function AppsPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const requested = query.get('tab') || 'store';
    const tab = (TABS as readonly string[]).includes(requested) ? requested : 'store';
    const setTab = (value: string) => setQuery({ tab: value });
    return (
        <div className="module-shell management-shell">
            <ManagementPageHeader title={t('workbench.apps')} />
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    {TABS.map((key) => (
                        <TabsTrigger key={key} value={key}>
                            {t(`apps.tabs.${key}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="store" className="module-tab-content">
                    <AppStoreTab />
                </TabsContent>
                <TabsContent value="installed" className="module-tab-content">
                    <InstalledTab />
                </TabsContent>
                <TabsContent value="upgrade" className="module-tab-content">
                    <InstalledTab upgradeOnly />
                </TabsContent>
                <TabsContent value="settings" className="module-tab-content">
                    <AppSettingsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
