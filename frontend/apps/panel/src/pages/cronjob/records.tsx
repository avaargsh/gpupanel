import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";

import {
    useCleanRecordsMutation,
    useHandleCronjobMutation,
    useLoadRecordLogQuery,
    useSearchRecordsQuery,
    useStopCronjobMutation,
    useUpdateCronjobStatusMutation,
    type CronjobInfo,
    type CronjobRecord,
} from "@/api/cronjobApi";
import { useTranslation } from "react-i18next";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const statusColor = (status: string) => {
    switch (status) {
        case "Success":
            return "green";
        case "Failed":
            return "red";
        case "Running":
            return "blue";
        case "Waiting":
            return "orange";
        default:
            return "grey";
    }
};

interface Props {
    target: CronjobInfo;
    onBack: () => void;
}

export default function CronjobRecords({ target, onBack }: Props) {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState("");
    const [current, setCurrent] = useState<CronjobRecord | null>(null);

    const { data, isFetching, refetch } = useSearchRecordsQuery({ page, pageSize, cronjobID: target.id, status });
    const { data: log, isFetching: logLoading } = useLoadRecordLogQuery(current?.id as number, { skip: !current });
    const [handle] = useHandleCronjobMutation();
    const [stop] = useStopCronjobMutation();
    const [updateStatus] = useUpdateCronjobStatusMutation();
    const [clean] = useCleanRecordsMutation();

    const rows = data?.items ?? [];

    const onHandle = () =>
        confirm({
            title: t("cronjob.actions.handle"),
            description: t("cronjob.handleConfirm", { name: target.name }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await handle(target.id).unwrap();
                    toast.success(t("cronjob.saveSuccess"));
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });

    const onClean = () =>
        confirm({
            title: t("cronjob.actions.clean"),
            description: t("cronjob.records.cleanConfirm", { name: target.name }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await clean({ cronjobID: target.id, cleanData: false, cleanRemoteData: false }).unwrap();
                    toast.success(t("cronjob.records.cleanSuccess"));
                    setCurrent(null);
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });

    const onStop = async (row: CronjobRecord) => {
        try {
            await stop(row.cronjobID ?? target.id).unwrap();
            toast.success(t("cronjob.saveSuccess"));
            refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <>
            {confirmationDialog}
            {
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ alignItems: "center" }} className="flex flex-wrap items-center gap-2">
                        <Button onClick={onBack} type="button" variant="ghost">
                            {<ArrowLeftIcon data-icon="inline-start" />}
                            {t("cronjob.actions.back")}
                        </Button>
                        <h2 style={{ margin: 0 }}>{target.name}</h2>
                        <Badge variant={["red"].includes(target.status === "Enable" ? "green" : "grey") ? "destructive" : "secondary"}>
                            {t("cronjob.status." + target.status, target.status)}
                        </Badge>
                        <Button onClick={onHandle} type="button" variant="ghost" size="sm">
                            {t("cronjob.actions.handle")}
                        </Button>
                        <Button
                            onClick={() => updateStatus({ id: target.id, status: target.status === "Enable" ? "Disable" : "Enable" })}
                            type="button"
                            variant="ghost"
                            size="sm"
                        >
                            {target.status === "Enable" ? t("cronjob.actions.disable") : t("cronjob.actions.enable")}
                        </Button>
                        <Button onClick={onClean} type="button" variant="destructive" size="sm">
                            {t("cronjob.actions.clean")}
                        </Button>
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ flex: "1 1 60%", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                            <div className="flex flex-wrap items-center gap-2">
                                <NativeSelect
                                    style={{ width: 160 }}
                                    value={(status || undefined) ?? ""}
                                    aria-label={t("cronjob.records.statusFilter")}
                                    onChange={(event) =>
                                        ((v) => {
                                            setStatus(v ? String(v) : "");
                                            setPage(1);
                                        })(event.target.value)
                                    }
                                >
                                    <NativeSelectOption value="">{t("cronjob.records.statusFilter")}</NativeSelectOption>
                                    {["Success", "Failed", "Running", "Waiting"]
                                        .map((s) => ({ label: t("cronjob.status." + s), value: s }))
                                        .map((option) => (
                                            <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                {option.label}
                                            </NativeSelectOption>
                                        ))}
                                </NativeSelect>
                                <Button onClick={() => refetch()} type="button" variant="outline" disabled={isFetching}>
                                    {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                                    {t("cronjob.actions.refresh")}
                                </Button>
                            </div>
                            <div className="flex flex-col gap-3">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t("cronjob.records.startTime")}</TableHead>
                                            <TableHead>{t("cronjob.records.status")}</TableHead>
                                            <TableHead>{t("cronjob.records.interval")}</TableHead>
                                            <TableHead>{t("cronjob.columns.operate")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isFetching ? (
                                            <TableRow>
                                                <TableCell colSpan={4}>
                                                    <Spinner className="mx-auto" />
                                                </TableCell>
                                            </TableRow>
                                        ) : rows.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4}>
                                                    <Empty>
                                                        <EmptyDescription>
                                                            {<span className="text-muted-foreground">{t("cronjob.records.empty")}</span>}
                                                        </EmptyDescription>
                                                    </Empty>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            rows.map((row, rowIndex) => (
                                                <TableRow
                                                    key={row["id"]}
                                                    {...{ onClick: () => setCurrent(row as CronjobRecord) }}
                                                    tabIndex={0}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            ({ onClick: () => setCurrent(row as CronjobRecord) }).onClick?.();
                                                        }
                                                    }}
                                                >
                                                    <TableCell>{row["startTime"]}</TableCell>
                                                    <TableCell>
                                                        {
                                                            <Badge
                                                                variant={
                                                                    ["red"].includes(statusColor(row["status"]))
                                                                        ? "destructive"
                                                                        : "secondary"
                                                                }
                                                            >
                                                                {t("cronjob.status." + row["status"], row["status"])}
                                                            </Badge>
                                                        }
                                                    </TableCell>
                                                    <TableCell>{`${row["interval"] ?? 0}s`}</TableCell>
                                                    <TableCell>
                                                        {["Running", "Waiting"].includes(row.status) ? (
                                                            <Button onClick={() => onStop(row)} type="button" variant="ghost" size="sm">
                                                                {t("cronjob.actions.stop")}
                                                            </Button>
                                                        ) : null}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                                <TablePager
                                    page={page}
                                    pageSize={pageSize}
                                    total={data?.total ?? 0}
                                    onPageChange={setPage}
                                    onPageSizeChange={setPageSize}
                                />
                            </div>
                        </div>

                        <div style={{ flex: "1 1 40%", minWidth: 0, border: "1px solid var(--border)", borderRadius: 6, padding: 12 }}>
                            {!current ? (
                                <span className="text-muted-foreground">{t("cronjob.records.selectHint")}</span>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <strong>{t("cronjob.records.detail")}</strong>
                                    <span>{`${t("cronjob.records.startTime")}: ${current.startTime}`}</span>
                                    <span>{`${t("cronjob.records.status")}: ${t("cronjob.status." + current.status, current.status)}`}</span>
                                    <span>{`${t("cronjob.records.interval")}: ${current.interval ?? 0}s`}</span>
                                    {current.targetPath && <span>{`${t("cronjob.records.targetPath")}: ${current.targetPath}`}</span>}
                                    <span>{`${t("cronjob.records.message")}: ${current.message || "-"}`}</span>
                                    <strong>{t("cronjob.records.log")}</strong>
                                    {logLoading ? (
                                        <span className="text-muted-foreground">{t("common.loading")}</span>
                                    ) : (
                                        <pre
                                            style={{
                                                margin: 0,
                                                maxHeight: 360,
                                                overflow: "auto",
                                                background: "var(--muted)",
                                                padding: 8,
                                                borderRadius: 4,
                                                fontSize: 12,
                                                whiteSpace: "pre-wrap",
                                            }}
                                        >
                                            {log || t("cronjob.records.logEmpty")}
                                        </pre>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            }
        </>
    );
}
