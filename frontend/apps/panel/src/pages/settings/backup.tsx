import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TablePager } from "./table-pager";

import {
    useCheckBackupConnMutation,
    useCreateBackupMutation,
    useDeleteBackupMutation,
    useRefreshBackupTokenMutation,
    useSearchBackupsQuery,
    useUpdateBackupMutation,
    type BackupInfo,
    type BackupOperate,
} from "@/api/settingsApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";
import { Field, errText } from "./shared";

const BACKUP_TYPES = ["LOCAL", "S3", "MINIO", "OSS", "COS", "KODO", "WebDAV", "SFTP"];

function BackupFormModal({ target, onClose, onSaved }: { target: BackupInfo | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [form, setForm] = useState<BackupOperate>({
        id: target?.id,
        name: target?.name ?? "",
        type: target?.type ?? "S3",
        isPublic: target?.isPublic ?? false,
        bucket: target?.bucket ?? "",
        accessKey: target?.accessKey ?? "",
        credential: target?.credential ?? "",
        backupPath: target?.backupPath ?? "",
        vars: target?.vars || "{}",
        rememberAuth: target?.rememberAuth ?? false,
    });
    const [create, { isLoading: creating }] = useCreateBackupMutation();
    const [update, { isLoading: updating }] = useUpdateBackupMutation();
    const [check, { isLoading: checking }] = useCheckBackupConnMutation();

    const onCheck = async () => {
        try {
            const res = await check({ ...form }).unwrap();
            if (res.isOk) toast.success(t("settings.backup.checkOk"));
            else toast.error(res.msg || t("settings.backup.checkFailed"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const save = async () => {
        if (!form.name.trim()) {
            toast.error(t("settings.backup.nameRequired"));
            return;
        }
        try {
            const body: BackupOperate = { ...form, vars: form.vars?.trim() ? form.vars : "{}" };
            if (isEdit) await update(body).unwrap();
            else await create(body).unwrap();
            toast.success(t("settings.backup.saved"));
            onSaved();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !(creating || updating)) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!(creating || updating)) void save();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{isEdit ? t("settings.backup.edit") : t("settings.backup.add")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label={t("settings.backup.name")}>
                            <Input
                                required
                                value={form.name ?? ""}
                                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                            />
                        </Field>
                        <Field label={t("settings.backup.type")}>
                            <NativeSelect
                                disabled={isEdit}
                                style={{ width: "100%" }}
                                value={form.type ?? ""}
                                aria-label={t("common.select")}
                                onChange={(event) => setForm((f) => ({ ...f, type: String(event.target.value) }))}
                            >
                                {BACKUP_TYPES.map((v) => ({ value: v, label: v })).map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        {form.type === "LOCAL" ? (
                            <Field label={t("settings.backup.backupPath")} help={t("settings.backup.backupPathHelper")}>
                                <Input
                                    placeholder={"/opt/gpupanel/backup"}
                                    value={form.backupPath ?? ""}
                                    onChange={(event) => setForm((f) => ({ ...f, backupPath: event.target.value }))}
                                />
                            </Field>
                        ) : (
                            <>
                                <Field label={t("settings.backup.bucket")}>
                                    <Input
                                        value={form.bucket ?? ""}
                                        onChange={(event) => setForm((f) => ({ ...f, bucket: event.target.value }))}
                                    />
                                </Field>
                                <Field label={t("settings.backup.accessKey")}>
                                    <Input
                                        value={form.accessKey ?? ""}
                                        onChange={(event) => setForm((f) => ({ ...f, accessKey: event.target.value }))}
                                    />
                                </Field>
                                <Field label={t("settings.backup.credential")}>
                                    <Input
                                        value={form.credential ?? ""}
                                        type="password"
                                        onChange={(event) => setForm((f) => ({ ...f, credential: event.target.value }))}
                                    />
                                </Field>
                                <Field label={t("settings.backup.vars")} help={t("settings.backup.varsHelper")}>
                                    <Textarea
                                        value={form.vars ?? ""}
                                        onChange={(event) => setForm((f) => ({ ...f, vars: event.target.value }))}
                                    />
                                </Field>
                            </>
                        )}
                        <Button onClick={onCheck} type="button" variant="outline" disabled={checking}>
                            {checking ? <Spinner data-icon="inline-start" /> : null}
                            {t("settings.backup.checkConnection")}
                        </Button>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={creating || updating} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={creating || updating}>
                            {creating || updating ? <Spinner data-icon="inline-start" /> : null}
                            {t("common.confirm")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function BackupAccountSettingsTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);

    const { data, isFetching, refetch } = useSearchBackupsQuery({ page, pageSize, info });
    const [deleteBackup, { isLoading: deleting }] = useDeleteBackupMutation();
    const [refreshToken] = useRefreshBackupTokenMutation();

    const [formOpen, setFormOpen] = useState(false);
    const [formTarget, setFormTarget] = useState<BackupInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<BackupInfo[] | null>(null);

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            for (const row of deleteRows) {
                await deleteBackup({ id: row.id }).unwrap();
            }
            toast.success(t("settings.backup.deleted"));
            setDeleteRows(null);
            setSelected([]);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onRefreshToken = async (row: BackupInfo) => {
        try {
            await refreshToken({ id: row.id }).unwrap();
            toast.success(t("settings.backup.tokenRefreshed"));
            refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Card>
                <CardHeader>
                    <CardTitle>{t("settings.backup.title")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div style={{ marginBottom: 12 }} className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("settings.backup.searchPlaceholder")}
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
                        >
                            {<PlusIcon data-icon="inline-start" />}
                            {t("settings.backup.add")}
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
                                    <TableHead>{t("settings.backup.name")}</TableHead>
                                    <TableHead>{t("settings.backup.type")}</TableHead>
                                    <TableHead>{t("settings.backup.bucket")}</TableHead>
                                    <TableHead>{t("settings.backup.backupPath")}</TableHead>
                                    <TableHead>{t("settings.backup.createdAt")}</TableHead>
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
                                                    {<span className="text-muted-foreground">{t("settings.backup.empty")}</span>}
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
                                            <TableCell>{<Badge variant={"secondary"}>{row["type"]}</Badge>}</TableCell>
                                            <TableCell>{row["bucket"] || "-"}</TableCell>
                                            <TableCell>{row["backupPath"] || "-"}</TableCell>
                                            <TableCell>{row["createdAt"]}</TableCell>
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
                                                            {t("settings.backup.edit")}
                                                        </Button>
                                                        {row.isPublic ? (
                                                            <Button
                                                                onClick={() => onRefreshToken(row)}
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                            >
                                                                {t("settings.backup.refreshToken")}
                                                            </Button>
                                                        ) : null}
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
                </CardContent>
            </Card>

            {formOpen && (
                <BackupFormModal
                    target={formTarget}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        refetch();
                    }}
                />
            )}

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
                                <span>{t("settings.backup.deleteConfirm", { name: deleteRows.map((r) => r.name).join("、") })}</span>
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
    );
}
