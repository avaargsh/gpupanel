import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import CronjobTab from './cronjob';
import ScriptLibraryTab from './library';

export default function CronjobPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('cronjob');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))}>
                <TabPane tab={t('cronjob.tabs.cronjob')} itemKey="cronjob">
                    <CronjobTab />
                </TabPane>
                <TabPane tab={t('cronjob.tabs.library')} itemKey="library">
                    <ScriptLibraryTab />
                </TabPane>
            </Tabs>
        </div>
    );
}
