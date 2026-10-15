import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import PanelSettingsTab from './panel';
import SafeSettingsTab from './safe';
import BackupAccountSettingsTab from './backup';
import SnapshotSettingsTab from './snapshot';
import AlertSettingsTab from './alert';
import APIKeysTab from './apikeys';
import AboutTab from './about';

/**
 * 设置模块对应旧版 `frontend/src/views/setting`：将原先「面板设置 / 安全 / 备份账号 /
 * 快照 / 告警 / API 密钥 / 关于」等多个子页面收拢到一个路由。面板与安全设置走 core
 * （`/core/settings/*`），备份账号 / 快照 / 告警走 agent（`/backups/*`、`/settings/snapshot/*`、
 * `/alert/*`），API 密钥走 `/core/auth/api/keys/*`。
 */
export default function SettingsPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('panel');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))} lazyRender>
                <TabPane tab={t('settings.tabs.panel')} itemKey="panel">
                    <PanelSettingsTab />
                </TabPane>
                <TabPane tab={t('settings.tabs.safe')} itemKey="safe">
                    <SafeSettingsTab />
                </TabPane>
                <TabPane tab={t('settings.tabs.backup')} itemKey="backup">
                    <BackupAccountSettingsTab />
                </TabPane>
                <TabPane tab={t('settings.tabs.snapshot')} itemKey="snapshot">
                    <SnapshotSettingsTab />
                </TabPane>
                <TabPane tab={t('settings.tabs.alert')} itemKey="alert">
                    <AlertSettingsTab />
                </TabPane>
                <TabPane tab={t('settings.tabs.apikeys')} itemKey="apikeys">
                    <APIKeysTab />
                </TabPane>
                <TabPane tab={t('settings.tabs.about')} itemKey="about">
                    <AboutTab />
                </TabPane>
            </Tabs>
        </div>
    );
}
