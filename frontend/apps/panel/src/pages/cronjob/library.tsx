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
import { Textarea } from "@/components/ui/textarea";
import { useConfirmAction } from "@/components/use-confirm-action";
import { CheckIcon, MinusIcon, PlusIcon, RefreshCwIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { TablePager } from "../settings/table-pager";

import {
    useCreateScriptMutation,
    useDeleteScriptsMutation,
    useListCronjobGroupsQuery,
    useSearchScriptsQuery,
    useUpdateScriptMutation,
    type ScriptInfo,
} from "@/api/cronjobApi";
import { useDebouncedValue } from "@/pages/database/shared";
import { useTranslation } from "react-i18next";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

interface SheetProps {
    target: ScriptInfo | null;
    groups: { id: number; name: string }[];
    onClose: () => void;
}

function ScriptSheet({ target, groups, onClose }: SheetProps) {
    const { t } = useTranslation();
    const [name, setName] = useState(target?.name ?? "");
    const [groupID, setGroupID] = useState(target?.groupID ?? 0);
    const [isInteractive, setIsInteractive] = useState(target?.isInteractive ?? false);
    const [description, setDescription] = useState(target?.description ?? "");
    const [script, setScript] = useState(target?.script ?? "");
    const [create, { isLoading: creating }] = useCreateScriptMutation();
    const [update, { isLoading: updating }] = useUpdateScriptMutation();

    const submit = async () => {
        if (!name.trim()) return toast.warning(t("cronjob.library.nameRequired"));
        if (!script.trim()) return toast.warning(t("cronjob.library.contentRequired"));
        const payload = { name: name.trim(), groupID, isInteractive, description, script };
        try {
            if (target) {
                await update({ id: target.id, ...payload }).unwrap();
            } else {
                await create(payload).unwrap();
            }
            toast.success(t("cronjob.saveSuccess"));
            onClose();
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
                        if (!(creating || updating)) void submit();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{target ? t("cronjob.library.edit") : t("cronjob.library.create")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <div className="flex flex-col gap-3">
                            <Field label={t("cronjob.library.name")}>
                                <Input
                                    disabled={!!target && target.isSystem}
                                    value={name ?? ""}
                                    onChange={(event) => setName(event.target.value)}
                                />
                            </Field>
                            <Field label={t("cronjob.library.group")}>
                                <NativeSelect
                                    className="w-full"
                                    value={groupID ?? ""}
                                    aria-label={t("common.select")}
                                    onChange={(event) => setGroupID(Number(event.target.value ?? 0))}
                                >
                                    <NativeSelectOption value="">{t("common.all")}</NativeSelectOption>
                                    {groups
                                        .map((g) => ({ label: g.name === "Default" ? t("cronjob.operate.default") : g.name, value: g.id }))
                                        .map((option) => (
                                            <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                {option.label}
                                            </NativeSelectOption>
                                        ))}
                                </NativeSelect>
                            </Field>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <Switch checked={isInteractive} onCheckedChange={setIsInteractive} />
                                <span>{t("cronjob.library.interactive")}</span>
                            </label>
                            <Field label={t("cronjob.library.description")}>
                                <Input value={description ?? ""} onChange={(event) => setDescription(event.target.value)} />
                            </Field>
                            <Field label={t("cronjob.library.content")}>
                                <Textarea value={script ?? ""} onChange={(event) => setScript(event.target.value)} />
                            </Field>
                        </div>
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

export default function ScriptLibraryTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState("");
    const info = useDebouncedValue(searchInput);
    const [groupID, setGroupID] = useState<number | undefined>(undefined);
    const [selected, setSelected] = useState<number[]>([]);
    const [sheetTarget, setSheetTarget] = useState<ScriptInfo | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [viewing, setViewing] = useState<ScriptInfo | null>(null);

    useEffect(() => {
        setPage(1);
    }, [info, groupID]);

    const { data: groups = [] } = useListCronjobGroupsQuery("script");
    const { data, isFetching, refetch } = useSearchScriptsQuery({
        page,
        pageSize,
        info,
        groupID: groupID ?? 0,
        orderBy: "createdAt",
        order: "descending",
    });
    const [deleteScripts] = useDeleteScriptsMutation();

    const groupName = useMemo(() => {
        const map = new Map(groups.map((g) => [g.id, g.name]));
        return (id: number) => {
            const name = map.get(id);
            if (!name) return "-";
            return name === "Default" ? t("cronjob.operate.default") : name;
        };
    }, [groups, t]);

    const rows = data?.items ?? [];

    const onDelete = (targets: ScriptInfo[]) =>
        confirm({
            title: t("cronjob.actions.delete"),
            description: t("cronjob.library.deleteConfirm", { name: targets.map((s) => s.name).join("、") }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await deleteScripts({ ids: targets.map((s) => s.id) }).unwrap();
                    toast.success(t("cronjob.library.deleteSuccess"));
                    setSelected([]);
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });

    return (
        <>
            {confirmationDialog}
            {
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                            <span className="shrink-0 text-muted-foreground">{<SearchIcon />}</span>
                            <Input
                                placeholder={t("cronjob.library.searchPlaceholder")}
                                className="w-[220px]"
                                value={searchInput ?? ""}
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                        </div>
                        <NativeSelect
                            className="w-[160px]"
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
                            {t("cronjob.library.create")}
                        </Button>
                        <Button onClick={() => refetch()} type="button" variant="outline" disabled={isFetching}>
                            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t("cronjob.actions.refresh")}
                        </Button>
                        {selected.length > 0 && (
                            <Button
                                onClick={() => onDelete(rows.filter((r) => selected.includes(r.id)))}
                                type="button"
                                variant="destructive"
                            >
                                {<Trash2Icon data-icon="inline-start" />}
                                {t("cronjob.library.delete")}
                            </Button>
                        )}
                    </div>

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
                                    <TableHead>{t("cronjob.library.name")}</TableHead>
                                    <TableHead>{t("cronjob.library.interactive")}</TableHead>
                                    <TableHead>{t("cronjob.columns.group")}</TableHead>
                                    <TableHead>{t("cronjob.library.description")}</TableHead>
                                    <TableHead>{t("cronjob.library.date")}</TableHead>
                                    <TableHead>{t("cronjob.columns.operate")}</TableHead>
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
                                                    {<span className="text-muted-foreground">{t("cronjob.library.empty")}</span>}
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
                                            <TableCell>
                                                {
                                                    <Button onClick={() => setViewing(row)} type="button" variant="ghost" size="sm">
                                                        {row["name"]}
                                                    </Button>
                                                }
                                            </TableCell>
                                            <TableCell>{row["isInteractive"] ? <CheckIcon /> : <MinusIcon />}</TableCell>
                                            <TableCell>{row.isSystem ? t("cronjob.library.system") : groupName(row.groupID)}</TableCell>
                                            <TableCell>{row["description"]}</TableCell>
                                            <TableCell>{row["createdAt"]}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-wrap items-center gap-2">
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
                                                            onClick={() => onDelete([row])}
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

                    {sheetOpen && <ScriptSheet target={sheetTarget} groups={groups} onClose={() => setSheetOpen(false)} />}
                    {viewing && (
                        <Dialog
                            open={true}
                            onOpenChange={(open) => {
                                if (!open && true) setViewing(null);
                            }}
                        >
                            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                                <div className="flex flex-col gap-4">
                                    <DialogHeader>
                                        <DialogTitle>{viewing.name}</DialogTitle>
                                    </DialogHeader>
                                    <FieldGroup>
                                        <pre className="log-output max-h-[480px]">
                                            {viewing.script}
                                        </pre>
                                    </FieldGroup>
                                    {null}
                                </div>
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            }
        </>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-muted-foreground">{label}</span>
            {children}
        </div>
    );
}
