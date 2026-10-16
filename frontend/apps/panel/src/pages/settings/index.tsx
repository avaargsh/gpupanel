import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import AboutTab from "./about";
import AlertSettingsTab from "./alert";
import APIKeysTab from "./apikeys";
import BackupAccountSettingsTab from "./backup";
import PanelSettingsTab from "./panel";
import SafeSettingsTab from "./safe";
import SnapshotSettingsTab from "./snapshot";

/**
 * 设置模块对应旧版 `frontend/src/views/setting`：将原先「面板设置 / 安全 / 备份账号 /
 * 快照 / 告警 / API 密钥 / 关于」等多个子页面收拢到一个路由。面板与安全设置走 core
 * （`/core/settings/*`），备份账号 / 快照 / 告警走 agent（`/backups/*`、`/settings/snapshot/*`、
 * `/alert/*`），API 密钥走 `/core/auth/api/keys/*`。
 */
export default function SettingsPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState("panel");

    return (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="panel">{t("settings.tabs.panel")}</TabsTrigger>
                <TabsTrigger value="safe">{t("settings.tabs.safe")}</TabsTrigger>
                <TabsTrigger value="backup">{t("settings.tabs.backup")}</TabsTrigger>
                <TabsTrigger value="snapshot">{t("settings.tabs.snapshot")}</TabsTrigger>
                <TabsTrigger value="alert">{t("settings.tabs.alert")}</TabsTrigger>
                <TabsTrigger value="apikeys">{t("settings.tabs.apikeys")}</TabsTrigger>
                <TabsTrigger value="about">{t("settings.tabs.about")}</TabsTrigger>
            </TabsList>
            <TabsContent value="panel">
                <PanelSettingsTab />
            </TabsContent>
            <TabsContent value="safe">
                <SafeSettingsTab />
            </TabsContent>
            <TabsContent value="backup">
                <BackupAccountSettingsTab />
            </TabsContent>
            <TabsContent value="snapshot">
                <SnapshotSettingsTab />
            </TabsContent>
            <TabsContent value="alert">
                <AlertSettingsTab />
            </TabsContent>
            <TabsContent value="apikeys">
                <APIKeysTab />
            </TabsContent>
            <TabsContent value="about">
                <AboutTab />
            </TabsContent>
        </Tabs>
    );
}
