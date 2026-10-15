import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import DeviceTab from './device';
import CleanTab from './clean';
import Fail2banTab from './fail2ban';
import FtpTab from './ftp';
import ClamTab from './clam';

export default function ToolboxPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('device');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))} lazyRender>
                <TabPane tab={t('toolbox.tabs.device')} itemKey="device">
                    <DeviceTab />
                </TabPane>
                <TabPane tab={t('toolbox.tabs.clean')} itemKey="clean">
                    <CleanTab />
                </TabPane>
                <TabPane tab={t('toolbox.tabs.fail2ban')} itemKey="fail2ban">
                    <Fail2banTab />
                </TabPane>
                <TabPane tab={t('toolbox.tabs.ftp')} itemKey="ftp">
                    <FtpTab />
                </TabPane>
                <TabPane tab={t('toolbox.tabs.clam')} itemKey="clam">
                    <ClamTab />
                </TabPane>
            </Tabs>
        </div>
    );
}
