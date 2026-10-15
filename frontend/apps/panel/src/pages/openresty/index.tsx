import { useState } from 'react';
import { Banner, Spin, TabPane, Tabs } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import ModulesTab from './modules';
import OtherTab from './other';
import PerformanceTab from './performance';
import SourceTab from './source';
import StatusTab from './status';
import { useOpenrestyInstalled } from './shared';

export default function OpenrestyPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('status');
    const { query, installed, running } = useOpenrestyInstalled();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {query.isLoading ? <Spin /> : null}
            {query.isError ? (
                <Banner type="danger" closeIcon={null} title={t('openresty.checkFailed')} />
            ) : null}
            {!query.isLoading && !query.isError && !installed ? (
                <Banner type="warning" closeIcon={null} title={t('openresty.notInstalled')} description={t('openresty.notInstalledHelper')} />
            ) : null}
            {installed && !running ? (
                <Banner type="info" closeIcon={null} title={t('openresty.notRunning')} />
            ) : null}
            <Tabs type="button" activeKey={tab} onChange={(k) => setTab(String(k))} lazyRender>
                <TabPane tab={t('openresty.tabs.status')} itemKey="status">
                    <StatusTab running={running} />
                </TabPane>
                <TabPane tab={t('openresty.tabs.source')} itemKey="source">
                    <SourceTab />
                </TabPane>
                <TabPane tab={t('openresty.tabs.performance')} itemKey="performance">
                    <PerformanceTab />
                </TabPane>
                <TabPane tab={t('openresty.tabs.modules')} itemKey="modules">
                    <ModulesTab />
                </TabPane>
                <TabPane tab={t('openresty.tabs.other')} itemKey="other">
                    <OtherTab running={running} />
                </TabPane>
            </Tabs>
        </div>
    );
}
