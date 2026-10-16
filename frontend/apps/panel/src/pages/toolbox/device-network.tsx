import {
    useCheckDNSMutation,
    useLazyLoadDeviceConfQuery,
    useUpdateDeviceConfByFileMutation,
    useUpdateDeviceHostMutation,
    useUpdateDeviceMutation,
    type DeviceBaseInfo,
    type HostHelper,
} from "@/api/toolboxApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfigEditorModal, Field, errText } from "./shared";

export function DeviceConfigModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [loadConf] = useLazyLoadDeviceConfQuery();
    const [updateByFile] = useUpdateDeviceConfByFileMutation();
    return (
        <ConfigEditorModal
            title={t("toolbox.config.title")}
            onClose={onClose}
            tabs={[
                {
                    key: "resolve",
                    label: "/etc/resolv.conf",
                    load: () => loadConf({ name: "DNS" }).unwrap(),
                    save: (file) => updateByFile({ name: "DNS", file }).unwrap(),
                },
                {
                    key: "hosts",
                    label: "/etc/hosts",
                    load: () => loadConf({ name: "Hosts" }).unwrap(),
                    save: (file) => updateByFile({ name: "Hosts", file }).unwrap(),
                },
            ]}
        />
    );
}

export function DnsModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [value, setValue] = useState((base.dns || []).join("\n"));
    const [checkDNS, { isLoading: testing }] = useCheckDNSMutation();
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();

    const test = async () => {
        try {
            await checkDNS({ key: "form", value: value.replace(/\n/g, ",") }).unwrap();
            toast.success(t("toolbox.device.dnsOk"));
        } catch {
            toast.error(t("toolbox.device.dnsTestFailed"));
        }
    };
    const save = async () => {
        try {
            await updateDevice({ key: "DNS", value: value.replace(/\n/g, ",") }).unwrap();
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
                        <DialogTitle>{"DNS"}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label="DNS" help={t("toolbox.device.dnsHelper")}>
                            <Textarea
                                placeholder={"114.114.114.114&#10;8.8.8.8"}
                                value={value ?? ""}
                                onChange={(event) => setValue(event.target.value)}
                            />
                        </Field>
                        <Button style={{ marginTop: 12 }} onClick={test} type="button" variant="outline" disabled={testing}>
                            {testing ? <Spinner data-icon="inline-start" /> : null}
                            {t("toolbox.device.dnsTest")}
                        </Button>
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

export function HostsModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [rows, setRows] = useState<HostHelper[]>(base.hosts?.length ? base.hosts : [{ ip: "", host: "" }]);
    const [updateHost, { isLoading }] = useUpdateDeviceHostMutation();

    const setRow = (i: number, key: keyof HostHelper, v: string) =>
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

    const save = async () => {
        const list = rows.filter((r) => r.ip.trim() || r.host.trim());
        if (list.some((r) => !r.ip.trim() || !r.host.trim())) {
            toast.error(t("toolbox.device.hostRequired"));
            return;
        }
        try {
            await updateHost(list).unwrap();
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
                        <DialogTitle>{"Hosts"}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <span className="text-muted-foreground">{t("toolbox.device.hostsHelper")}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
                            {rows.map((row, i) => (
                                <div key={i} style={{ width: "100%" }} className="flex flex-wrap items-center gap-2">
                                    <Input
                                        style={{ width: 240 }}
                                        placeholder={t("toolbox.device.hostPlaceholder")}
                                        value={row.ip ?? ""}
                                        onChange={(event) => setRow(i, "ip", event.target.value)}
                                    />
                                    <Input
                                        style={{ width: 240 }}
                                        placeholder={t("toolbox.device.hostNamePlaceholder")}
                                        value={row.host ?? ""}
                                        onChange={(event) => setRow(i, "host", event.target.value)}
                                    />
                                    <Button
                                        onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                                        type="button"
                                        variant="destructive"
                                    >
                                        {<XIcon data-icon="inline-start" />}
                                    </Button>
                                </div>
                            ))}
                            <Button
                                style={{ alignSelf: "flex-start" }}
                                onClick={() => setRows((prev) => [...prev, { ip: "", host: "" }])}
                                type="button"
                                variant="ghost"
                            >
                                {<PlusIcon data-icon="inline-start" />}
                                {t("toolbox.actions.add")}
                            </Button>
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
