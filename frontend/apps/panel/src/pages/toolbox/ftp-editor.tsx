import { useCreateFtpMutation, useSearchFtpLogQuery, useUpdateFtpMutation, type FtpInfo } from "@/api/toolboxApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/utils/format";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";
import { Field, errText } from "./shared";

export const randomPassword = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);

export function FtpFormModal({ target, onClose, onSaved }: { target: FtpInfo | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [user, setUser] = useState(target?.user ?? "");
    const [password, setPassword] = useState(target?.password || randomPassword());
    const [path, setPath] = useState(target?.path ?? "/");
    const [description, setDescription] = useState(target?.description ?? "");
    const [create, { isLoading: creating }] = useCreateFtpMutation();
    const [update, { isLoading: updating }] = useUpdateFtpMutation();

    const save = async () => {
        if (!isEdit && !user.trim()) {
            toast.error(t("toolbox.ftp.userRequired"));
            return;
        }
        if (!password) {
            toast.error(t("toolbox.ftp.noPasswdMsg"));
            return;
        }
        if (!path.trim()) {
            toast.error(t("toolbox.ftp.pathRequired"));
            return;
        }
        try {
            if (isEdit && target) {
                await update({ id: target.id, password, path, status: target.status, description }).unwrap();
            } else {
                await create({ user, password, path, description }).unwrap();
            }
            toast.success(t("toolbox.ftp.saved"));
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
                        <DialogTitle>{isEdit ? t("toolbox.ftp.edit") : t("toolbox.ftp.add")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <div className="flex flex-col gap-3.5">
                            <Field label={t("toolbox.ftp.user")}>
                                <Input disabled={isEdit} required value={user ?? ""} onChange={(event) => setUser(event.target.value)} />
                            </Field>
                            <Field label={t("toolbox.ftp.password")}>
                                <Input value={password ?? ""} type="password" onChange={(event) => setPassword(event.target.value)} />
                            </Field>
                            <Field label={t("toolbox.ftp.path")} help={t("toolbox.ftp.dirHelper")}>
                                <Input placeholder={"/www/wwwroot"} value={path ?? ""} onChange={(event) => setPath(event.target.value)} />
                            </Field>
                            <Field label={t("toolbox.ftp.description")}>
                                <Textarea value={description ?? ""} onChange={(event) => setDescription(event.target.value)} />
                            </Field>
                        </div>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={creating || updating} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={creating || updating}>
                            {creating || updating ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.actions.save")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function FtpLogSheet({ target, onClose }: { target: FtpInfo; onClose: () => void }) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [operation, setOperation] = useState("");
    const { data, isFetching } = useSearchFtpLogQuery({ user: target.user, operation, page, pageSize });

    return (
        <Sheet
            open={true}
            onOpenChange={(open) => {
                if (!open && true) onClose();
            }}
        >
            <SheetContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <div className="flex flex-col gap-4">
                    <SheetHeader>
                        <SheetTitle>{`FTP - ${target.user}`}</SheetTitle>
                    </SheetHeader>
                    <FieldGroup>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <NativeSelect
                                className="w-[160px]"
                                value={operation ?? ""}
                                aria-label={t("toolbox.ftp.operationFilter")}
                                onChange={(event) =>
                                    ((v) => {
                                        setOperation(String(v ?? ""));
                                        setPage(1);
                                    })(event.target.value)
                                }
                            >
                                <NativeSelectOption value="">{t("toolbox.ftp.operationFilter")}</NativeSelectOption>
                                {[
                                    { label: t("toolbox.ftp.upload"), value: "PUT" },
                                    { label: t("toolbox.ftp.download"), value: "GET" },
                                ].map((option) => (
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
                                        <TableHead>{"IP"}</TableHead>
                                        <TableHead>{t("toolbox.ftp.status")}</TableHead>
                                        <TableHead>{t("toolbox.ftp.operationFilter")}</TableHead>
                                        <TableHead>{t("toolbox.ftp.fileName")}</TableHead>
                                        <TableHead>{t("toolbox.ftp.size")}</TableHead>
                                        <TableHead>{t("toolbox.ftp.time")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isFetching ? (
                                        <TableRow>
                                            <TableCell colSpan={6}>
                                                <Spinner className="mx-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ) : (data?.items ?? []).length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6}>
                                                <Empty>
                                                    <EmptyDescription>
                                                        {<span className="text-muted-foreground">{t("toolbox.ftp.logEmpty")}</span>}
                                                    </EmptyDescription>
                                                </Empty>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        (data?.items ?? []).map((row, rowIndex) => (
                                            <TableRow key={row["time"]}>
                                                <TableCell>{row["ip"]}</TableCell>
                                                <TableCell>
                                                    {
                                                        <Badge
                                                            variant={
                                                                ["red"].includes(row["status"] === "200" ? "green" : "red")
                                                                    ? "destructive"
                                                                    : "secondary"
                                                            }
                                                        >
                                                            {row["status"]}
                                                        </Badge>
                                                    }
                                                </TableCell>
                                                <TableCell>
                                                    {(row.operation || "").includes('"PUT')
                                                        ? t("toolbox.ftp.upload")
                                                        : t("toolbox.ftp.download")}
                                                </TableCell>
                                                <TableCell>
                                                    {row["operation"]
                                                        .replace(/"/g, "")
                                                        .replace(/PUT|GET/, "")
                                                        .replace(target.path + "/", "")}
                                                </TableCell>
                                                <TableCell>{formatBytes(Number(row["size"]))}</TableCell>
                                                <TableCell>{row["time"]}</TableCell>
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
                    </FieldGroup>
                </div>
            </SheetContent>
        </Sheet>
    );
}
