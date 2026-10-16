import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import CronjobTab from './cronjob';
import ScriptLibraryTab from './library';

export default function CronjobPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('cronjob');

    return (
        <div className="module-shell">
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    <TabsTrigger value="cronjob">{t('cronjob.tabs.cronjob')}</TabsTrigger>
                    <TabsTrigger value="library">{t('cronjob.tabs.library')}</TabsTrigger>
                </TabsList>
                <TabsContent value="cronjob" className="module-tab-content">
                    <CronjobTab />
                </TabsContent>
                <TabsContent value="library" className="module-tab-content">
                    <ScriptLibraryTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
