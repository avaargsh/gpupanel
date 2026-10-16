import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import AppStoreTab from './store';
import InstalledTab from './installed';
import AppSettingsTab from './settings';
export default function AppsPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const requested = query.get('tab') || 'store';
    const tab = ['store', 'installed', 'upgrade', 'settings'].includes(requested) ? requested : 'store';
    const setTab = (value: string) => setQuery({ tab: value });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line">
                    <TabsTrigger value="store">{t('apps.tabs.store')}</TabsTrigger>
                    <TabsTrigger value="installed">{t('apps.tabs.installed')}</TabsTrigger>
                    <TabsTrigger value="upgrade">{t('apps.tabs.upgrade')}</TabsTrigger>
                    <TabsTrigger value="settings">{t('apps.tabs.settings')}</TabsTrigger>
                </TabsList>
                <TabsContent value="store">
                    <AppStoreTab />
                </TabsContent>
                <TabsContent value="installed">
                    <InstalledTab />
                </TabsContent>
                <TabsContent value="upgrade">
                    <InstalledTab upgradeOnly />
                </TabsContent>
                <TabsContent value="settings">
                    <AppSettingsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
