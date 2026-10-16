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
import { Textarea } from "@/components/ui/textarea";
import { useConfirmAction } from "@/components/use-confirm-action";
import { PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SnapshotCreateModal } from "./snapshot-create";
import { TablePager } from "./table-pager";

import {
    useDeleteSnapshotsMutation,
    useRecoverSnapshotMutation,
    useRollbackSnapshotMutation,
    useSearchSnapshotsQuery,
    useUpdateSnapshotDescriptionMutation,
    type SnapshotInfo,
} from "@/api/settingsApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { formatBytes } from "@/utils/format";
import { useTranslation } from "react-i18next";
import { Field, errText } from "./shared";

const statusColor = (status: string): "green" | "red" | "blue" | "grey" => {
    const s = (status || "").toLowerCase();
    if (s.includes("success") || s.includes("done")) return "green";
    if (s.includes("fail") || s.includes("error")) return "red";
    if (s.includes("running") || s.includes("doing")) return "blue";
    return "grey";
};

export default function SnapshotSettingsTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);

    const { data, isFetching, refetch } = useSearchSnapshotsQuery({ page, pageSize, info });
    const [deleteSnapshots, { isLoading: deleting }] = useDeleteSnapshotsMutation();
    const [updateDesc] = useUpdateSnapshotDescriptionMutation();
    const [recoverSnapshot, { isLoading: recovering }] = useRecoverSnapshotMutation();
    const [rollbackSnapshot] = useRollbackSnapshotMutation();

    const [createOpen, setCreateOpen] = useState(false);
    const [descTarget, setDescTarget] = useState<SnapshotInfo | null>(null);
    const [descDraft, setDescDraft] = useState("");
    const [recoverTarget, setRecoverTarget] = useState<SnapshotInfo | null>(null);
    const [recoverSecret, setRecoverSecret] = useState("");
    const [reDownload, setReDownload] = useState(false);
    const [deleteRows, setDeleteRows] = useState<SnapshotInfo[] | null>(null);
    const [deleteWithFile, setDeleteWithFile] = useState(false);

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteSnapshots({ ids: deleteRows.map((r) => r.id), deleteWithFile }).unwrap();
            toast.success(t("settings.snapshot.deleted"));
            setDeleteRows(null);
            setSelected([]);
            setDeleteWithFile(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const submitDesc = async () => {
        if (!descTarget) return;
        try {
            await updateDesc({ id: descTarget.id, description: descDraft }).unwrap();
            toast.success(t("settings.snapshot.saved"));
            setDescTarget(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const submitRecover = async () => {
        if (!recoverTarget) return;
        try {
            await recoverSnapshot({
                id: recoverTarget.id,
                taskID: recoverTarget.taskID,
                isNew: false,
                reDownload,
                secret: recoverSecret,
            }).unwrap();
            toast.success(t("settings.snapshot.recoverStarted"));
            setRecoverTarget(null);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onRollback = (row: SnapshotInfo) => {
        confirm({
            title: t("settings.snapshot.rollback"),
            description: t("settings.snapshot.rollbackConfirm", { name: row.name }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await rollbackSnapshot({
                        id: row.id,
                        taskID: row.taskRollbackID,
                        isNew: false,
                        reDownload: false,
                        secret: "",
                    }).unwrap();
                    toast.success(t("settings.snapshot.rollbackStarted"));
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
                                placeholder={t("settings.snapshot.searchPlaceholder")}
                                className="w-[220px]"
                                value={searchInput ?? ""}
                                onChange={(event) =>
                                    ((v) => {
                                        setSearchInput(v);
                                        setPage(1);
                                    })(event.target.value)
                                }
                            />
                        </div>
                        <Button onClick={() => setCreateOpen(true)} type="button" variant="default">
                            {<PlusIcon data-icon="inline-start" />}
                            {t("settings.snapshot.create")}
                        </Button>
                        <Button onClick={() => refetch()} type="button" variant="outline">
                            {<RefreshCwIcon data-icon="inline-start" />}
                            {t("common.refresh")}
                        </Button>
                        <Button
                            onClick={() => setDeleteRows((data?.items ?? []).filter((r) => selected.includes(r.id)))}
                            type="button"
                            variant="destructive"
                            disabled={selected.length === 0}
                        >
                            {t("common.delete")}
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
                                    <TableHead>{t("settings.snapshot.name")}</TableHead>
                                    <TableHead>{t("settings.snapshot.version")}</TableHead>
                                    <TableHead>{t("settings.snapshot.source")}</TableHead>
                                    <TableHead>{t("settings.snapshot.size")}</TableHead>
                                    <TableHead>{t("settings.snapshot.status")}</TableHead>
                                    <TableHead>{t("settings.snapshot.description")}</TableHead>
                                    <TableHead>{t("settings.snapshot.createdAt")}</TableHead>
                                    <TableHead>{""}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={9}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : (data?.items ?? []).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("settings.snapshot.empty")}</span>}
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
                                            <TableCell>{row["name"]}</TableCell>
                                            <TableCell>{row["version"]}</TableCell>
                                            <TableCell>{(row.sourceAccounts ?? []).join("、") || "-"}</TableCell>
                                            <TableCell>{formatBytes(Number(row["size"]))}</TableCell>
                                            <TableCell>
                                                {
                                                    <Badge
                                                        variant={["red"].includes(statusColor(row["status"])) ? "destructive" : "secondary"}
                                                    >
                                                        {row["status"] || "-"}
                                                    </Badge>
                                                }
                                            </TableCell>
                                            <TableCell>
                                                {<span className="text-muted-foreground">{row["description"] || "-"}</span>}
                                            </TableCell>
                                            <TableCell>{row["createdAt"]}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <Button
                                                            onClick={() => {
                                                                setDescDraft(row.description ?? "");
                                                                setDescTarget(row);
                                                            }}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                        >
                                                            {t("settings.snapshot.editDesc")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => {
                                                                setRecoverSecret("");
                                                                setReDownload(false);
                                                                setRecoverTarget(row);
                                                            }}
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                        >
                                                            {t("settings.snapshot.recover")}
                                                        </Button>
                                                        <Button onClick={() => onRollback(row)} type="button" variant="ghost" size="sm">
                                                            {t("settings.snapshot.rollback")}
                                                        </Button>
                                                        <Button
                                                            onClick={() => setDeleteRows([row])}
                                                            type="button"
                                                            variant="destructive"
                                                            size="sm"
                                                        >
                                                            {t("common.delete")}
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

                    {createOpen && (
                        <SnapshotCreateModal
                            onClose={() => setCreateOpen(false)}
                            onSaved={() => {
                                setCreateOpen(false);
                                refetch();
                            }}
                        />
                    )}

                    <Dialog
                        open={descTarget !== null}
                        onOpenChange={(open) => {
                            if (!open && true) setDescTarget(null);
                        }}
                    >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                            <form
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (true) void submitDesc();
                                }}
                            >
                                <DialogHeader>
                                    <DialogTitle>{t("settings.snapshot.editDesc")}</DialogTitle>
                                </DialogHeader>
                                <FieldGroup>
                                    <Field label={t("settings.snapshot.description")}>
                                        <Textarea
                                            maxLength={256}
                                            value={descDraft ?? ""}
                                            onChange={(event) => setDescDraft(event.target.value)}
                                        />
                                    </Field>
                                </FieldGroup>
                                <DialogFooter>
                                    <Button type="button" variant="outline" disabled={false} onClick={() => setDescTarget(null)}>
                                        {t("common.cancel")}
                                    </Button>
                                    <Button type="submit" disabled={false}>
                                        {t("common.confirm")}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={recoverTarget !== null}
                        onOpenChange={(open) => {
                            if (!open && !recovering) setRecoverTarget(null);
                        }}
                    >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                            <form
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!recovering) void submitRecover();
                                }}
                            >
                                <DialogHeader>
                                    <DialogTitle>{t("settings.snapshot.recover")}</DialogTitle>
                                </DialogHeader>
                                <FieldGroup>
                                    <span>{t("settings.snapshot.recoverHelper", { name: recoverTarget?.name ?? "" })}</span>
                                    <div className="mt-3">
                                        <label className="flex items-center gap-2">
                                            <Switch checked={reDownload} onCheckedChange={setReDownload} />
                                            {t("settings.snapshot.reDownload")}
                                        </label>
                                    </div>
                                    <Field label={t("settings.snapshot.secret")} help={t("settings.snapshot.secretHelper")}>
                                        <Input
                                            value={recoverSecret ?? ""}
                                            type="password"
                                            onChange={(event) => setRecoverSecret(event.target.value)}
                                        />
                                    </Field>
                                </FieldGroup>
                                <DialogFooter>
                                    <Button type="button" variant="outline" disabled={recovering} onClick={() => setRecoverTarget(null)}>
                                        {t("common.cancel")}
                                    </Button>
                                    <Button type="submit" disabled={recovering}>
                                        {recovering ? <Spinner data-icon="inline-start" /> : null}
                                        {t("common.confirm")}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

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
                                        <DialogTitle>{t("common.delete")}</DialogTitle>
                                    </DialogHeader>
                                    <FieldGroup>
                                        <span>
                                            {t("settings.snapshot.deleteConfirm", { name: deleteRows.map((r) => r.name).join("、") })}
                                        </span>
                                        <div className="mt-3">
                                            <label className="flex items-center gap-2">
                                                <Checkbox checked={deleteWithFile} onCheckedChange={(e) => setDeleteWithFile(!!e)} />
                                                {t("settings.snapshot.deleteWithFile")}
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
