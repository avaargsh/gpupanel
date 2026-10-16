import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

import { useTranslation } from "react-i18next";
import CronjobTab from "./cronjob";
import ScriptLibraryTab from "./library";

export default function CronjobPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState("cronjob");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Tabs value={tab} onValueChange={(k) => setTab(String(k))}>
                <TabsList className="flex-wrap">
                    <TabsTrigger value={"cronjob"} key={"cronjob"}>
                        {t("cronjob.tabs.cronjob")}
                    </TabsTrigger>
                    <TabsTrigger value={"library"} key={"library"}>
                        {t("cronjob.tabs.library")}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value={"cronjob"}>
                    <CronjobTab />
                </TabsContent>
                <TabsContent value={"library"}>
                    <ScriptLibraryTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
