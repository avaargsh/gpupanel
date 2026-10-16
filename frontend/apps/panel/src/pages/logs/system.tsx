import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { localDateTime } from "../settings/date-input";
import { OptionPicker } from "../settings/option-picker";

import { useGetSystemLogStatusQuery, useListRunningServicesQuery, useReadSystemLogQuery, type SystemLogItem } from "@/api/logsApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { LOG_PRIORITIES, priorityColor, priorityLabel, startOfToday } from "./shared";

const PAGE_SIZES = [20, 50, 100, 200, 500];

export default function SystemLogTab() {
    const { t } = useTranslation();

    const [pageSize, setPageSize] = useState(100);
    const [searchInput, setSearchInput] = useState("");
    const keyword = useDebouncedValue(searchInput);
    const [priority, setPriority] = useState("");
    const [service, setService] = useState("");
    const [range, setRange] = useState<[Date, Date]>([startOfToday(), new Date()]);
    const [watching, setWatching] = useState(false);
    const [stack, setStack] = useState<string[]>([""]);
    const [idx, setIdx] = useState(0);
    const [selected, setSelected] = useState<SystemLogItem | null>(null);

    const cursor = stack[idx] ?? "";

    const { data: status } = useGetSystemLogStatusQuery();
    const { data: services = [] } = useListRunningServicesQuery();

    const { data, isFetching, refetch } = useReadSystemLogQuery({
        pageSize,
        cursor,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        keyword,
        priority,
        service,
    });

    // 记录游标历史：每页结果里的 nextCursor 存入下一页槽位。
    useEffect(() => {
        if (!data) return;
        setStack((prev) => {
            if (prev[idx + 1] === data.nextCursor) return prev;
            const next = prev.slice(0, idx + 1);
            next[idx + 1] = data.nextCursor;
            return next;
        });
    }, [data, idx]);

    // 过滤条件变化时回到第一页。
    useEffect(() => {
        setStack([""]);
        setIdx(0);
    }, [keyword, priority, service, pageSize, range]);

    // 「追踪」：每 3 秒自动刷新当前页。
    useEffect(() => {
        if (!watching) return;
        const timer = window.setInterval(() => refetch(), 3000);
        return () => window.clearInterval(timer);
    }, [watching, refetch]);

    const rows = data?.items ?? [];
    const hasMore = Boolean(data?.hasMore);

    const isFirst = idx === 0;
    const isLast = !hasMore;

    const keywordDisabled = Boolean(status && !status.keywordFilterSupported);

    return (
        <div className="flex flex-col gap-3">
            {status ? (
                <Card>
                    <CardContent>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={["red"].includes("green") ? "destructive" : "secondary"}>{status.source}</Badge>
                            {status.version ? (
                                <span className="text-muted-foreground">
                                    {t("logs.system.version")}: {status.version}
                                </span>
                            ) : null}
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {keywordDisabled && status?.message ? (
                <Alert>
                    <AlertDescription>{status.message}</AlertDescription>
                </Alert>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                    className="w-[180px]"
                    value={priority ?? ""}
                    aria-label={t("logs.system.priority")}
                    onChange={(event) => setPriority(event.target.value ? String(event.target.value) : "")}
                >
                    <NativeSelectOption value="">{t("logs.system.priority")}</NativeSelectOption>
                    {LOG_PRIORITIES.map((p) => ({ label: priorityLabel(t, p), value: p })).map((option) => (
                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <OptionPicker
                    value={String(service ?? "")}
                    options={services.map((s) => ({ label: s, value: s }))}
                    creatable
                    searchable
                    placeholder={t("logs.system.service")}
                    onValueChange={(v) => setService(v ? String(v) : "")}
                />
                <div className="flex flex-wrap gap-2">
                    {[0, 1].map((index) => (
                        <Input
                            key={index}
                            type="datetime-local"
                            aria-label={index === 0 ? t("logs.system.date") + " 1" : t("logs.system.date") + " 2"}
                            value={localDateTime(range[index])}
                            onChange={(event) => {
                                if (!event.target.value) return;
                                const next = [...range];
                                next[index] = new Date(event.target.value);
                                ((value) => {
                                    if (Array.isArray(value) && value[0] && value[1]) {
                                        setRange([value[0] as Date, value[1] as Date]);
                                    }
                                })(next);
                            }}
                        />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                    <Input
                        disabled={keywordDisabled}
                        placeholder={t("logs.system.filter")}
                        className="w-[200px]"
                        value={searchInput ?? ""}
                        onChange={(event) => setSearchInput(event.target.value)}
                    />
                </div>
                <label className="inline-flex items-center gap-1.5">
                    <Switch checked={watching} onCheckedChange={setWatching} />
                    <span>{t("logs.system.watch")}</span>
                </label>
                <Button onClick={() => refetch()} type="button" variant="outline">
                    {<RefreshCwIcon data-icon="inline-start" />}
                    {t("logs.system.refresh")}
                </Button>
            </div>

            <div className="flex flex-col gap-3">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t("logs.system.date")}</TableHead>
                            <TableHead>{t("logs.system.priority")}</TableHead>
                            <TableHead>{t("logs.system.service")}</TableHead>
                            <TableHead>{t("logs.system.message")}</TableHead>
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
                                            {<span className="text-muted-foreground">{t("logs.system.empty")}</span>}
                                        </EmptyDescription>
                                    </Empty>
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row, rowIndex) => (
                                <TableRow
                                    key={`${row?.time ?? ""}-${row?.priority ?? ""}-${row?.service ?? ""}-${row?.message ?? ""}`}
                                    {...{
                                        onClick: () => setSelected(row as SystemLogItem),
                                        style: { cursor: "pointer" },
                                    }}
                                    tabIndex={0}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            ({
                                                onClick: () => setSelected(row as SystemLogItem),
                                                style: { cursor: "pointer" },
                                            }).onClick?.();
                                        }
                                    }}
                                >
                                    <TableCell>{row["time"] || "-"}</TableCell>
                                    <TableCell>
                                        {
                                            <Badge variant={["red"].includes(priorityColor(row.priority)) ? "destructive" : "secondary"}>
                                                {priorityLabel(t, row.priority)}
                                            </Badge>
                                        }
                                    </TableCell>
                                    <TableCell>{row.service || "-"}</TableCell>
                                    <TableCell>{row["message"]}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                    className="w-[100px]"
                    value={String(pageSize) ?? ""}
                    aria-label={t("common.select")}
                    onChange={(event) => setPageSize(Number(event.target.value))}
                >
                    {PAGE_SIZES.map((s) => ({ label: String(s), value: String(s) })).map((option) => (
                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <Button onClick={() => setIdx((i) => Math.max(0, i - 1))} type="button" variant="outline" disabled={isFirst || isFetching}>
                    {t("logs.system.previous")}
                </Button>
                <Button onClick={() => setIdx((i) => i + 1)} type="button" variant="outline" disabled={isLast || isFetching}>
                    {t("logs.system.next")}
                </Button>
            </div>

            <Sheet
                open={Boolean(selected)}
                onOpenChange={(open) => {
                    if (!open && true) setSelected(null);
                }}
            >
                <SheetContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                    <div className="flex flex-col gap-4">
                        <SheetHeader>
                            <SheetTitle>{t("logs.system.detail")}</SheetTitle>
                        </SheetHeader>
                        <FieldGroup>
                            {selected ? (
                                <div className="flex flex-col gap-3">
                                    <span>
                                        <strong>{t("logs.system.date")}：</strong>
                                        {selected.time || "-"}
                                    </span>
                                    <span>
                                        <strong>{t("logs.system.priority")}：</strong>
                                        {priorityLabel(t, selected.priority)}
                                    </span>
                                    <span>
                                        <strong>{t("logs.system.service")}：</strong>
                                        {selected.service || "-"}
                                    </span>
                                    <span>
                                        <strong>{t("logs.system.message")}：</strong>
                                        {selected.message}
                                    </span>
                                    <pre className="log-output max-h-[60vh]">
                                        {selected.raw}
                                    </pre>
                                </div>
                            ) : (
                                <Empty>
                                    <EmptyDescription>{t("common.empty")}</EmptyDescription>
                                </Empty>
                            )}
                        </FieldGroup>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
