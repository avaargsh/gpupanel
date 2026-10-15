import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import AppStoreTab from './store';
import InstalledTab from './installed';
import AppSettingsTab from './settings';

export default function AppsPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('store');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))}>
                <TabPane tab={t('apps.tabs.store')} itemKey="store">
                    <AppStoreTab />
                </TabPane>
                <TabPane tab={t('apps.tabs.installed')} itemKey="installed">
                    <InstalledTab />
                </TabPane>
                <TabPane tab={t('apps.tabs.upgrade')} itemKey="upgrade">
                    <InstalledTab upgradeOnly />
                </TabPane>
                <TabPane tab={t('apps.tabs.settings')} itemKey="settings">
                    <AppSettingsTab />
                </TabPane>
            </Tabs>
        </div>
    );
}
