import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConfirmAction } from "@/components/use-confirm-action";
import { FileIcon, PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";
import { ClamFormModal } from "./clam-form";
import { ClamRecordSheet } from "./clam-records";

import {
    useDeleteClamMutation,
    useGetClamBaseQuery,
    useHandleClamScanMutation,
    useLazySearchClamFileQuery,
    useSearchClamQuery,
    useUpdateClamBaseInfoMutation,
    useUpdateClamFileMutation,
    useUpdateClamStatusMutation,
    type ClamInfo,
} from "@/api/toolboxApi";
import { specToText } from "@/pages/cronjob/helper";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { ConfigEditorModal, errText } from "./shared";

/** ClamAV / FreshClam 原始配置文件与日志（旧版为 CodeMirror + 日志页签）。 */
function ClamConfigModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [loadFile] = useLazySearchClamFileQuery();
    const [updateFile] = useUpdateClamFileMutation();
    return (
        <ConfigEditorModal
            title={t("toolbox.config.clam")}
            onClose={onClose}
            tabs={[
                {
                    key: "clamd",
                    label: "clamd.conf",
                    load: () => loadFile({ name: "clamd", tail: "200" }).unwrap(),
                    save: (file) => updateFile({ name: "clamd", file }).unwrap(),
                },
                {
                    key: "freshclam",
                    label: "freshclam.conf",
                    load: () => loadFile({ name: "freshclam", tail: "200" }).unwrap(),
                    save: (file) => updateFile({ name: "freshclam", file }).unwrap(),
                },
                {
                    key: "clamd-log",
                    label: t("toolbox.config.clamdLog"),
                    readOnly: true,
                    load: () => loadFile({ name: "clamd-log", tail: "200" }).unwrap(),
                },
                {
                    key: "freshclam-log",
                    label: t("toolbox.config.freshclamLog"),
                    load: () => loadFile({ name: "freshclam-log", tail: "200" }).unwrap(),
                    readOnly: true,
                },
            ]}
        />
    );
}

export default function ClamTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const { data: base, isFetching: baseFetching, refetch: refetchBase } = useGetClamBaseQuery();
    const [operateBase] = useUpdateClamBaseInfoMutation();
    const [handleScan] = useHandleClamScanMutation();
    const [updateStatus] = useUpdateClamStatusMutation();
    const [deleteClam, { isLoading: deleting }] = useDeleteClamMutation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);
    const [formTarget, setFormTarget] = useState<ClamInfo | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [recordTarget, setRecordTarget] = useState<ClamInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<ClamInfo[] | null>(null);
    const [removeInfected, setRemoveInfected] = useState(false);
    const [confOpen, setConfOpen] = useState(false);

    const { data, isFetching, refetch } = useSearchClamQuery({ page, pageSize, info });

    if (!base) {
        return (
            <div style={{ padding: 24 }}>
                <span className="text-muted-foreground">{baseFetching ? t("common.loading") : t("common.empty")}</span>
            </div>
        );
    }

    if (!base.isExist) {
        return (
            <div style={{ padding: 24 }}>
                <span className="text-muted-foreground">{t("toolbox.clam.notInstalled")}</span>
            </div>
        );
    }

    const onOperateBase = (service: "ClamAV" | "FreshClam", op: "start" | "stop" | "restart") => {
        const operation = service === "FreshClam" ? `fresh-${op}` : op;
        confirm({
            title: `${service} ${op}`,
            description: t("toolbox.fail2ban.operationConfirm", { op: `${service} ${op}` }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await operateBase({ operation }).unwrap();
                    toast.success(t("toolbox.clam.statusChanged"));
                    refetchBase();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const toggleStatus = async (row: ClamInfo) => {
        try {
            await updateStatus({ id: row.id, status: row.status === "Enable" ? "Disable" : "Enable" }).unwrap();
            toast.success(t("toolbox.clam.statusChanged"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onRun = async (row: ClamInfo) => {
        try {
            await handleScan(row.id).unwrap();
            toast.success(t("toolbox.clam.started"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteClam({ ids: deleteRows.map((r) => r.id), removeInfected }).unwrap();
            toast.success(t("toolbox.clam.deleted"));
            setDeleteRows(null);
            setSelected([]);
            setRemoveInfected(false);
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
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Badge variant={["red"].includes("green") ? "destructive" : "secondary"}>ClamAV</Badge>
                        <Badge variant={["red"].includes(base.isActive ? "green" : "grey") ? "destructive" : "secondary"}>
                            {base.isActive ? t("toolbox.actions.enable") : t("toolbox.actions.disable")}
                        </Badge>
                        <Badge variant={"secondary"}>
                            {t("toolbox.clam.version")}: {base.version}
                        </Badge>
                        <Button onClick={() => onOperateBase("ClamAV", base.isActive ? "stop" : "start")} type="button" variant="ghost">
                            {base.isActive ? t("toolbox.actions.stop") : t("toolbox.actions.start")}
                        </Button>
                        <Button onClick={() => onOperateBase("ClamAV", "restart")} type="button" variant="ghost">
                            {t("toolbox.actions.restart")}
                        </Button>
                        <Button onClick={() => refetchBase()} type="button" variant="ghost" disabled={baseFetching}>
                            {baseFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t("toolbox.actions.refresh")}
                        </Button>
                    </div>

                    {base.freshIsExist && (
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <Badge variant={["red"].includes("blue") ? "destructive" : "secondary"}>FreshClam</Badge>
                            <Badge variant={["red"].includes(base.freshIsActive ? "green" : "grey") ? "destructive" : "secondary"}>
                                {base.freshIsActive ? t("toolbox.actions.enable") : t("toolbox.actions.disable")}
                            </Badge>
                            <Badge variant={"secondary"}>
                                {t("toolbox.clam.version")}: {base.freshVersion}
                            </Badge>
                            <Button
                                onClick={() => onOperateBase("FreshClam", base.freshIsActive ? "stop" : "start")}
                                type="button"
                                variant="ghost"
                            >
                                {base.freshIsActive ? t("toolbox.actions.stop") : t("toolbox.actions.start")}
                            </Button>
                            <Button onClick={() => onOperateBase("FreshClam", "restart")} type="button" variant="ghost">
                                {t("toolbox.actions.restart")}
                            </Button>
                        </div>
                    )}

                    {!base.isActive && <span className="text-muted-foreground">{t("toolbox.clam.notStart")}</span>}

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("toolbox.clam.searchPlaceholder")}
                                style={{ width: 220 }}
                                value={searchInput ?? ""}
                                onChange={(event) =>
                                    ((v) => {
                                        setSearchInput(v);
                                        setPage(1);
                                    })(event.target.value)
                                }
                            />
                        </div>
                        <Button
                            onClick={() => {
                                setFormTarget(null);
                                setFormOpen(true);
                            }}
                            type="button"
                            variant="default"
                            disabled={!base.isActive}
                        >
                            {<PlusIcon data-icon="inline-start" />}
                            {t("toolbox.clam.create")}
                        </Button>
                        <Button
                            onClick={() => setDeleteRows((data?.items ?? []).filter((r) => selected.includes(r.id)))}
                            type="button"
                            variant="destructive"
                            disabled={selected.length === 0}
                        >
                            {t("toolbox.actions.delete")}
                        </Button>
                        <Button onClick={() => refetch()} type="button" variant="ghost" disabled={isFetching}>
                            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t("toolbox.actions.refresh")}
                        </Button>
                        <Button onClick={() => setConfOpen(true)} type="button" variant="ghost">
                            {<FileIcon data-icon="inline-start" />}
                            {t("toolbox.config.title")}
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        <Checkbox
                                            aria-label={t("common.selectAll")}
                                            checked={
                                                (data?.items ?? []).length > 0 &&
                                                (data?.items ?? []).every((row) => selected.includes(row["id"]))
                                            }
                                            onCheckedChange={(checked) =>
                                                setSelected(
                                                    ((checked ? (data?.items ?? []).map((row) => row["id"]) : []) ?? []).map(Number),
                                                )
                                            }
                                        />
                                    </TableHead>
                                    <TableHead>{t("toolbox.clam.name")}</TableHead>
                                    <TableHead>{t("toolbox.clam.scanDir")}</TableHead>
                                    <TableHead>{t("toolbox.clam.status")}</TableHead>
                                    <TableHead>{t("toolbox.clam.spec")}</TableHead>
                                    <TableHead>{t("toolbox.clam.lastTime")}</TableHead>
                                    <TableHead>{t("toolbox.clam.description")}</TableHead>
                                    <TableHead>{""}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={8}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : (data?.items ?? []).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("toolbox.clam.empty")}</span>}
                                                </EmptyDescription>
                                            </Empty>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    (data?.items ?? []).map((row, rowIndex) => (
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
                                            <TableCell>
                                                {
                                                    <Button onClick={() => setRecordTarget(row)} type="button" variant="ghost">
                                                        {row["name"]}
                                                    </Button>
                                                }
                                            </TableCell>
                                            <TableCell>{row["path"]}</TableCell>
                                            <TableCell>
                                                {<Switch checked={row.status === "Enable"} onCheckedChange={() => toggleStatus(row)} />}
                                            </TableCell>
                                            <TableCell>{<span>{row.spec ? specToText(t, row.spec) : "-"}</span>}</TableCell>
                                            <TableCell>{<span>{row.lastRecordTime || "-"}</span>}</TableCell>
                                            <TableCell>{row["description"]}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Button
                                                            onClick={() => onRun(row)}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={!base.isActive}
                                                        >
                                                            {t("toolbox.clam.handle")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => {
                                                                setFormTarget(row);
                                                                setFormOpen(true);
                                                            }}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                        >
                                                            {t("toolbox.actions.edit")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => setRecordTarget(row)}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                        >
                                                            {t("toolbox.clam.record")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => setDeleteRows([row])}
                                                            type="button"
                                                            variant="destructive"
                                                            size="sm"
                                                        >
                                                            {t("toolbox.actions.delete")}
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
                            onPageSizeChange={(s: number) => {
                                setPageSize(s);
                                setPage(1);
                            }}
                        />
                    </div>

                    {formOpen && (
                        <ClamFormModal
                            target={formTarget}
                            onClose={() => setFormOpen(false)}
                            onSaved={() => {
                                setFormOpen(false);
                                refetch();
                            }}
                        />
                    )}
                    {recordTarget && <ClamRecordSheet target={recordTarget} onClose={() => setRecordTarget(null)} />}
                    {confOpen && <ClamConfigModal onClose={() => setConfOpen(false)} />}

                    <Dialog
                        open={!!deleteRows}
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
                                    <DialogTitle>{t("toolbox.actions.delete")}</DialogTitle>
                                </DialogHeader>
                                <FieldGroup>
                                    <div>
                                        <span>
                                            {t("toolbox.clam.deleteContent", { name: (deleteRows ?? []).map((r) => r.name).join(", ") })}
                                        </span>
                                    </div>
                                    <div style={{ marginTop: 12 }}>
                                        <label className="flex items-center gap-2">
                                            <Checkbox checked={removeInfected} onCheckedChange={(e) => setRemoveInfected(!!e)} />
                                            {t("toolbox.clam.removeInfected")}
                                        </label>
                                        <div>
                                            <span className="text-muted-foreground">{t("toolbox.clam.removeInfectedHelper")}</span>
                                        </div>
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
                </div>
            }
        </>
    );
}
