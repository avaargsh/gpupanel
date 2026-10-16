import { useCreateAlertMutation, useUpdateAlertMutation, type AlertCreate, type AlertRule } from "@/api/settingsApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { errText, Field } from "./shared";

export const ALERT_TYPES = [
    "sshLogin",
    "ssl",
    "siteEndTime",
    "cpu",
    "memory",
    "disk",
    "load",
    "clams",
    "shell",
    "app",
    "website",
    "database",
    "directory",
    "log",
    "snapshot",
    "curl",
    "cutWebsiteLog",
    "clean",
    "ntp",
];

export const ALERT_METHODS = ["email", "webhook", "sms"];

export function AlertFormModal({ target, onClose, onSaved }: { target: AlertRule | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [form, setForm] = useState<AlertCreate>({
        title: target?.title ?? "",
        type: target?.type ?? "cpu",
        method: target?.method ?? "email",
        project: target?.project ?? "",
        cycle: target?.cycle ?? 5,
        count: target?.count ?? 3,
        status: target?.status ?? "Enable",
        sendCount: target?.sendCount ?? 0,
        advancedParams: target?.advancedParams ?? "",
    });
    const [create, { isLoading: creating }] = useCreateAlertMutation();
    const [update, { isLoading: updating }] = useUpdateAlertMutation();

    const save = async () => {
        if (!form.title.trim()) {
            toast.error(t("settings.alert.titleRequired"));
            return;
        }
        try {
            if (isEdit && target) await update({ ...form, id: target.id }).unwrap();
            else await create(form).unwrap();
            toast.success(t("settings.saved"));
            onSaved();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const saving = creating || updating;

    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next && !saving) onClose();
            }}
        >
            <DialogContent className="sm:max-w-lg">
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        (() => void save())();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{isEdit ? t("settings.alert.edit") : t("settings.alert.add")}</DialogTitle>
                    </DialogHeader>
                    <Field label={t("settings.alert.ruleTitle")}>
                        <Input required value={form.title} onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))} />
                    </Field>
                    <Field label={t("settings.alert.type")}>
                        <NativeSelect
                            className="w-full"
                            aria-label={t("settings.alert.type")}
                            value={form.type}
                            onChange={(event) => setForm((f) => ({ ...f, type: event.target.value }))}
                        >
                            {ALERT_TYPES.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {t(`settings.alert.typeLabel.${value}`, value)}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field label={t("settings.alert.method")}>
                        <NativeSelect
                            className="w-full"
                            aria-label={t("settings.alert.method")}
                            value={form.method}
                            onChange={(event) => setForm((f) => ({ ...f, method: event.target.value }))}
                        >
                            {ALERT_METHODS.map((value) => (
                                <NativeSelectOption key={value} value={value}>
                                    {t(`settings.alert.methodLabel.${value}`, value)}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field label={t("settings.alert.project")}>
                        <Input value={form.project} onChange={(event) => setForm((f) => ({ ...f, project: event.target.value }))} />
                    </Field>
                    <Field label={t("settings.alert.cycle")} help={t("settings.alert.cycleHelper")}>
                        <Input
                            type="number"
                            required
                            min={1}
                            value={String(form.cycle)}
                            onChange={(event) => setForm((f) => ({ ...f, cycle: Number(event.target.value || 1) }))}
                        />
                    </Field>
                    <Field label={t("settings.alert.count")} help={t("settings.alert.countHelper")}>
                        <Input
                            type="number"
                            required
                            min={1}
                            value={String(form.count)}
                            onChange={(event) => setForm((f) => ({ ...f, count: Number(event.target.value || 1) }))}
                        />
                    </Field>
                    <Field label={t("settings.alert.advancedParams")} help={t("settings.alert.advancedParamsHelper")}>
                        <Textarea
                            rows={3}
                            value={form.advancedParams}
                            onChange={(event) => setForm((f) => ({ ...f, advancedParams: event.target.value }))}
                        />
                    </Field>
                    <Field label={t("settings.alert.status")}>
                        <Switch
                            checked={form.status === "Enable"}
                            aria-label={t("settings.alert.status")}
                            onCheckedChange={(checked) => setForm((f) => ({ ...f, status: checked ? "Enable" : "Disable" }))}
                        />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? <Spinner data-icon="inline-start" /> : null}
                            {t("common.confirm")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
