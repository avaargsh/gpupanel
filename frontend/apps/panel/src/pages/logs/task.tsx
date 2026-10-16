import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { TablePager } from "../settings/table-pager";

import { useLazyReadTaskLogQuery, useSearchTasksQuery, type TaskInfo } from "@/api/logsApi";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "./shared";

const STATUS_OPTIONS = [
    { labelKey: "logs.status.all", value: "" },
    { labelKey: "logs.status.success", value: "Success" },
    { labelKey: "logs.status.failed", value: "Failed" },
    { labelKey: "logs.task.running", value: "Executing" },
];

function statusColor(status: string): "green" | "red" | "blue" {
    if (status === "Success") return "green";
    if (status === "Failed") return "red";
    return "blue";
}

function statusText(t: TFunction, status: string): string {
    if (status === "Success") return t("logs.status.success");
    if (status === "Failed") return t("logs.status.failed");
    if (status === "Executing") return t("logs.task.running");
    return status || "-";
}

export default function TaskLogTab() {
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState("");
    const [target, setTarget] = useState<TaskInfo | null>(null);

    const { data, isFetching, refetch } = useSearchTasksQuery({ page, pageSize, type: "", status });
    const [loadLog, { data: logData, isFetching: logLoading }] = useLazyReadTaskLogQuery();

    const rows = data?.items ?? [];
    const running = rows.some((r) => r.status === "Executing");

    // 存在执行中的任务时，每 5 秒自动刷新列表。
    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => refetch(), 5000);
        return () => window.clearInterval(timer);
    }, [running, refetch]);

    const openLog = (row: TaskInfo) => {
        setTarget(row);
        loadLog({ taskID: row.id, page: 1, pageSize: 200 });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                    style={{ width: 160 }}
                    value={status ?? ""}
                    aria-label={t("logs.task.status")}
                    onChange={(event) =>
                        ((v) => {
                            setStatus(String(v));
                            setPage(1);
                        })(event.target.value)
                    }
                >
                    <NativeSelectOption value="">{t("logs.task.status")}</NativeSelectOption>
                    {STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value })).map((option) => (
                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>

            <div className="flex flex-col gap-3">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("logs.task.name")}</TableHead>
                            <TableHead>{t("logs.task.status")}</TableHead>
                            <TableHead>{t("logs.task.log")}</TableHead>
                            <TableHead>{t("logs.task.date")}</TableHead>
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
                                            {<span className="text-muted-foreground">{t("logs.task.empty")}</span>}
                                        </EmptyDescription>
                                    </Empty>
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row, rowIndex) => (
                                <TableRow key={row["id"]}>
                                    <TableCell>{row["name"] || "-"}</TableCell>
                                    <TableCell>
                                        {
                                            <Badge variant={["red"].includes(statusColor(row.status)) ? "destructive" : "secondary"}>
                                                {statusText(t, row.status)}
                                            </Badge>
                                        }
                                    </TableCell>
                                    <TableCell>
                                        {
                                            <Button onClick={() => openLog(row)} type="button" variant="ghost" size="sm">
                                                {t("logs.task.view")}
                                            </Button>
                                        }
                                    </TableCell>
                                    <TableCell>{formatDateTime(row.createdAt)}</TableCell>
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
                    onPageSizeChange={(size: number) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                />
            </div>

            <Sheet
                open={Boolean(target)}
                onOpenChange={(open) => {
                    if (!open && true) setTarget(null);
                }}
            >
                <SheetContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                    <div className="flex flex-col gap-4">
                        <SheetHeader>
                            <SheetTitle>{t("logs.task.logTitle")}</SheetTitle>
                        </SheetHeader>
                        <FieldGroup>
                            {logLoading ? (
                                <span className="text-muted-foreground">{t("common.loading")}</span>
                            ) : logData && logData.lines.length > 0 ? (
                                <pre
                                    style={{
                                        margin: 0,
                                        maxHeight: "70vh",
                                        overflow: "auto",
                                        padding: 12,
                                        fontSize: 12,
                                        lineHeight: 1.6,
                                        color: "#e8eaf0",
                                        background: "#14151a",
                                        borderRadius: 8,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-all",
                                    }}
                                >
                                    {logData.lines.join("\n")}
                                </pre>
                            ) : (
                                <Empty>
                                    <EmptyDescription>{t("logs.task.logEmpty")}</EmptyDescription>
                                </Empty>
                            )}
                        </FieldGroup>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
