import {
    useDefaultMenuMutation,
    useGetAgentSettingsQuery,
    useGetCoreSettingsQuery,
    useUpdateAgentSettingMutation,
    useUpdateProxyMutation,
    useUpdateSettingMutation,
    type ProxyUpdate,
} from "@/api/settingsApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirmAction } from "@/components/use-confirm-action";
import { setLanguage, setThemeMode } from "@/features/ui/uiSlice";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import { useAppDispatch } from "@/store/hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Field, SettingRow, errText } from "./shared";

/** Enable/Disable 二选一分段控件（原 Semi `RadioGroup type="button"`）。 */
function EnableToggle({ value, onChange, disabled }: { value: string; onChange: (next: string) => void; disabled?: boolean }) {
    const { t } = useTranslation();
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="text-foreground"
            value={value}
            disabled={disabled}
            onValueChange={(next) => {
                if (next) onChange(next);
            }}
        >
            <ToggleGroupItem value="Enable">{t("settings.panel.enable")}</ToggleGroupItem>
            <ToggleGroupItem value="Disable">{t("settings.panel.disable")}</ToggleGroupItem>
        </ToggleGroup>
    );
}

export default function PanelSettingsTab() {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const { confirm, dialog } = useConfirmAction();
    const { data, isFetching } = useGetCoreSettingsQuery();
    const { data: agent } = useGetAgentSettingsQuery();
    const [updateSetting, { isLoading: savingSetting }] = useUpdateSettingMutation();
    const [updateAgentSetting, { isLoading: savingAgent }] = useUpdateAgentSettingMutation();
    const [updateProxy, { isLoading: savingProxy }] = useUpdateProxyMutation();
    const [defaultMenu] = useDefaultMenuMutation();

    const [editKey, setEditKey] = useState<"panelName" | "sessionTimeout" | "systemIP" | "proxy" | null>(null);
    const [draft, setDraft] = useState("");
    const [proxy, setProxy] = useState<ProxyUpdate>({
        proxyType: "close",
        proxyUrl: "",
        proxyPort: "",
        proxyUser: "",
        proxyPasswd: "",
        proxyPasswdKeep: "Disable",
    });

    const onSetting = async (key: string, value: string) => {
        if (savingSetting) return;
        try {
            await updateSetting({ key, value }).unwrap();
            toast.success(t("settings.saved"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const saveAgent = async (key: string, value: string) => {
        if (savingAgent) return;
        try {
            await updateAgentSetting({ key, value }).unwrap();
            toast.success(t("settings.saved"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onTheme = async (value: string) => {
        try {
            await updateSetting({ key: "Theme", value }).unwrap();
            dispatch(setThemeMode((value === "auto" ? "system" : value) as "light" | "dark" | "system"));
            toast.success(t("settings.saved"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onLanguage = async (value: string) => {
        try {
            await updateSetting({ key: "Language", value }).unwrap();
            dispatch(setLanguage(value));
            toast.success(t("settings.saved"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const openEdit = (key: "panelName" | "sessionTimeout" | "systemIP", value: string) => {
        setDraft(value ?? "");
        setEditKey(key);
    };

    const submitEdit = async () => {
        if (savingSetting) return;
        if (!editKey) return;
        try {
            if (editKey === "systemIP") {
                await updateAgentSetting({ key: "SystemIP", value: draft }).unwrap();
            } else {
                const key = editKey === "panelName" ? "PanelName" : "SessionTimeout";
                await updateSetting({ key, value: draft }).unwrap();
            }
            toast.success(t("settings.saved"));
            setEditKey(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const openProxy = () => {
        setProxy({
            proxyType: data?.proxyType || "",
            proxyUrl: data?.proxyUrl || "",
            proxyPort: data?.proxyPort || "",
            proxyUser: data?.proxyUser || "",
            proxyPasswd: "",
            proxyPasswdKeep: data?.proxyPasswdKeep || "Disable",
        });
        setEditKey("proxy");
    };

    const submitProxy = async () => {
        try {
            const isClose = !proxy.proxyType || proxy.proxyType === "close";
            await updateProxy({
                proxyType: isClose ? "" : proxy.proxyType,
                proxyUrl: isClose ? "" : proxy.proxyUrl,
                proxyPort: isClose ? "" : proxy.proxyPort,
                proxyUser: isClose ? "" : proxy.proxyUser,
                proxyPasswd: isClose ? "" : proxy.proxyPasswd,
                proxyPasswdKeep: isClose ? "" : proxy.proxyPasswdKeep,
            }).unwrap();
            toast.success(t("settings.saved"));
            setEditKey(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onDefaultMenu = () => {
        confirm({
            title: t("settings.panel.menuDefault"),
            description: t("settings.panel.menuDefaultConfirm"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await defaultMenu().unwrap();
                    toast.success(t("settings.saved"));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const loading = isFetching && !data;

    return (
        <div className="flex flex-col gap-3">
            {dialog}
            <Card>
                <CardHeader>
                    <CardTitle>{t("settings.panel.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <div className="flex flex-col">
                            <SettingRow
                                label={t("settings.panel.theme")}
                                value={
                                    <ToggleGroup
                                        type="single"
                                        variant="outline"
                                        size="sm"
                                        className="text-foreground"
                                        value={data?.theme ?? "auto"}
                                        onValueChange={(next) => {
                                            if (next) void onTheme(next);
                                        }}
                                    >
                                        <ToggleGroupItem value="light">{t("settings.panel.themeLight")}</ToggleGroupItem>
                                        <ToggleGroupItem value="dark">{t("settings.panel.themeDark")}</ToggleGroupItem>
                                        <ToggleGroupItem value="auto">{t("settings.panel.themeAuto")}</ToggleGroupItem>
                                    </ToggleGroup>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.menuTabs")}
                                help={t("settings.panel.menuTabsHelper")}
                                value={
                                    <EnableToggle
                                        value={data?.menuTabs || "Disable"}
                                        onChange={(next) => void onSetting("MenuTabs", next)}
                                    />
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.menuAccordion")}
                                help={t("settings.panel.menuAccordionHelper")}
                                value={
                                    <EnableToggle
                                        value={data?.menuAccordion || "Disable"}
                                        onChange={(next) => void onSetting("MenuAccordion", next)}
                                    />
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.panelName")}
                                value={data?.panelName || "-"}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEdit("panelName", data?.panelName || "")}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.language")}
                                help={t("settings.panel.languageHelper")}
                                value={
                                    <Select value={data?.language || "zh"} onValueChange={(value) => void onLanguage(value)}>
                                        <SelectTrigger className="w-45 text-foreground" aria-label={t("settings.panel.language")}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                {SUPPORTED_LANGUAGES.map((language) => (
                                                    <SelectItem key={language.value} value={String(language.value)}>
                                                        {language.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.sessionTimeout")}
                                help={t("settings.panel.sessionTimeoutHelper")}
                                value={data?.sessionTimeout ? t("settings.panel.seconds", { count: Number(data.sessionTimeout) }) : "-"}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEdit("sessionTimeout", data?.sessionTimeout || "300")}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.systemIP")}
                                help={t("settings.panel.systemIPHelper")}
                                value={agent?.systemIP || t("settings.panel.notSet")}
                                action={
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openEdit("systemIP", agent?.systemIP || "")}
                                    >
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.developerMode")}
                                help={t("settings.panel.developerModeHelper")}
                                value={
                                    <EnableToggle
                                        value={data?.developerMode || "Disable"}
                                        onChange={(next) => void onSetting("DeveloperMode", next)}
                                    />
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.region")}
                                help={t("settings.panel.regionHelper")}
                                value={
                                    <Select value={data?.edition || "cn"} onValueChange={(value) => void onSetting("Edition", value)}>
                                        <SelectTrigger className="w-50 text-foreground" aria-label={t("settings.panel.region")}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectItem value="cn">{t("settings.panel.regionCn")}</SelectItem>
                                                <SelectItem value="intl">{t("settings.panel.regionIntl")}</SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.proxy")}
                                help={t("settings.panel.proxyHelper")}
                                value={
                                    data?.proxyType
                                        ? `${data.proxyType}://${data.proxyUrl}:${data.proxyPort}`
                                        : t("settings.panel.proxyNone")
                                }
                                action={
                                    <Button type="button" variant="ghost" size="sm" onClick={openProxy}>
                                        {t("settings.set")}
                                    </Button>
                                }
                            />
                            <SettingRow
                                label={t("settings.panel.menuSetting")}
                                help={t("settings.panel.menuSettingHelper")}
                                value={data?.hideMenu || ""}
                                action={
                                    <Button type="button" variant="ghost" size="sm" onClick={onDefaultMenu}>
                                        {t("settings.panel.menuDefault")}
                                    </Button>
                                }
                            />
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={editKey !== null && editKey !== "proxy"}
                onOpenChange={(open) => {
                    if (!open) setEditKey(null);
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void submitEdit())();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.panel.editTitle")}</DialogTitle>
                        </DialogHeader>
                        {editKey === "panelName" ? (
                            <Field label={t("settings.panel.panelName")}>
                                <Input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={64} />
                            </Field>
                        ) : null}
                        {editKey === "sessionTimeout" ? (
                            <Field label={t("settings.panel.sessionTimeout")} help={t("settings.panel.sessionTimeoutHelper2")}>
                                <Input
                                    type="number"
                                    required
                                    min={300}
                                    step={60}
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                />
                            </Field>
                        ) : null}
                        {editKey === "systemIP" ? (
                            <Field label={t("settings.panel.systemIP")} help={t("settings.panel.systemIPHelper")}>
                                <Input
                                    value={draft}
                                    onChange={(event) => setDraft(event.target.value)}
                                    placeholder="https://1.2.3.4:9999"
                                />
                            </Field>
                        ) : null}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditKey(null)}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingSetting}>
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={editKey === "proxy"}
                onOpenChange={(open) => {
                    if (!open && !savingProxy) setEditKey(null);
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void submitProxy())();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.panel.proxy")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.panel.proxyType")}>
                            <Select
                                value={proxy.proxyType || "close"}
                                onValueChange={(value) => setProxy((p) => ({ ...p, proxyType: value }))}
                            >
                                <SelectTrigger className="w-full" aria-label={t("settings.panel.proxyType")}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectItem value="close">{t("settings.panel.proxyClose")}</SelectItem>
                                        <SelectItem value="http">http</SelectItem>
                                        <SelectItem value="https">https</SelectItem>
                                        <SelectItem value="socks5">socks5</SelectItem>
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                        {proxy.proxyType && proxy.proxyType !== "close" ? (
                            <>
                                <Field label={t("settings.panel.proxyUrl")}>
                                    <Input
                                        value={proxy.proxyUrl}
                                        onChange={(event) => setProxy((p) => ({ ...p, proxyUrl: event.target.value }))}
                                        placeholder="127.0.0.1"
                                    />
                                </Field>
                                <Field label={t("settings.panel.proxyPort")}>
                                    <Input
                                        value={proxy.proxyPort}
                                        onChange={(event) => setProxy((p) => ({ ...p, proxyPort: event.target.value }))}
                                        placeholder="7890"
                                    />
                                </Field>
                                <Field label={t("settings.panel.proxyUser")}>
                                    <Input
                                        value={proxy.proxyUser}
                                        onChange={(event) => setProxy((p) => ({ ...p, proxyUser: event.target.value }))}
                                    />
                                </Field>
                                <Field label={t("settings.panel.proxyPasswd")}>
                                    <Input
                                        type="password"
                                        value={proxy.proxyPasswd}
                                        onChange={(event) => setProxy((p) => ({ ...p, proxyPasswd: event.target.value }))}
                                    />
                                </Field>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={proxy.proxyPasswdKeep === "Enable"}
                                        onCheckedChange={(checked) =>
                                            setProxy((p) => ({ ...p, proxyPasswdKeep: checked ? "Enable" : "Disable" }))
                                        }
                                    />
                                    {t("settings.panel.proxyKeep")}
                                </label>
                            </>
                        ) : null}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditKey(null)} disabled={savingProxy}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingProxy}>
                                {savingProxy ? <Spinner data-icon="inline-start" /> : null}
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
