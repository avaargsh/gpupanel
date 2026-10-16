import {
    useLoadTimeZoneOptionsQuery,
    useLoadUsersQuery,
    useUpdateDeviceMutation,
    useUpdateDevicePasswdMutation,
    type DeviceBaseInfo,
} from "@/api/toolboxApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Field, errText } from "./shared";

export function HostnameModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [value, setValue] = useState(base.hostname);
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();
    const save = async () => {
        try {
            await updateDevice({ key: "Hostname", value }).unwrap();
            toast.success(t("toolbox.device.saved"));
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
                        <DialogTitle>{t("toolbox.device.hostname")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label={t("toolbox.device.hostname")}>
                            <Input value={value ?? ""} onChange={(event) => setValue(event.target.value)} />
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={isLoading} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.actions.save")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function PasswdModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data: users = [] } = useLoadUsersQuery();
    const [user, setUser] = useState(base.user);
    const [passwd, setPasswd] = useState("");
    const [confirm, setConfirm] = useState("");
    const [updatePasswd, { isLoading }] = useUpdateDevicePasswdMutation();

    const save = async () => {
        if (!passwd) {
            toast.error(t("toolbox.device.passwdHelper"));
            return;
        }
        if (passwd !== confirm) {
            toast.error(t("toolbox.device.passwordMismatch"));
            return;
        }
        try {
            await updatePasswd({ user, passwd }).unwrap();
            toast.success(t("toolbox.device.passwordChanged"));
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
                        <DialogTitle>{t("toolbox.device.passwd")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <div className="flex flex-col gap-3.5">
                            <Field label={t("toolbox.device.user")}>
                                <NativeSelect
                                    className="w-full"
                                    value={user ?? ""}
                                    aria-label={t("common.select")}
                                    onChange={(event) => setUser(String(event.target.value))}
                                >
                                    {users
                                        .map((u) => ({ label: u, value: u }))
                                        .map((option) => (
                                            <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                {option.label}
                                            </NativeSelectOption>
                                        ))}
                                </NativeSelect>
                            </Field>
                            <Field label={t("toolbox.device.newPassword")} help={t("toolbox.device.passwdHelper")}>
                                <Input value={passwd ?? ""} type="password" onChange={(event) => setPasswd(event.target.value)} />
                            </Field>
                            <Field label={t("toolbox.device.confirmPassword")}>
                                <Input value={confirm ?? ""} type="password" onChange={(event) => setConfirm(event.target.value)} />
                            </Field>
                        </div>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={isLoading} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.actions.save")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function NtpModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [value, setValue] = useState(base.ntp);
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();
    const presets = ["ntp.aliyun.com", "time.google.com"];
    const save = async () => {
        try {
            await updateDevice({ key: "Ntp", value }).unwrap();
            toast.success(t("toolbox.device.saved"));
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
                        <DialogTitle>{t("toolbox.device.syncSite")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label={t("toolbox.device.syncSite")}>
                            <div className="flex flex-wrap items-center gap-2">
                                <Input className="w-[280px]" value={value ?? ""} onChange={(event) => setValue(event.target.value)} />
                                {presets.map((p) => (
                                    <Button key={p} onClick={() => setValue(p)} type="button" variant="ghost">
                                        {p}
                                    </Button>
                                ))}
                            </div>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={isLoading} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.actions.save")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function TimeZoneModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data: zones = [] } = useLoadTimeZoneOptionsQuery();
    const [value, setValue] = useState(base.timeZone);
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();
    const save = async () => {
        try {
            await updateDevice({ key: "TimeZone", value }).unwrap();
            toast.success(t("toolbox.device.saved"));
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
                        <DialogTitle>{t("toolbox.device.timeZone")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label={t("toolbox.device.timeZone")} help={t("toolbox.device.timeZoneHelper")}>
                            <NativeSelect
                                className="w-full"
                                value={value ?? ""}
                                aria-label={t("common.select")}
                                onChange={(event) => setValue(String(event.target.value))}
                            >
                                {zones
                                    .map((z) => ({ label: z, value: z }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={isLoading} onClick={() => onClose()}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.actions.save")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
