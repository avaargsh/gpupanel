import { useGetCoreSettingsQuery, useLazyGetUpgradeInfoQuery, useLazyGetUpgradeOperationQuery, useUpdateUpgradeMutation, type LifecycleOperationInfo, type UpgradeInfo } from "@/api/settingsApi";
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

const LAST_UPGRADE_OPERATION_ID = "gpupanel:lifecycle:upgrade:last-operation-id";
const LAST_UPGRADE_OPERATION_VERSION = "gpupanel:lifecycle:upgrade:last-operation-version";

function upgradeKeyStorageName(version: string): string {
    return "gpupanel:lifecycle:upgrade:idempotency:" + version;
}

function stableUpgradeIdempotencyKey(version: string): string {
    const storageKey = upgradeKeyStorageName(version);
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const random = new Uint8Array(16);
    window.crypto.getRandomValues(random);
    const key = Array.from(random, (value) => value.toString(16).padStart(2, "0")).join("");
    window.sessionStorage.setItem(storageKey, key);
    return key;
}

export default function AboutTab() {
    const { t } = useTranslation();
    const { confirm, dialog } = useConfirmAction();
    const { data } = useGetCoreSettingsQuery();
    const [trigger, { isFetching }] = useLazyGetUpgradeInfoQuery();
    const [upgrade, { isLoading: upgrading }] = useUpdateUpgradeMutation();
    const [readOperation, { isFetching: checkingOperation }] = useLazyGetUpgradeOperationQuery();
    const [info, setInfo] = useState<UpgradeInfo | null>(null);
    const [operation, setOperation] = useState<LifecycleOperationInfo | null>(null);
    const [operationId, setOperationId] = useState<string | null>(() =>
        typeof window === "undefined" ? null : window.sessionStorage.getItem(LAST_UPGRADE_OPERATION_ID),
    );
    const [operationVersion, setOperationVersion] = useState<string | null>(() =>
        typeof window === "undefined" ? null : window.sessionStorage.getItem(LAST_UPGRADE_OPERATION_VERSION),
    );

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
                    const idempotencyKey = stableUpgradeIdempotencyKey(version);
                    const result = await upgrade({ version, idempotencyKey }).unwrap();
                    setOperation(result);
                    setOperationId(result.operationId);
                    setOperationVersion(version);
                    window.sessionStorage.setItem(LAST_UPGRADE_OPERATION_ID, result.operationId);
                    window.sessionStorage.setItem(LAST_UPGRADE_OPERATION_VERSION, version);
                    toast.success(
                        t("settings.about.upgrading") + " · " + result.operationId + " · " + result.state,
                    );
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const checkOperation = async () => {
        if (!operationId) return;
        try {
            const result = await readOperation(operationId).unwrap();
            setOperation(result);
            setOperationVersion(operationVersion ?? result.state);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const startNewAttemptAfterNoMutation = () => {
        if (!operation || operation.state !== "failed_no_mutation" || !operationVersion) return;
        window.sessionStorage.removeItem(upgradeKeyStorageName(operationVersion));
        window.sessionStorage.removeItem(LAST_UPGRADE_OPERATION_ID);
        window.sessionStorage.removeItem(LAST_UPGRADE_OPERATION_VERSION);
        setOperation(null);
        setOperationId(null);
        setOperationVersion(null);
        toast.info(t("settings.about.retryAfterNoMutation", {
            defaultValue: "Previous operation made no changes. A new operation key is ready.",
        }));
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
                        {operationId ? (
                            <div className="mt-4 border-t pt-4">
                                <div className="mb-2 font-medium">System upgrade operation</div>
                                <div className="break-all text-sm text-muted-foreground">ID: {operationId}</div>
                                {operation ? (
                                    <div className="mt-2 text-sm">
                                        <div>State: <span className="font-medium">{operation.state}</span> · revision {operation.revision}</div>
                                        {operation.stage ? <div className="text-muted-foreground">Stage: {operation.stage}</div> : null}
                                        {operation.errorCode ? <div className="text-destructive">Reason: {operation.errorCode}</div> : null}
                                        {operation.artifactSha256 ? (
                                            <div className="break-all text-muted-foreground">Artifact SHA-256: {operation.artifactSha256}</div>
                                        ) : null}
                                    </div>
                                ) : null}
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" size="sm" disabled={checkingOperation} onClick={() => void checkOperation()}>
                                        {checkingOperation ? <Spinner data-icon="inline-start" /> : null}
                                        Check operation status
                                    </Button>
                                    {operation?.state === "failed_no_mutation" ? (
                                        <Button type="button" variant="outline" size="sm" onClick={startNewAttemptAfterNoMutation}>
                                            Start a new attempt
                                        </Button>
                                    ) : null}
                                </div>
                                {operation?.state === "unknown" || operation?.state === "recovery_required" ? (
                                    <p className="mt-2 text-sm text-muted-foreground">
                                        Outcome is not confirmed. The same request key will only read this operation; do not start another attempt until recovery is independently reconciled.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
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
