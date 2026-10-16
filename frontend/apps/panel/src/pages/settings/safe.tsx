import {
    useGetCoreSettingsQuery,
    useLoadInterfaceAddrQuery,
    useLoadSSLInfoQuery,
    useUpdateBindMutation,
    useUpdatePortMutation,
    useUpdateSSLMutation,
    useUpdateSettingMutation,
} from "@/api/settingsApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChoiceToggle, NO_AUTH_CODES, SafeEdit } from "./security-choices";
import { SecurityDialogs } from "./security-dialogs";
import { SettingRow, errText } from "./shared";
import { SSLDialog } from "./ssl-dialog";

export default function SafeSettingsTab() {
    const { t } = useTranslation();
    const { data, isFetching } = useGetCoreSettingsQuery();
    const { data: ifaces } = useLoadInterfaceAddrQuery();
    const { data: sslInfo } = useLoadSSLInfoQuery();
    const [updateSetting, { isLoading: savingSetting }] = useUpdateSettingMutation();
    const [updatePort, { isLoading: savingPort }] = useUpdatePortMutation();
    const [updateBind, { isLoading: savingBind }] = useUpdateBindMutation();
    const [updateSSL, { isLoading: savingSSL }] = useUpdateSSLMutation();

    const [edit, setEdit] = useState<SafeEdit>(null);
    const [draft, setDraft] = useState("");
    const [ipv6, setIpv6] = useState("Disable");
    const [sslType, setSslType] = useState<"self" | "import-paste">("self");
    const [sslCert, setSslCert] = useState("");
    const [sslKey, setSslKey] = useState("");

    const saveSetting = async (key: string, value: string) => {
        if (savingSetting) return;
        try {
            await updateSetting({ key, value }).unwrap();
            toast.success(t("settings.saved"));
            setEdit(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const open = (key: SafeEdit, value: string) => {
        setDraft(value ?? "");
        setEdit(key);
    };

    const submitPort = async () => {
        if (savingPort) return;
        try {
            await updatePort({ serverPort: Number(draft) }).unwrap();
            toast.success(t("settings.saved"));
            setEdit(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const submitBind = async () => {
        if (savingBind) return;
        try {
            await updateBind({ bindAddress: draft, ipv6 }).unwrap();
            toast.success(t("settings.saved"));
            setEdit(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const submitSSL = async (enable: boolean) => {
        if (savingSSL) return;
        try {
            if (!enable) {
                await updateSSL({ ssl: "Disable", sslType: "self", domain: "", cert: "", key: "", sslID: 0 }).unwrap();
            } else {
                const isPaste = sslType === "import-paste";
                await updateSSL({
                    ssl: "Enable",
                    sslType,
                    domain: isPaste ? "" : window.location.hostname,
                    cert: isPaste ? sslCert : "",
                    key: isPaste ? sslKey : "",
                    sslID: 0,
                }).unwrap();
            }
            toast.success(t("settings.safe.sslChanged"));
            setEdit(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const downloadCert = async () => {
        try {
            const base = import.meta.env.VITE_API_URL || "/api/v1";
            const res = await fetch(`${base}/core/settings/ssl/download`, { method: "POST", credentials: "include" });
            if (!res.ok) throw new Error(await res.text());
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "server.crt";
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const sslValue = data?.ssl === "Enable" ? `${t("settings.safe.enable")} (${data.sslType})` : t("settings.safe.disable");

    return (
        <div className="flex flex-col gap-3">
            <Card>
                <CardHeader>
                    <CardTitle>{t("settings.safe.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {isFetching && !data ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <div className="flex flex-col">
                            <SettingRow
                                label={t("settings.safe.port")}
                                value={data?.serverPort || "-"}
                                action={
                                    <Button type="button" variant="ghost" size="sm" onClick={() => open("port", data?.serverPort || "")}>
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.bindAddress")}
                                help={t("settings.safe.bindHelper")}
                                value={`${data?.bindAddress || "-"} (IPv6: ${data?.ipv6 || "Disable"})`}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setDraft(data?.bindAddress || "");
                                            setIpv6(data?.ipv6 || "Disable");
                                            setEdit("bind");
                                        }}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.entrance")}
                                help={t("settings.safe.entranceHelper")}
                                value={data?.securityEntrance || t("settings.safe.entranceNone")}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => open("entrance", data?.securityEntrance || "")}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.noAuth")}
                                help={t("settings.safe.noAuthHelper")}
                                value={
                                    <Select
                                        value={data?.noAuthSetting || "200"}
                                        onValueChange={(value) => void saveSetting("NoAuthSetting", value)}
                                    >
                                        <SelectTrigger className="w-65 text-foreground" aria-label={t("settings.safe.noAuth")}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                {NO_AUTH_CODES.map((code) => (
                                                    <SelectItem key={code} value={code}>
                                                        {`${code} - ${t(`settings.safe.noAuthOption.${code}`)}`}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.allowIPs")}
                                help={t("settings.safe.allowIPsHelper")}
                                value={data?.allowIPs || t("settings.safe.allAllowed")}
                                action={
                                    <Button type="button" variant="ghost" size="sm" onClick={() => open("allowIPs", data?.allowIPs || "")}>
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.bindDomain")}
                                help={t("settings.safe.bindDomainHelper")}
                                value={data?.bindDomain || t("settings.safe.notSet")}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => open("bindDomain", data?.bindDomain || "")}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.complexity")}
                                help={t("settings.safe.complexityHelper")}
                                value={
                                    <ChoiceToggle
                                        value={data?.complexityVerification || "Disable"}
                                        onChange={(next) => void saveSetting("ComplexityVerification", next)}
                                        options={[
                                            { value: "Enable", label: t("settings.safe.enable") },
                                            { value: "Disable", label: t("settings.safe.disable") },
                                        ]}
                                    />
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.expiration")}
                                help={t("settings.safe.expirationHelper")}
                                value={
                                    data?.expirationDays ? t("settings.safe.days", { days: data.expirationDays }) : t("settings.safe.never")
                                }
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => open("expiration", data?.expirationDays || "0")}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.safe.ssl")}
                                help={t("settings.safe.sslHelper")}
                                value={sslValue}
                                action={
                                    data?.ssl === "Enable" ? (
                                        <span className="inline-flex flex-wrap gap-2">
                                            {data?.sslType === "self" ? (
                                                <Button type="button" variant="outline" size="sm" onClick={() => void downloadCert()}>
                                                    {t("settings.safe.downloadCert")}
                                                </Button>
                                            ) : null}
                                            <Button type="button" variant="destructive" size="sm" onClick={() => void submitSSL(false)}>
                                                {t("settings.safe.disableSSL")}
                                            </Button>
                                        </span>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSslType("self");
                                                setSslCert("");
                                                setSslKey("");
                                                setEdit("ssl");
                                            }}
                                        >
                                            {t("settings.safe.enableSSL")}
                                        </Button>
                                    )
                                }
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <SecurityDialogs
                edit={edit}
                draft={draft}
                setDraft={setDraft}
                ipv6={ipv6}
                setIpv6={setIpv6}
                savingPort={savingPort}
                savingSetting={savingSetting}
                savingBind={savingBind}
                ifaces={ifaces}
                onClose={() => {
                    if (!savingPort && !savingSetting && !savingBind) setEdit(null);
                }}
                onPort={submitPort}
                onBind={submitBind}
                onSetting={saveSetting}
            />
            <SSLDialog
                open={edit === "ssl"}
                onClose={() => setEdit(null)}
                savingSSL={savingSSL}
                sslType={sslType}
                setSslType={setSslType}
                sslCert={sslCert}
                setSslCert={setSslCert}
                sslKey={sslKey}
                setSslKey={setSslKey}
                sslInfo={sslInfo}
                onSave={() => submitSSL(true)}
            />
        </div>
    );
}
