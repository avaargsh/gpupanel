import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

import { useTranslation } from "react-i18next";
import ClamTab from "./clam";
import CleanTab from "./clean";
import DeviceTab from "./device";
import Fail2banTab from "./fail2ban";
import FtpTab from "./ftp";

export default function ToolboxPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState("device");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Tabs value={tab} onValueChange={(k) => setTab(String(k))}>
                <TabsList className="flex-wrap">
                    <TabsTrigger value={"device"} key={"device"}>
                        {t("toolbox.tabs.device")}
                    </TabsTrigger>
                    <TabsTrigger value={"clean"} key={"clean"}>
                        {t("toolbox.tabs.clean")}
                    </TabsTrigger>
                    <TabsTrigger value={"fail2ban"} key={"fail2ban"}>
                        {t("toolbox.tabs.fail2ban")}
                    </TabsTrigger>
                    <TabsTrigger value={"ftp"} key={"ftp"}>
                        {t("toolbox.tabs.ftp")}
                    </TabsTrigger>
                    <TabsTrigger value={"clam"} key={"clam"}>
                        {t("toolbox.tabs.clam")}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value={"device"}>
                    <DeviceTab />
                </TabsContent>
                <TabsContent value={"clean"}>
                    <CleanTab />
                </TabsContent>
                <TabsContent value={"fail2ban"}>
                    <Fail2banTab />
                </TabsContent>
                <TabsContent value={"ftp"}>
                    <FtpTab />
                </TabsContent>
                <TabsContent value={"clam"}>
                    <ClamTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
