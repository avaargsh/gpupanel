import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmAction } from "@/components/use-confirm-action";
import { SearchIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";

import { useCleanLogsMutation, useSearchOperationLogsQuery, type OperationLog } from "@/api/logsApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useAppSelector } from "@/store/hooks";
import { useTranslation } from "react-i18next";
import { LOG_SOURCES, formatDateTime, localizeOperationDetail, sourceLabel } from "./shared";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const STATUS_OPTIONS = [
    { labelKey: "logs.status.all", value: "" },
    { labelKey: "logs.status.success", value: "Success" },
    { labelKey: "logs.status.failed", value: "Failed" },
];

export default function OperationLogTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const language = useAppSelector((s) => s.ui.language);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const operation = useDebouncedValue(searchInput);
    const [status, setStatus] = useState("");
    const [source, setSource] = useState("");

    const { data, isFetching } = useSearchOperationLogsQuery({ page, pageSize, operation, status, source });
    const [cleanLogs, { isLoading: cleaning }] = useCleanLogsMutation();

    const rows = data?.items ?? [];

    const sourceOptions = useMemo(
        () => [
            { label: t("logs.status.all"), value: "" },
            ...LOG_SOURCES.map((item) => ({ label: t(`logs.source.${item.key}`), value: item.value })),
        ],
        [t],
    );

    const onClean = () => {
        confirm({
            title: t("logs.operation.clean"),
            description: t("logs.operation.cleanConfirm"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await cleanLogs({ logType: "operation" }).unwrap();
                    toast.success(t("logs.operation.cleaned"));
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
                                placeholder={t("logs.operation.searchPlaceholder")}
                                className="w-[220px]"
                                value={searchInput ?? ""}
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                        </div>
                        <NativeSelect
                            className="w-[180px]"
                            value={source ?? ""}
                            aria-label={t("logs.operation.resource")}
                            onChange={(event) =>
                                ((v) => {
                                    setSource(String(v));
                                    setPage(1);
                                })(event.target.value)
                            }
                        >
                            <NativeSelectOption value="">{t("logs.operation.resource")}</NativeSelectOption>
                            {sourceOptions.map((option) => (
                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <NativeSelect
                            className="w-[140px]"
                            value={status ?? ""}
                            aria-label={t("logs.operation.status")}
                            onChange={(event) =>
                                ((v) => {
                                    setStatus(String(v));
                                    setPage(1);
                                })(event.target.value)
                            }
                        >
                            <NativeSelectOption value="">{t("logs.operation.status")}</NativeSelectOption>
                            {STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value })).map((option) => (
                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <Button onClick={onClean} type="button" variant="destructive" disabled={cleaning}>
                            {cleaning ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                            {t("logs.operation.clean")}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("logs.operation.resource")}</TableHead>
                                    <TableHead>{t("logs.operation.user")}</TableHead>
                                    <TableHead>{t("logs.operation.detail")}</TableHead>
                                    <TableHead>{t("logs.operation.status")}</TableHead>
                                    <TableHead>{t("logs.operation.date")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={5}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("logs.operation.empty")}</span>}
                                                </EmptyDescription>
                                            </Empty>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={row["id"]}>
                                            <TableCell>{sourceLabel(t, row.source)}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-col">
                                                        <span>{row.user || "-"}</span>
                                                        {row.authMethod === "api_key" && row.apiKeyID ? (
                                                            <span className="text-muted-foreground">
                                                                API Key · {row.apiKeyName || row.apiKeyID}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                }
                                            </TableCell>
                                            <TableCell>
                                                {((_: unknown, row: OperationLog) => {
                                                    const raw = language === "en" ? row.detailEN : row.detailZH;
                                                    return localizeOperationDetail(t, raw || "") || row.message || "-";
                                                })(undefined, row)}
                                            </TableCell>
                                            <TableCell>
                                                {
                                                    <Badge
                                                        variant={
                                                            ["red"].includes(row.status === "Success" ? "green" : "red")
                                                                ? "destructive"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {row.status === "Success" ? t("logs.status.success") : t("logs.status.failed")}
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
