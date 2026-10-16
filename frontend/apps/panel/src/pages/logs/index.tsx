import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";

import { useTranslation } from "react-i18next";
import LoginLogTab from "./login";
import OperationLogTab from "./operation";
import SSHLogTab from "./ssh";
import SystemLogTab from "./system";
import TaskLogTab from "./task";

/**
 * 日志模块对应旧版 `frontend/src/views/log`：五个页签统一收拢到一个路由，
 * 面板日志 / 登录日志走 core 服务（`/core/logs/*`），主机系统日志 / 任务日志
 * 走 agent（`/logs/*`），SSH 登录日志走 `/hosts/ssh/log`。
 */
export default function LogsPage() {
    const { t } = useTranslation();
    const [query, setQuery] = useSearchParams();
    const requested = query.get("tab") || "operation";
    const tab = ["operation", "login", "system", "task", "ssh"].includes(requested) ? requested : "operation";
    const setTab = (value: string) => setQuery({ tab: value });

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Tabs value={tab} onValueChange={(k) => setTab(String(k))}>
                <TabsList className="flex-wrap">
                    <TabsTrigger value={"operation"} key={"operation"}>
                        {t("logs.tabs.operation")}
                    </TabsTrigger>
                    <TabsTrigger value={"login"} key={"login"}>
                        {t("logs.tabs.login")}
                    </TabsTrigger>
                    <TabsTrigger value={"system"} key={"system"}>
                        {t("logs.tabs.system")}
                    </TabsTrigger>
                    <TabsTrigger value={"task"} key={"task"}>
                        {t("logs.tabs.task")}
                    </TabsTrigger>
                    <TabsTrigger value={"ssh"} key={"ssh"}>
                        {t("logs.tabs.ssh")}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value={"operation"}>
                    <OperationLogTab />
                </TabsContent>
                <TabsContent value={"login"}>
                    <LoginLogTab />
                </TabsContent>
                <TabsContent value={"system"}>
                    <SystemLogTab />
                </TabsContent>
                <TabsContent value={"task"}>
                    <TaskLogTab />
                </TabsContent>
                <TabsContent value={"ssh"}>
                    <SSHLogTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
