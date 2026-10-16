import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ModulesTab from './modules';
import OtherTab from './other';
import PerformanceTab from './performance';
import { useOpenrestyInstalled } from './shared';
import SourceTab from './source';
import StatusTab from './status';

const TABS = ['status', 'source', 'performance', 'modules', 'other'] as const;

export default function OpenrestyPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('status');
    const { query, installed, running } = useOpenrestyInstalled();
    return (
        <div className="module-shell">
            {query.isLoading ? <Spinner /> : null}
            {query.isError ? (
                <Alert variant="destructive">
                    <AlertTitle>{t('openresty.checkFailed')}</AlertTitle>
                    <Button variant="outline" onClick={() => query.refetch()}>
                        {t('common.retry')}
                    </Button>
                </Alert>
            ) : null}
            {!query.isLoading && !query.isError && !installed ? (
                <Alert>
                    <AlertTitle>{t('openresty.notInstalled')}</AlertTitle>
                    <AlertDescription>{t('openresty.notInstalledHelper')}</AlertDescription>
                </Alert>
            ) : null}
            {installed && !running ? (
                <Alert>
                    <AlertTitle>{t('openresty.notRunning')}</AlertTitle>
                </Alert>
            ) : null}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    {TABS.map((key) => (
                        <TabsTrigger key={key} value={key}>
                            {t(`openresty.tabs.${key}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="status" className="module-tab-content">
                    <StatusTab running={running} />
                </TabsContent>
                <TabsContent value="source" className="module-tab-content">
                    <SourceTab />
                </TabsContent>
                <TabsContent value="performance" className="module-tab-content">
                    <PerformanceTab />
                </TabsContent>
                <TabsContent value="modules" className="module-tab-content">
                    <ModulesTab />
                </TabsContent>
                <TabsContent value="other" className="module-tab-content">
                    <OtherTab running={running} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
