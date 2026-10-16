import { useCreateSnapshotMutation, useListBackupOptionsQuery, useLoadSnapshotDataQuery } from "@/api/settingsApi";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { OptionPicker } from "./option-picker";
import { Field, errText } from "./shared";

export interface CreateForm {
    description: string;
    sourceAccountIDs: number[];
    downloadAccountID: number | null;
    secret: string;
    timeout: number;
    withDockerConf: boolean;
    withMonitorData: boolean;
    withLoginLog: boolean;
    withOperationLog: boolean;
    withSystemLog: boolean;
    withTaskLog: boolean;
}

export function SnapshotCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data: options } = useListBackupOptionsQuery();
    const { data: snapshotData } = useLoadSnapshotDataQuery();
    const [create, { isLoading }] = useCreateSnapshotMutation();

    const [form, setForm] = useState<CreateForm>({
        description: "",
        sourceAccountIDs: [],
        downloadAccountID: null,
        secret: "",
        timeout: 3600,
        withDockerConf: snapshotData?.withDockerConf ?? true,
        withMonitorData: snapshotData?.withMonitorData ?? false,
        withLoginLog: snapshotData?.withLoginLog ?? false,
        withOperationLog: snapshotData?.withOperationLog ?? false,
        withSystemLog: snapshotData?.withSystemLog ?? false,
        withTaskLog: snapshotData?.withTaskLog ?? false,
    });

    const accounts = options ?? [];
    const sourceOptions = accounts.filter((a) => a.type !== "LOCAL");
    const downloadOptions = accounts.filter((a) => a.type === "LOCAL" || form.sourceAccountIDs.includes(a.id));

    const save = async () => {
        if (form.sourceAccountIDs.length === 0) {
            toast.error(t("settings.snapshot.sourceRequired"));
            return;
        }
        if (!form.downloadAccountID) {
            toast.error(t("settings.snapshot.downloadRequired"));
            return;
        }
        try {
            await create({
                sourceAccountIDs: form.sourceAccountIDs.join(","),
                downloadAccountID: form.downloadAccountID,
                description: form.description,
                secret: form.secret,
                timeout: form.timeout,
                appData: snapshotData?.appData ?? [],
                panelData: snapshotData?.panelData ?? [],
                backupData: snapshotData?.backupData ?? [],
                withDockerConf: form.withDockerConf,
                withMonitorData: form.withMonitorData,
                withLoginLog: form.withLoginLog,
                withOperationLog: form.withOperationLog,
                withSystemLog: form.withSystemLog,
                withTaskLog: form.withTaskLog,
            }).unwrap();
            toast.success(t("settings.snapshot.created"));
            onSaved();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !isLoading) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!isLoading) void save();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t("settings.snapshot.create")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label={t("settings.snapshot.description")}>
                            <Input
                                maxLength={256}
                                value={form.description ?? ""}
                                onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
                            />
                        </Field>
                        <Field label={t("settings.snapshot.source")} help={t("settings.snapshot.sourceHelper")}>
                            <OptionPicker
                                value={(form.sourceAccountIDs ?? []).map(String)}
                                options={sourceOptions.map((a) => ({ value: a.id, label: a.name }))}
                                multiple
                                onValueChange={(v) =>
                                    setForm((f) => {
                                        const ids = v.map(Number);
                                        const download =
                                            f.downloadAccountID && downloadOptions.some((a) => a.id === f.downloadAccountID)
                                                ? f.downloadAccountID
                                                : (ids[0] ?? null);
                                        return { ...f, sourceAccountIDs: ids, downloadAccountID: download };
                                    })
                                }
                            />
                        </Field>
                        <Field label={t("settings.snapshot.download")} help={t("settings.snapshot.downloadHelper")}>
                            <NativeSelect
                                style={{ width: "100%" }}
                                value={form.downloadAccountID ?? ""}
                                aria-label={t("common.select")}
                                onChange={(event) => setForm((f) => ({ ...f, downloadAccountID: Number(event.target.value) }))}
                            >
                                {downloadOptions
                                    .map((a) => ({ value: a.id, label: a.name }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
                        </Field>
                        <Field label={t("settings.snapshot.secret")} help={t("settings.snapshot.secretHelper")}>
                            <Input
                                value={form.secret ?? ""}
                                type="password"
                                onChange={(event) => setForm((f) => ({ ...f, secret: event.target.value }))}
                            />
                        </Field>
                        <Field label={t("settings.snapshot.timeout")}>
                            <Input
                                min={60}
                                step={60}
                                value={form.timeout ?? ""}
                                type="number"
                                required
                                onChange={(event) =>
                                    setForm((f) => ({
                                        ...f,
                                        timeout: Number((event.target.value === "" ? undefined : Number(event.target.value)) ?? 3600),
                                    }))
                                }
                            />
                        </Field>
                        <Field label={t("settings.snapshot.data")}>
                            <div style={{ gap: 8 }} className="flex flex-col items-start gap-2">
                                <label className="flex items-center gap-2">
                                    <Checkbox
                                        checked={form.withDockerConf}
                                        onCheckedChange={(e) => setForm((f) => ({ ...f, withDockerConf: !!e }))}
                                    />
                                    {t("settings.snapshot.withDockerConf")}
                                </label>
                                <label className="flex items-center gap-2">
                                    <Checkbox
                                        checked={form.withMonitorData}
                                        onCheckedChange={(e) => setForm((f) => ({ ...f, withMonitorData: !!e }))}
                                    />
                                    {t("settings.snapshot.withMonitorData")}
                                </label>
                                <label className="flex items-center gap-2">
                                    <Checkbox
                                        checked={form.withLoginLog}
                                        onCheckedChange={(e) => setForm((f) => ({ ...f, withLoginLog: !!e }))}
                                    />
                                    {t("settings.snapshot.withLoginLog")}
                                </label>
                                <label className="flex items-center gap-2">
                                    <Checkbox
                                        checked={form.withOperationLog}
                                        onCheckedChange={(e) => setForm((f) => ({ ...f, withOperationLog: !!e }))}
                                    />
                                    {t("settings.snapshot.withOperationLog")}
                                </label>
                            </div>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={isLoading} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t("common.confirm")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
