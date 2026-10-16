import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmAction } from "@/components/use-confirm-action";
import { PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";

import {
    useDeleteCronjobsMutation,
    useHandleCronjobMutation,
    useListCronjobGroupsQuery,
    useSearchCronjobsQuery,
    useUpdateCronjobStatusMutation,
    type CronjobInfo,
} from "@/api/cronjobApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { specToText } from "./helper";
import CronjobOperate from "./operate";
import CronjobRecords from "./records";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export default function CronjobTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [groupID, setGroupID] = useState<number | undefined>(undefined);
    const [selected, setSelected] = useState<number[]>([]);
    const [sheetTarget, setSheetTarget] = useState<CronjobInfo | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [recordsTarget, setRecordsTarget] = useState<CronjobInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<CronjobInfo[] | null>(null);
    const [cleanData, setCleanData] = useState(false);
    const [cleanRemoteData, setCleanRemoteData] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [info, groupID]);

    const { data: groups = [] } = useListCronjobGroupsQuery("cronjob");
    const { data, isFetching, refetch } = useSearchCronjobsQuery({
        page,
        pageSize,
        info,
        groupIDs: groupID ? [groupID] : [],
        orderBy: "createdAt",
        order: "descending",
    });
    const [deleteCronjobs, { isLoading: deleting }] = useDeleteCronjobsMutation();
    const [updateStatus] = useUpdateCronjobStatusMutation();
    const [handle] = useHandleCronjobMutation();

    const groupName = useMemo(() => {
        const map = new Map(groups.map((g) => [g.id, g.name]));
        return (id: number) => {
            const name = map.get(id);
            if (!name) return "-";
            return name === "Default" ? t("cronjob.operate.default") : name;
        };
    }, [groups, t]);

    if (recordsTarget) {
        return <CronjobRecords target={recordsTarget} onBack={() => setRecordsTarget(null)} />;
    }

    const rows = data?.items ?? [];

    const toggleStatus = async (row: CronjobInfo) => {
        try {
            await updateStatus({ id: row.id, status: row.status === "Enable" ? "Disable" : "Enable" }).unwrap();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onHandle = (row: CronjobInfo) => {
        confirm({
            title: t("cronjob.actions.handle"),
            description: t("cronjob.handleConfirm", { name: row.name }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await handle(row.id).unwrap();
                    toast.success(t("cronjob.saveSuccess"));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const batchStatus = async (status: string) => {
        try {
            await Promise.all(selected.map((id) => updateStatus({ id, status }).unwrap()));
            setSelected([]);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteCronjobs({ ids: deleteRows.map((r) => r.id), cleanData, cleanRemoteData }).unwrap();
            toast.success(t("cronjob.delete.success"));
            setDeleteRows(null);
            setSelected([]);
            setCleanData(false);
            setCleanRemoteData(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <>
            {confirmationDialog}
            {
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("cronjob.searchPlaceholder")}
                                style={{ width: 220 }}
                                value={searchInput ?? ""}
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                        </div>
                        <NativeSelect
                            style={{ width: 160 }}
                            value={groupID ?? ""}
                            aria-label={t("cronjob.groupFilter")}
                            onChange={(event) => setGroupID(event.target.value ? Number(event.target.value) : undefined)}
                        >
                            <NativeSelectOption value="">{t("cronjob.groupFilter")}</NativeSelectOption>
                            {groups
                                .map((g) => ({ label: g.name === "Default" ? t("cronjob.operate.default") : g.name, value: g.id }))
                                .map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                        <Button
                            onClick={() => {
                                setSheetTarget(null);
                                setSheetOpen(true);
                            }}
                            type="button"
                            variant="default"
                        >
                            {<PlusIcon data-icon="inline-start" />}
                            {t("cronjob.create")}
                        </Button>
                        <Button onClick={() => refetch()} type="button" variant="outline" disabled={isFetching}>
                            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t("cronjob.actions.refresh")}
                        </Button>
                    </div>

                    {selected.length > 0 && (
                        <div style={{ alignItems: "center" }} className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground">{t("cronjob.selected", { count: selected.length })}</span>
                            <Button onClick={() => batchStatus("Enable")} type="button" variant="ghost" size="sm">
                                {t("cronjob.batchEnable")}
                            </Button>
                            <Button onClick={() => batchStatus("Disable")} type="button" variant="ghost" size="sm">
                                {t("cronjob.batchDisable")}
                            </Button>
                            <Button
                                onClick={() => setDeleteRows(rows.filter((r) => selected.includes(r.id)))}
                                type="button"
                                variant="destructive"
                                size="sm"
                            >
                                {t("cronjob.batchDelete")}
                            </Button>
                        </div>
                    )}

                    <div className="flex flex-col gap-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <Checkbox
                                            aria-label={t("common.selectAll")}
                                            checked={rows.length > 0 && rows.every((row) => selected.includes(row["id"]))}
                                            onCheckedChange={(checked) =>
                                                setSelected(((checked ? rows.map((row) => row["id"]) : []) ?? []).map(Number))
                                            }
                                        />
                                    </TableHead>
                                    <TableHead>{t("cronjob.columns.name")}</TableHead>
                                    <TableHead>{t("cronjob.columns.group")}</TableHead>
                                    <TableHead>{t("cronjob.columns.status")}</TableHead>
                                    <TableHead>{t("cronjob.columns.spec")}</TableHead>
                                    <TableHead>{t("cronjob.columns.retainCopies")}</TableHead>
                                    <TableHead>{t("cronjob.columns.lastTime")}</TableHead>
                                    <TableHead>{t("cronjob.columns.lastStatus")}</TableHead>
                                    <TableHead>{t("cronjob.columns.operate")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={9}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("cronjob.empty")}</span>}
                                                </EmptyDescription>
                                            </Empty>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={row["id"]}>
                                            <TableCell onClick={(event) => event.stopPropagation()}>
                                                <Checkbox
                                                    aria-label={String(row["id"])}
                                                    checked={selected.includes(row["id"])}
                                                    onCheckedChange={(checked) =>
                                                        setSelected(
                                                            (
                                                                (checked
                                                                    ? [...selected, row["id"]]
                                                                    : selected.filter((selectedKey) => selectedKey !== row["id"])) ?? []
                                                            ).map(Number),
                                                        )
                                                    }
                                                />
                                            </TableCell>
                                            <TableCell>{row["name"]}</TableCell>
                                            <TableCell>{groupName(row.groupID)}</TableCell>
                                            <TableCell>
                                                {<Switch checked={row.status === "Enable"} onCheckedChange={() => toggleStatus(row)} />}
                                            </TableCell>
                                            <TableCell>{<span>{specToText(t, row.spec)}</span>}</TableCell>
                                            <TableCell>{"retainCopies" in row ? String(row.retainCopies ?? "-") : "-"}</TableCell>
                                            <TableCell>{row["lastRecordTime"]}</TableCell>
                                            <TableCell>
                                                {row["lastRecordStatus"] ? (
                                                    <Badge
                                                        variant={
                                                            ["red"].includes(
                                                                row["lastRecordStatus"] === "Success"
                                                                    ? "green"
                                                                    : row["lastRecordStatus"] === "Failed"
                                                                      ? "red"
                                                                      : "blue",
                                                            )
                                                                ? "destructive"
                                                                : "secondary"
                                                        }
                                                    >
                                                        {t("cronjob.status." + row["lastRecordStatus"], row["lastRecordStatus"])}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Button onClick={() => onHandle(row)} type="button" variant="ghost" size="sm">
                                                            {t("cronjob.actions.handle")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => setRecordsTarget(row)}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                        >
                                                            {t("cronjob.actions.records")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => {
                                                                setSheetTarget(row);
                                                                setSheetOpen(true);
                                                            }}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                        >
                                                            {t("cronjob.actions.edit")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => setDeleteRows([row])}
                                                            type="button"
                                                            variant="destructive"
                                                            size="sm"
                                                        >
                                                            {t("cronjob.actions.delete")}
                                                        </Button>
                                                    </div>
                                                }
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
                            onPageSizeChange={(size: number) => {
                                setPageSize(size);
                                setPage(1);
                            }}
                        />
                    </div>

                    {sheetOpen && <CronjobOperate target={sheetTarget} groups={groups} onClose={() => setSheetOpen(false)} />}

                    {deleteRows && (
                        <Dialog
                            open={true}
                            onOpenChange={(open) => {
                                if (!open && !deleting) setDeleteRows(null);
                            }}
                        >
                            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                                <form
                                    className="flex flex-col gap-4"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        if (!deleting) void doDelete();
                                    }}
                                >
                                    <DialogHeader>
                                        <DialogTitle>{t("cronjob.delete.title")}</DialogTitle>
                                    </DialogHeader>
                                    <FieldGroup>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                            <span>{t("cronjob.delete.content", { name: deleteRows.map((r) => r.name).join("、") })}</span>
                                            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                                <Switch checked={cleanData} onCheckedChange={setCleanData} />
                                                <span>{t("cronjob.delete.cleanData")}</span>
                                            </label>
                                            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                                <Switch checked={cleanRemoteData} onCheckedChange={setCleanRemoteData} />
                                                <span>{t("cronjob.delete.cleanRemoteData")}</span>
                                            </label>
                                        </div>
                                    </FieldGroup>
                                    <DialogFooter>
                                        <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteRows(null)}>
                                            {t("common.cancel")}
                                        </Button>
                                        <Button type="submit" disabled={deleting}>
                                            {deleting ? <Spinner data-icon="inline-start" /> : null}
                                            {t("common.confirm")}
                                        </Button>
                                    </DialogFooter>
                                </form>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            }
        </>
    );
}
