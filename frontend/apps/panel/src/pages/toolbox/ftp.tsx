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
import { PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";
import { FtpFormModal, FtpLogSheet } from "./ftp-editor";

import {
    useDeleteFtpMutation,
    useGetFtpBaseQuery,
    useOperateFtpMutation,
    useSearchFtpQuery,
    useSyncFtpMutation,
    useUpdateFtpMutation,
    type FtpInfo,
} from "@/api/toolboxApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { errText } from "./shared";

export default function FtpTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const { data: base, isFetching: baseFetching, refetch: refetchBase } = useGetFtpBaseQuery();
    const [operate] = useOperateFtpMutation();
    const [sync, { isLoading: syncing }] = useSyncFtpMutation();
    const [updateFtp] = useUpdateFtpMutation();
    const [deleteFtp, { isLoading: deleting }] = useDeleteFtpMutation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);
    const [formTarget, setFormTarget] = useState<FtpInfo | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [logTarget, setLogTarget] = useState<FtpInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<FtpInfo[] | null>(null);

    const { data, isFetching, refetch } = useSearchFtpQuery({ page, pageSize, info });

    if (!base) {
        return (
            <div className="p-6">
                <span className="text-muted-foreground">{baseFetching ? t("common.loading") : t("common.empty")}</span>
            </div>
        );
    }

    if (!base.isExist) {
        return (
            <div className="p-6">
                <span className="text-muted-foreground">{t("toolbox.ftp.notInstalled")}</span>
            </div>
        );
    }

    const onOperate = (operation: string) => {
        confirm({
            title: t("toolbox.actions." + operation, operation),
            description: t("toolbox.ftp.operation", { op: t("toolbox.actions." + operation, operation) }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await operate({ operation }).unwrap();
                    toast.success(t("toolbox.ftp.saved"));
                    refetchBase();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const onSync = () => {
        confirm({
            title: t("toolbox.ftp.sync"),
            description: t("toolbox.ftp.syncConfirm"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await sync().unwrap();
                    toast.success(t("toolbox.ftp.synced"));
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const toggleStatus = async (row: FtpInfo) => {
        try {
            await updateFtp({
                id: row.id,
                password: row.password,
                path: row.path,
                status: row.status === "Enable" ? "Disable" : "Enable",
                description: row.description,
            }).unwrap();
            toast.success(t("toolbox.ftp.statusChanged"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteFtp({ ids: deleteRows.map((r) => r.id) }).unwrap();
            toast.success(t("toolbox.ftp.deleted"));
            setDeleteRows(null);
            setSelected([]);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <>
            {confirmationDialog}
            {
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant={["red"].includes("green") ? "destructive" : "secondary"}>FTP</Badge>
                        <Badge variant={["red"].includes(base.isActive ? "green" : "grey") ? "destructive" : "secondary"}>
                            {base.isActive ? t("toolbox.actions.enable") : t("toolbox.actions.disable")}
                        </Badge>
                        <Button onClick={() => onOperate(base.isActive ? "stop" : "start")} type="button" variant="ghost">
                            {base.isActive ? t("toolbox.actions.stop") : t("toolbox.actions.start")}
                        </Button>
                        <Button onClick={() => onOperate("restart")} type="button" variant="ghost">
                            {t("toolbox.actions.restart")}
                        </Button>
                        <Button onClick={() => refetchBase()} type="button" variant="ghost" disabled={baseFetching}>
                            {baseFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t("toolbox.actions.refresh")}
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("toolbox.ftp.searchPlaceholder")}
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
                        <Button
                            onClick={() => {
                                setFormTarget(null);
                                setFormOpen(true);
                            }}
                            type="button"
                            variant="default"
                        >
                            {<PlusIcon data-icon="inline-start" />}
                            {t("toolbox.ftp.add")}
                        </Button>
                        <Button onClick={onSync} type="button" variant="outline" disabled={syncing}>
                            {syncing ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.ftp.sync")}
                        </Button>
                        <Button
                            onClick={() => setDeleteRows((data?.items ?? []).filter((r) => selected.includes(r.id)))}
                            type="button"
                            variant="destructive"
                            disabled={selected.length === 0}
                        >
                            {t("toolbox.actions.delete")}
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
                                    <TableHead>{t("toolbox.ftp.user")}</TableHead>
                                    <TableHead>{t("toolbox.ftp.password")}</TableHead>
                                    <TableHead>{t("toolbox.ftp.status")}</TableHead>
                                    <TableHead>{t("toolbox.ftp.path")}</TableHead>
                                    <TableHead>{t("toolbox.ftp.description")}</TableHead>
                                    <TableHead>{""}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isFetching ? (
                                    <TableRow>
                                        <TableCell colSpan={7}>
                                            <Spinner className="mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : (data?.items ?? []).length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7}>
                                            <Empty>
                                                <EmptyDescription>
                                                    {<span className="text-muted-foreground">{t("toolbox.ftp.empty")}</span>}
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
                                            <TableCell>{row["user"]}</TableCell>
                                            <TableCell>
                                                {<span className="text-muted-foreground">{row["password"] ? "••••••••" : "-"}</span>}
                                            </TableCell>
                                            <TableCell>
                                                {row.status === "Deleted" ? (
                                                    <Badge variant={["red"].includes("grey") ? "destructive" : "secondary"}>Deleted</Badge>
                                                ) : (
                                                    <Switch checked={row.status === "Enable"} onCheckedChange={() => toggleStatus(row)} />
                                                )}
                                            </TableCell>
                                            <TableCell>{row["path"]}</TableCell>
                                            <TableCell>{row["description"]}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-wrap items-center gap-2">
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
                                                        <Button onClick={() => setLogTarget(row)} type="button" variant="ghost" size="sm">
                                                            {t("toolbox.actions.log")}
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
                        <FtpFormModal
                            target={formTarget}
                            onClose={() => setFormOpen(false)}
                            onSaved={() => {
                                setFormOpen(false);
                                refetch();
                            }}
                        />
                    )}
                    {logTarget && <FtpLogSheet target={logTarget} onClose={() => setLogTarget(null)} />}

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
                                        <DialogTitle>{t("toolbox.actions.delete")}</DialogTitle>
                                    </DialogHeader>
                                    <FieldGroup>
                                        <span>{t("toolbox.ftp.deleteConfirm", { name: deleteRows.map((r) => r.user).join("、") })}</span>
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
