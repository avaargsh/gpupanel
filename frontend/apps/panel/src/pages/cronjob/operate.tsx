import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { OptionPicker } from "../settings/option-picker";
import { Field } from "../settings/shared";
import { TASK_TYPES, emptyForm, type FormState, type Props } from "./operate-model";
import { ScheduleFields } from "./schedule-fields";
import { ScriptFields } from "./script-fields";
import { TargetFields } from "./target-fields";

import { useSearchInstalledQuery } from "@/api/appApi";
import { useListContainersQuery } from "@/api/containerApi";
import {
    useCreateCronjobMutation,
    useLoadCronjobInfoQuery,
    useLoadNextTimesMutation,
    useSearchScriptsQuery,
    useUpdateCronjobMutation,
    type CronjobOperate,
    type SpecObj,
} from "@/api/cronjobApi";
import { useListWebsitesQuery } from "@/api/websiteApi";
import { useTranslation } from "react-i18next";
import { defaultSpecObj, hasBackup, hasExclusion, hasScript, isWebsite, transObjToSpec, transSpecToObj } from "./helper";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export default function CronjobOperate({ target, groups, onClose }: Props) {
    const { t } = useTranslation();
    const [form, setForm] = useState<FormState>(emptyForm);
    const [loaded, setLoaded] = useState(!target);
    const [preview, setPreview] = useState<string | null>(null);
    const [previewTimes, setPreviewTimes] = useState<string[]>([]);
    const isCreate = !target;
    const set = (patch: Partial<FormState>) => setForm((s) => ({ ...s, ...patch }));

    const detail = useLoadCronjobInfoQuery(target?.id as number, { skip: !target });
    const { data: websites = [] } = useListWebsitesQuery();
    const { data: containers = [] } = useListContainersQuery();
    const scopeNode = useAppSelector((state) => state.ui.currentNode) || 'local';
    const { data: installed } = useSearchInstalledQuery({ scopeNode, page: 1, pageSize: 200, name: "", tags: [], update: false, sync: false });
    const { data: scripts } = useSearchScriptsQuery({
        page: 1,
        pageSize: 200,
        info: "",
        groupID: 0,
        orderBy: "createdAt",
        order: "descending",
    });
    const [create, { isLoading: creating }] = useCreateCronjobMutation();
    const [update, { isLoading: updating }] = useUpdateCronjobMutation();
    const [loadNext] = useLoadNextTimesMutation();

    useEffect(() => {
        if (!target || !detail.data) return;
        const d = detail.data;
        const parts = (d.spec || "").split("&&").filter(Boolean);
        const objs = d.specCustom ? [defaultSpecObj(d.type)] : parts.map((s) => transSpecToObj(s)).filter((o): o is SpecObj => o != null);
        setForm({
            ...emptyForm(),
            type: d.type,
            name: d.name,
            groupID: d.groupID ?? 0,
            specCustom: d.specCustom,
            specObjs: objs.length ? objs : [defaultSpecObj(d.type)],
            specs: d.specCustom ? parts : ["0 2 * * *"],
            websiteList: d.website ? d.website.split(",") : [],
            appIdList: d.appID ? d.appID.split(",") : [],
            dbType: d.dbType || "mysql",
            dbNameList: d.dbName ? d.dbName.split(",") : [],
            isDir: d.isDir ?? true,
            sourceDir: d.isDir ? (d.sourceDir ?? "") : "",
            files: !d.isDir && d.sourceDir ? d.sourceDir.split(",") : [],
            urlItems: d.url ? d.url.split(",") : [""],
            inContainer: !!d.containerName,
            containerName: d.containerName ?? "",
            command: d.command || "bash",
            user: d.user || "root",
            executor: d.executor || "bash",
            scriptMode: d.scriptMode || "input",
            script: d.script || "",
            scriptID: d.scriptID || undefined,
            retainCopies: d.retainCopies || 3,
            timeout: d.timeout || 3600,
            retryTimes: d.retryTimes || 0,
            secret: d.secret || "",
            ignoreErr: d.ignoreErr ?? false,
            ignoreFiles: d.exclusionRules ? d.exclusionRules.split(",") : [],
            scopes: (d.scopes as string[]) ?? [],
            withImage: d.snapshotRule?.withImage ?? false,
            ignoreAppIDs: d.snapshotRule?.ignoreAppIDs ?? [],
        });
        setLoaded(true);
    }, [target, detail.data]);

    const appOptions = useMemo(() => (installed?.items ?? []).map((a) => ({ label: a.name, value: String(a.id) })), [installed]);

    const buildSpec = (): string | null => {
        if (form.specCustom) {
            const specs = form.specs.map((s) => s.trim()).filter(Boolean);
            if (!specs.length) return null;
            return specs.join("&&");
        }
        const specs: string[] = [];
        for (const o of form.specObjs) {
            const s = transObjToSpec(o.specType, o.week, o.day, o.hour, o.minute, o.second);
            if (!s) return null;
            specs.push(s);
        }
        return specs.length ? specs.join("&&") : null;
    };

    const onPreview = async (spec: string) => {
        if (!spec) return toast.warning(t("cronjob.cronSpecHelper"));
        try {
            const res = await loadNext(spec).unwrap();
            setPreview(spec);
            setPreviewTimes(res ?? []);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const submit = async () => {
        if (creating || updating || !loaded) return;
        if (!form.name.trim()) return toast.warning(t("cronjob.operate.nameRequired"));
        const spec = buildSpec();
        if (!spec) return toast.warning(t("cronjob.operate.specRequired"));
        if (form.type === "curl" && form.urlItems.filter((u) => u.trim()).length === 0) {
            return toast.warning(t("cronjob.operate.urlRequired"));
        }
        const payload: CronjobOperate = {
            name: form.name.trim(),
            type: form.type,
            groupID: form.groupID,
            specCustom: form.specCustom,
            spec,
            retainCopies: hasBackup(form.type) ? form.retainCopies : undefined,
            timeout: form.timeout,
            retryTimes: form.retryTimes,
            ignoreErr: hasExclusion(form.type, form.isDir) ? form.ignoreErr : false,
        };
        if (target) payload.id = target.id;
        if (hasExclusion(form.type, form.isDir)) payload.exclusionRules = form.ignoreFiles.join(",");
        if (isWebsite(form.type)) payload.website = form.websiteList.join(",");
        if (form.type === "app") payload.appID = form.appIdList.join(",");
        if (form.type === "database") {
            payload.dbType = form.dbType;
            payload.dbName = form.dbNameList.join(",");
        }
        if (form.type === "directory") {
            payload.isDir = form.isDir;
            payload.sourceDir = form.isDir ? form.sourceDir : form.files.join(",");
        }
        if (form.type === "curl") payload.url = form.urlItems.filter((u) => u.trim()).join(",");
        if (form.type === "cleanLog") payload.scopes = form.scopes;
        if (form.type === "snapshot") payload.snapshotRule = { withImage: form.withImage, ignoreAppIDs: form.ignoreAppIDs };
        if (hasBackup(form.type)) payload.secret = form.secret;
        if (hasScript(form.type)) {
            payload.scriptMode = form.scriptMode;
            payload.script = form.scriptMode === "library" ? undefined : form.script;
            payload.scriptID = form.scriptMode === "library" ? form.scriptID : undefined;
            payload.executor = form.inContainer ? undefined : form.executor;
            payload.containerName = form.inContainer ? form.containerName : "";
            payload.command = form.inContainer ? form.command : undefined;
            payload.user = form.user;
        }
        try {
            if (target) {
                await update(payload).unwrap();
            } else {
                await create(payload).unwrap();
            }
            toast.success(t("cronjob.saveSuccess"));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const showBackup = hasBackup(form.type);
    const showExclusion = hasExclusion(form.type, form.isDir);

    return (
        <Sheet
            open={true}
            onOpenChange={(open) => {
                if (!open && !creating && !updating) onClose();
            }}
        >
            <SheetContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <SheetHeader>
                        <SheetTitle>
                            {isCreate ? t("cronjob.operate.create") : t("cronjob.operate.editTitle", { name: target?.name })}
                        </SheetTitle>
                    </SheetHeader>
                    <FieldGroup>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <Field label={t("cronjob.operate.taskType")}>
                                <NativeSelect
                                    disabled={!isCreate}
                                    style={{ width: "100%" }}
                                    value={form.type ?? ""}
                                    aria-label={t("common.select")}
                                    onChange={(event) =>
                                        ((v) => {
                                            const type = String(v);
                                            set({ type, specObjs: [defaultSpecObj(type)] });
                                        })(event.target.value)
                                    }
                                >
                                    {TASK_TYPES.map((v) => ({ label: t(`cronjob.types.${v}`), value: v })).map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </Field>
                            <Field label={t("cronjob.operate.name")}>
                                <Input
                                    disabled={!isCreate}
                                    required
                                    value={form.name ?? ""}
                                    onChange={(event) => set({ name: event.target.value })}
                                />
                            </Field>
                            <Field label={t("cronjob.operate.group")}>
                                <NativeSelect
                                    style={{ width: "100%" }}
                                    value={(form.groupID || undefined) ?? ""}
                                    aria-label={t("cronjob.operate.group")}
                                    onChange={(event) => set({ groupID: Number(event.target.value ?? 0) })}
                                >
                                    <NativeSelectOption value="">{t("cronjob.operate.group")}</NativeSelectOption>
                                    {groups
                                        .map((g) => ({
                                            label: g.name === "Default" ? t("cronjob.operate.defaultGroup") : g.name,
                                            value: g.id,
                                        }))
                                        .map((option) => (
                                            <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                {option.label}
                                            </NativeSelectOption>
                                        ))}
                                </NativeSelect>
                            </Field>

                            <ScheduleFields form={form} set={set} onPreview={onPreview} />
                            <TargetFields form={form} set={set} websites={websites} appOptions={appOptions} />
                            <ScriptFields form={form} set={set} containers={containers} scripts={scripts} />
                            {/* 备份 */}
                            {showBackup && (
                                <div
                                    style={{
                                        border: "1px solid var(--border)",
                                        borderRadius: 6,
                                        padding: 12,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 8,
                                    }}
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Field label={t("cronjob.operate.retainCopies")}>
                                            <Input
                                                min={1}
                                                style={{ width: 140 }}
                                                value={form.retainCopies ?? ""}
                                                type="number"
                                                required
                                                onChange={(event) =>
                                                    set({
                                                        retainCopies: Number(
                                                            (event.target.value === "" ? undefined : Number(event.target.value)) ?? 1,
                                                        ),
                                                    })
                                                }
                                            />
                                        </Field>
                                        {form.type !== "database" && (
                                            <Field label={t("cronjob.operate.secret")}>
                                                <Input
                                                    style={{ width: 200 }}
                                                    value={form.secret ?? ""}
                                                    type="password"
                                                    onChange={(event) => set({ secret: event.target.value })}
                                                />
                                            </Field>
                                        )}
                                    </div>
                                    <span className="text-muted-foreground">{t("cronjob.operate.backupHelper")}</span>
                                </div>
                            )}

                            {showExclusion && (
                                <Field label={t("cronjob.operate.exclude")}>
                                    <OptionPicker
                                        value={(form.ignoreFiles ?? []).map(String)}
                                        options={[]}
                                        multiple
                                        creatable
                                        searchable
                                        placeholder={t("cronjob.operate.excludeHelper")}
                                        onValueChange={(v) => set({ ignoreFiles: v as string[] })}
                                    />
                                </Field>
                            )}

                            {showExclusion && (
                                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                    <Switch checked={form.ignoreErr} onCheckedChange={(v) => set({ ignoreErr: v })} />
                                    <span>{t("cronjob.operate.ignoreErr")}</span>
                                </label>
                            )}

                            {!loaded && (
                                <Badge variant={["red"].includes("blue") ? "destructive" : "secondary"}>{t("common.loading")}</Badge>
                            )}
                        </div>
                        <Dialog
                            open={preview != null}
                            onOpenChange={(open) => {
                                if (!open && true) setPreview(null);
                            }}
                        >
                            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                                <div className="flex flex-col gap-4">
                                    <DialogHeader>
                                        <DialogTitle>{t("cronjob.operate.nextTime")}</DialogTitle>
                                    </DialogHeader>
                                    <FieldGroup>
                                        {previewTimes.length === 0 ? (
                                            <span className="text-muted-foreground">{t("cronjob.operate.previewEmpty")}</span>
                                        ) : (
                                            <div className="flex flex-col items-start gap-2">
                                                {previewTimes.map((time, i) => (
                                                    <span key={i}>{time}</span>
                                                ))}
                                            </div>
                                        )}
                                    </FieldGroup>
                                    {null}
                                </div>
                            </DialogContent>
                        </Dialog>
                    </FieldGroup>
                    {
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={onClose} type="button" variant="outline">
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" variant="default" disabled={creating || updating || !loaded}>
                                {creating || updating ? <Spinner data-icon="inline-start" /> : null}
                                {t("common.confirm")}
                            </Button>
                        </div>
                    }
                </form>
            </SheetContent>
        </Sheet>
    );
}
