import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmAction } from "@/components/use-confirm-action";
import { FileIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HostnameModal, NtpModal, PasswdModal, TimeZoneModal } from "./device-identity";
import { DeviceConfigModal, DnsModal, HostsModal } from "./device-network";

import { useGetDeviceBaseQuery, useUpdateDeviceMutation, useUpdateDeviceSwapMutation, type DeviceBaseInfo } from "@/api/toolboxApi";
import { formatBytes } from "@/utils/format";
import { useTranslation } from "react-i18next";
import { SettingRow, errText } from "./shared";

type ModalKind = "dns" | "hosts" | "swap" | "hostname" | "passwd" | "ntp" | "timezone" | null;

function SwapModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [updateSwap, { isLoading: savingSwap }] = useUpdateDeviceSwapMutation();
    const [sizes, setSizes] = useState<Record<string, number>>(() => {
        const m: Record<string, number> = {};
        (base.swapDetails || []).forEach((d) => {
            m[d.path] = Math.round(((Number(d.size) || 0) / 1024) * 100) / 100;
        });
        return m;
    });

    const saveRow = async (row: DeviceBaseInfo["swapDetails"][number]) => {
        if (savingSwap) return;
        const kb = Math.round((sizes[row.path] ?? 0) * 1024);
        if (!Number.isFinite(kb) || kb < 0) return toast.error(t("toolbox.device.swapMin"));
        if (kb !== 0 && kb < 40) {
            toast.error(t("toolbox.device.swapMin"));
            return;
        }
        if (base.maxSize > 0 && kb * 1024 > base.maxSize) {
            toast.error(t("toolbox.device.swapMax", { max: formatBytes(base.maxSize) }));
            return;
        }
        try {
            await updateSwap({ path: row.path, size: kb, used: Number(row.used) || 0, isNew: row.isNew, taskID: row.taskID }).unwrap();
            toast.success(t("toolbox.device.saved"));
            onSaved();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && true) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <div className="flex flex-col gap-4">
                    <DialogHeader>
                        <DialogTitle>{t("toolbox.device.swap")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
                            <span>
                                {t("toolbox.device.swapTotal")}: <strong>{formatBytes(base.swapMemoryTotal)}</strong>
                            </span>
                            <span>
                                {t("toolbox.device.swapUsed")}: <strong>{formatBytes(base.swapMemoryUsed)}</strong>
                            </span>
                            <span>
                                {t("toolbox.device.swapAvailable")}: <strong>{formatBytes(base.swapMemoryAvailable)}</strong>
                            </span>
                        </div>
                        <span className="text-muted-foreground">{t("toolbox.device.swapHelper")}</span>
                        <div className="flex flex-col gap-3">
                            <Table style={{ marginTop: 12 }}>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("toolbox.device.swapPath")}</TableHead>
                                        <TableHead>{t("toolbox.device.swapSize")}</TableHead>
                                        <TableHead>{t("toolbox.device.swapUsed")}</TableHead>
                                        <TableHead>{""}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(base.swapDetails ?? []).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4}>
                                                <Empty>
                                                    <EmptyDescription>{t("common.empty")}</EmptyDescription>
                                                </Empty>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        (base.swapDetails ?? []).map((row, rowIndex) => (
                                            <TableRow key={row["path"]}>
                                                <TableCell>{row["path"]}</TableCell>
                                                <TableCell>
                                                    {
                                                        <div className="flex items-center gap-2">
                                                            <Input
                                                                type={"number"}
                                                                value={String(sizes[row.path] ?? 0) ?? ""}
                                                                onChange={(event) =>
                                                                    setSizes((prev) => ({
                                                                        ...prev,
                                                                        [row.path]: Number(event.target.value) || 0,
                                                                    }))
                                                                }
                                                            />
                                                            <span className="shrink-0 text-muted-foreground">{"MB"}</span>
                                                        </div>
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    {row.used === "-" || row.used === undefined ? (
                                                        <span className="text-muted-foreground">-</span>
                                                    ) : (
                                                        <span>{formatBytes(Number(row.used) * 1024)}</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {
                                                        <Button
                                                            onClick={() => saveRow(row)}
                                                            disabled={savingSwap}
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                        >
                                                            {t("toolbox.actions.save")}
                                                        </Button>
                                                    }
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <span style={{ display: "block", marginTop: 8 }} className="text-muted-foreground">
                            {t("toolbox.device.swapOff")}
                        </span>
                    </FieldGroup>
                    {null}
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default function DeviceTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const { data, isFetching, refetch } = useGetDeviceBaseQuery();
    const [modal, setModal] = useState<ModalKind>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const [updateDevice] = useUpdateDeviceMutation();

    const onSaved = () => {
        setModal(null);
        refetch();
    };

    if (!data) {
        return (
            <div style={{ padding: 24 }}>
                <span className="text-muted-foreground">{isFetching ? t("toolbox.device.loading") : t("common.empty")}</span>
            </div>
        );
    }

    const dnsText = (data.dns || []).join(", ") || "-";
    const hostsText = (data.hosts || []).map((h) => `${h.ip} ${h.host}`).join("; ") || "-";
    const setLabel = t("toolbox.actions.set");

    const syncTime = () => {
        confirm({
            title: t("toolbox.device.syncTime"),
            description: t("toolbox.device.syncTimeConfirm", { site: data.ntp || "-" }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await updateDevice({ key: "LocalTime", value: "" }).unwrap();
                    toast.success(t("toolbox.device.saved"));
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    return (
        <>
            {confirmationDialog}
            {
                <div style={{ maxWidth: 960 }}>
                    <Button onClick={() => refetch()} style={{ marginBottom: 8 }} type="button" variant="outline" disabled={isFetching}>
                        {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                        {t("toolbox.actions.refresh")}
                    </Button>
                    <Button onClick={() => setConfigOpen(true)} style={{ marginBottom: 8, marginLeft: 8 }} type="button" variant="outline">
                        {<FileIcon data-icon="inline-start" />}
                        {t("toolbox.config.title")}
                    </Button>
                    <SettingRow label="DNS" value={<span>{dnsText}</span>} setLabel={setLabel} onSet={() => setModal("dns")} />
                    <SettingRow label="Hosts" value={<span>{hostsText}</span>} setLabel={setLabel} onSet={() => setModal("hosts")} />
                    <SettingRow
                        label="Swap"
                        value={<span>{formatBytes(data.swapMemoryTotal)}</span>}
                        setLabel={setLabel}
                        onSet={() => setModal("swap")}
                    />
                    <SettingRow
                        label={t("toolbox.device.hostname")}
                        value={<span>{data.hostname}</span>}
                        setLabel={setLabel}
                        onSet={() => setModal("hostname")}
                    />
                    <SettingRow
                        label={t("toolbox.device.passwd")}
                        value={<Badge variant={"secondary"}>{data.user}</Badge>}
                        setLabel={setLabel}
                        onSet={() => setModal("passwd")}
                    />
                    <SettingRow
                        label={t("toolbox.device.syncSite")}
                        value={<span>{data.ntp || "-"}</span>}
                        setLabel={setLabel}
                        onSet={() => setModal("ntp")}
                    />
                    <SettingRow
                        label={t("toolbox.device.timeZone")}
                        value={<span>{data.timeZone}</span>}
                        setLabel={setLabel}
                        onSet={() => setModal("timezone")}
                    />
                    <SettingRow
                        label={t("toolbox.device.localTime")}
                        value={<span>{data.localTime}</span>}
                        setLabel={t("toolbox.device.syncTime")}
                        onSet={syncTime}
                    />

                    {modal === "dns" && <DnsModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {modal === "hosts" && <HostsModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {modal === "swap" && <SwapModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {modal === "hostname" && <HostnameModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {modal === "passwd" && <PasswdModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {modal === "ntp" && <NtpModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {modal === "timezone" && <TimeZoneModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
                    {configOpen && <DeviceConfigModal onClose={() => setConfigOpen(false)} />}
                </div>
            }
        </>
    );
}
