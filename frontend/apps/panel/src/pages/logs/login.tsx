import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmAction } from "@/components/use-confirm-action";
import { SearchIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";

import { useCleanLogsMutation, useSearchLoginLogsQuery, type LoginLog } from "@/api/logsApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "./shared";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const STATUS_OPTIONS = [
    { labelKey: "logs.status.all", value: "" },
    { labelKey: "logs.status.success", value: "Success" },
    { labelKey: "logs.status.failed", value: "Failed" },
];

export default function LoginLogTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [status, setStatus] = useState("");

    const { data, isFetching } = useSearchLoginLogsQuery({ page, pageSize, info, status });
    const [cleanLogs, { isLoading: cleaning }] = useCleanLogsMutation();

    const rows = data?.items ?? [];

    const messageText = (row: LoginLog) => {
        if (row.message === "ErrAuth") return t("logs.login.errorAuth");
        if (row.message === "ErrMFA") return t("logs.login.errorMfa");
        return row.message || "-";
    };

    const onClean = () => {
        confirm({
            title: t("logs.login.clean"),
            description: t("logs.login.cleanConfirm"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await cleanLogs({ logType: "login" }).unwrap();
                    toast.success(t("logs.login.cleaned"));
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
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("logs.login.searchPlaceholder")}
                                className="w-[220px]"
                                value={searchInput ?? ""}
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                        </div>
                        <NativeSelect
                            className="w-[140px]"
                            value={status ?? ""}
                            aria-label={t("logs.login.status")}
                            onChange={(event) =>
                                ((v) => {
                                    setStatus(String(v));
                                    setPage(1);
                                })(event.target.value)
                            }
                        >
                            <NativeSelectOption value="">{t("logs.login.status")}</NativeSelectOption>
                            {STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value })).map((option) => (
                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <Button onClick={onClean} type="button" variant="destructive" disabled={cleaning}>
                            {cleaning ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                            {t("logs.login.clean")}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("logs.login.ip")}</TableHead>
                                    <TableHead>{t("logs.login.user")}</TableHead>
                                    <TableHead>{t("logs.login.address")}</TableHead>
                                    <TableHead>{t("logs.login.agent")}</TableHead>
                                    <TableHead>{t("logs.login.status")}</TableHead>
                                    <TableHead>{t("logs.login.date")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("logs.login.empty")}</span>}
                                                </EmptyDescription>
                                            </Empty>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={row["id"]}>
                                            <TableCell>{row["ip"]}</TableCell>
                                            <TableCell>{row["user"] || "-"}</TableCell>
                                            <TableCell>{row["address"] || "-"}</TableCell>
                                            <TableCell>{row["agent"] || "-"}</TableCell>
                                            <TableCell>
                                                {
                                                    <Badge
                                                        variant={
                                                            ["red"].includes(row.status === "Success" ? "green" : "red")
                                                                ? "destructive"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {messageText(row)}
                                                    </Badge>
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
                </div>
            }
        </>
    );
}
