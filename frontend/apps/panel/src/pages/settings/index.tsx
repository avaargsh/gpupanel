import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import AboutTab from './about';
import AlertSettingsTab from './alert';
import APIKeysTab from './apikeys';
import BackupAccountSettingsTab from './backup';
import PanelSettingsTab from './panel';
import SafeSettingsTab from './safe';
import SnapshotSettingsTab from './snapshot';

const TABS = ['panel', 'safe', 'backup', 'snapshot', 'alert', 'apikeys', 'about'] as const;

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
        <div className="module-shell">
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    {TABS.map((key) => (
                        <TabsTrigger key={key} value={key}>
                            {t(`settings.tabs.${key}`)}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <TabsContent value="panel" className="module-tab-content">
                    <PanelSettingsTab />
                </TabsContent>
                <TabsContent value="safe" className="module-tab-content">
                    <SafeSettingsTab />
                </TabsContent>
                <TabsContent value="backup" className="module-tab-content">
                    <BackupAccountSettingsTab />
                </TabsContent>
                <TabsContent value="snapshot" className="module-tab-content">
                    <SnapshotSettingsTab />
                </TabsContent>
                <TabsContent value="alert" className="module-tab-content">
                    <AlertSettingsTab />
                </TabsContent>
                <TabsContent value="apikeys" className="module-tab-content">
                    <APIKeysTab />
                </TabsContent>
                <TabsContent value="about" className="module-tab-content">
                    <AboutTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
