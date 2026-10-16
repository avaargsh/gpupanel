import { useGetCoreSettingsQuery, useLazyGetUpgradeInfoQuery, useUpdateUpgradeMutation, type UpgradeInfo } from "@/api/settingsApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useConfirmAction } from "@/components/use-confirm-action";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SettingRow, errText } from "./shared";
import { StatusBadge } from "./status-badge";

export default function AboutTab() {
    const { t } = useTranslation();
    const { confirm, dialog } = useConfirmAction();
    const { data } = useGetCoreSettingsQuery();
    const [trigger, { isFetching }] = useLazyGetUpgradeInfoQuery();
    const [upgrade, { isLoading: upgrading }] = useUpdateUpgradeMutation();
    const [info, setInfo] = useState<UpgradeInfo | null>(null);

    const check = async () => {
        try {
            const res = await trigger().unwrap();
            setInfo(res);
            if (!res.latestVersion) toast.info(t("settings.about.upToDate"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doUpgrade = (version: string) => {
        confirm({
            title: t("settings.about.upgrade"),
            description: t("settings.about.upgradeConfirm", { version }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await upgrade({ version }).unwrap();
                    toast.success(t("settings.about.upgrading"));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const hasNew = !!info?.latestVersion && info.latestVersion !== data?.systemVersion;

    return (
        <Card>
            {dialog}
            <CardContent>
                {!data ? (
                    <Skeleton className="h-40 w-full" />
                ) : (
                    <>
                        <div className="py-3 pb-5 text-center">
                            <h3 className="mb-1 text-lg font-semibold">{data?.panelName || t("app.name")}</h3>
                            <span className="text-sm text-muted-foreground">{t("settings.about.slogan")}</span>
                        </div>
                        <SettingRow label={t("settings.about.version")} value={data?.systemVersion || "-"} />
                        <SettingRow
                            label={t("settings.about.edition")}
                            value={data?.edition === "intl" ? t("settings.about.intl") : t("settings.about.cn")}
                        />
                        <SettingRow
                            label={t("settings.about.checkUpdate")}
                            value={
                                info?.latestVersion ? (
                                    <span className="inline-flex items-center gap-2">
                                        {info.latestVersion}{" "}
                                        {hasNew ? (
                                            <StatusBadge tone="orange">{t("settings.about.new")}</StatusBadge>
                                        ) : (
                                            <StatusBadge tone="green">{t("settings.about.latest")}</StatusBadge>
                                        )}
                                    </span>
                                ) : (
                                    "-"
                                )
                            }
                            action={
                                <Button type="button" variant="outline" size="sm" disabled={isFetching} onClick={() => void check()}>
                                    {isFetching ? <Spinner data-icon="inline-start" /> : null}
                                    {t("settings.about.checkUpdate")}
                                </Button>
                            }
                        />
                        {hasNew ? (
                            <>
                                {info?.releaseNote ? (
                                    <div className="mt-3 whitespace-pre-wrap">
                                        <span className="font-medium">{t("settings.about.releaseNote")}</span>
                                        <div className="text-sm text-muted-foreground">{info.releaseNote}</div>
                                    </div>
                                ) : null}
                                <div className="mt-4">
                                    <Button type="button" disabled={upgrading} onClick={() => doUpgrade(info!.latestVersion)}>
                                        {upgrading ? <Spinner data-icon="inline-start" /> : null}
                                        {t("settings.about.upgrade")}
                                    </Button>
                                </div>
                            </>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
