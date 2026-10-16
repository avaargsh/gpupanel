import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConfirmAction } from "@/components/use-confirm-action";
import { SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";

import { useCleanSSHLogsMutation, useSearchSSHLogsQuery } from "@/api/logsApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { authModeLabel, formatDateTime } from "./shared";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const STATUS_OPTIONS = [
    { labelKey: "logs.status.all", value: "All" },
    { labelKey: "logs.status.success", value: "Success" },
    { labelKey: "logs.status.failed", value: "Failed" },
];

export default function SSHLogTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [status, setStatus] = useState("All");

    const { data, isFetching } = useSearchSSHLogsQuery({ page, pageSize, info, status });
    const [cleanSSHLogs, { isLoading: cleaning }] = useCleanSSHLogsMutation();

    const rows = data?.items ?? [];

    const onClean = () => {
        confirm({
            title: t("logs.ssh.clean"),
            description: t("logs.ssh.cleanConfirm"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await cleanSSHLogs().unwrap();
                    toast.success(t("logs.ssh.cleaned"));
                    setPage(1);
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
                <div className="flex flex-col gap-3">
                    <Alert>
                        <AlertDescription>{t("logs.ssh.alert")}</AlertDescription>
                    </Alert>
                    <Alert>
                        <AlertDescription>{t("logs.ssh.alert2")}</AlertDescription>
                    </Alert>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("logs.ssh.searchPlaceholder")}
                                className="w-[220px]"
                                value={searchInput ?? ""}
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                        </div>
                        <NativeSelect
                            className="w-[140px]"
                            value={status ?? ""}
                            aria-label={t("logs.ssh.status")}
                            onChange={(event) =>
                                ((v) => {
                                    setStatus(String(v));
                                    setPage(1);
                                })(event.target.value)
                            }
                        >
                            <NativeSelectOption value="">{t("logs.ssh.status")}</NativeSelectOption>
                            {STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value })).map((option) => (
                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <Button onClick={onClean} type="button" variant="destructive" disabled={cleaning}>
                            {cleaning ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                            {t("logs.ssh.clean")}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("logs.ssh.ip")}</TableHead>
                                    <TableHead>{t("logs.ssh.area")}</TableHead>
                                    <TableHead>{t("logs.ssh.port")}</TableHead>
                                    <TableHead>{t("logs.ssh.authMode")}</TableHead>
                                    <TableHead>{t("logs.ssh.user")}</TableHead>
                                    <TableHead>{t("logs.ssh.status")}</TableHead>
                                    <TableHead>{t("logs.ssh.date")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={7}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("logs.ssh.empty")}</span>}
                                                </EmptyDescription>
                                            </Empty>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={`${row?.date ?? ""}-${row?.address ?? ""}-${row?.user ?? ""}-${row?.status ?? ""}`}>
                                            <TableCell>{row["address"] || "-"}</TableCell>
                                            <TableCell>{row["area"] || "-"}</TableCell>
                                            <TableCell>{row["port"] || "-"}</TableCell>
                                            <TableCell>{authModeLabel(t, row.authMode)}</TableCell>
                                            <TableCell>{row["user"] || "-"}</TableCell>
                                            <TableCell>
                                                {row.status === "Success" ? (
                                                    <Badge variant={["red"].includes("green") ? "destructive" : "secondary"}>
                                                        {t("logs.status.success")}
                                                    </Badge>
                                                ) : (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span tabIndex={0}>
                                                                <Badge variant={["red"].includes("red") ? "destructive" : "secondary"}>
                                                                    {t("logs.status.failed")}
                                                                </Badge>
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>{row.message || ""}</TooltipContent>
                                                    </Tooltip>
                                                )}
                                            </TableCell>
                                            <TableCell>{formatDateTime(row.date || row.dateStr)}</TableCell>
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
                </div>
            }
        </>
    );
}
