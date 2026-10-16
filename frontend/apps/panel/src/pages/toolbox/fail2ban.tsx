import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmAction } from "@/components/use-confirm-action";
import { FileIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
    useGetFail2banBaseQuery,
    useLazyLoadFail2banConfQuery,
    useOperateFail2banMutation,
    useOperateFail2banSSHDMutation,
    useSearchFail2banQuery,
    useUpdateFail2banConfByFileMutation,
    useUpdateFail2banMutation,
    type Fail2banUpdate,
} from "@/api/toolboxApi";
import { useTranslation } from "react-i18next";
import { ConfigEditorModal, Field, SettingRow, errText } from "./shared";

const UNITS = ["s", "m", "h", "d", "y"];
const BAN_ACTIONS = ["iptables-allports", "iptables-multiport", "firewallcmd-ipset", "ufw"];

type ConfigKind = Fail2banUpdate["key"];

function splitDuration(value: string): { num: number; unit: string } {
    const m = /^(-?\d+)\s*([smhdy])?$/.exec((value || "").trim());
    if (!m) return { num: 0, unit: "m" };
    return { num: Number(m[1]), unit: m[2] || "s" };
}

function ConfigEditModal({ kind, value, onClose, onSaved }: { kind: ConfigKind; value: string; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [updateFail2ban, { isLoading }] = useUpdateFail2banMutation();
    const duration = splitDuration(value);
    const isDuration = kind === "bantime" || kind === "findtime";
    const [num, setNum] = useState(duration.num);
    const [unit, setUnit] = useState(duration.unit);
    const [text, setText] = useState(value);
    const permanent = isDuration && num === -1;

    const save = async () => {
        let v: string;
        if (isDuration) v = permanent ? "-1" : `${num}${unit}`;
        else v = text;
        try {
            await updateFail2ban({ key: kind, value: v }).unwrap();
            toast.success(t("toolbox.fail2ban.saved"));
            onSaved();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const titleKey: Record<ConfigKind, string> = {
        port: "toolbox.fail2ban.sshPort",
        maxretry: "toolbox.fail2ban.maxRetry",
        bantime: "toolbox.fail2ban.banTime",
        findtime: "toolbox.fail2ban.findTime",
        banaction: "toolbox.fail2ban.banAction",
        logpath: "toolbox.fail2ban.logPath",
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
                        <DialogTitle>{t(titleKey[kind])}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        {kind === "port" && (
                            <Field label={t("toolbox.fail2ban.sshPort")} help={t("toolbox.fail2ban.sshPortHelper")}>
                                <Input
                                    min={1}
                                    max={65535}
                                    style={{ width: 200 }}
                                    value={(Number(text) || 0) ?? ""}
                                    type="number"
                                    required
                                    onChange={(event) =>
                                        setText(String(event.target.value === "" ? undefined : Number(event.target.value)))
                                    }
                                />
                            </Field>
                        )}
                        {kind === "maxretry" && (
                            <Field label={t("toolbox.fail2ban.maxRetry")}>
                                <Input
                                    min={1}
                                    style={{ width: 200 }}
                                    value={(Number(text) || 0) ?? ""}
                                    type="number"
                                    required
                                    onChange={(event) =>
                                        setText(String(event.target.value === "" ? undefined : Number(event.target.value)))
                                    }
                                />
                            </Field>
                        )}
                        {isDuration && (
                            <Field label={t(titleKey[kind])} help={t("toolbox.fail2ban.banTimeHelper")}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        disabled={permanent}
                                        style={{ width: 160 }}
                                        value={num ?? ""}
                                        type="number"
                                        required
                                        onChange={(event) =>
                                            setNum(
                                                (event.target.value === "" ? undefined : Number(event.target.value)) === undefined ||
                                                    (event.target.value === "" ? undefined : Number(event.target.value)) === null
                                                    ? 0
                                                    : Number(event.target.value === "" ? undefined : Number(event.target.value)),
                                            )
                                        }
                                    />
                                    <NativeSelect
                                        disabled={permanent}
                                        style={{ width: 120 }}
                                        value={unit ?? ""}
                                        aria-label={t("common.select")}
                                        onChange={(event) => setUnit(String(event.target.value))}
                                    >
                                        {UNITS.map((u) => ({ label: t("toolbox.fail2ban.unit" + u.toUpperCase(), u), value: u })).map(
                                            (option) => (
                                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                    {option.label}
                                                </NativeSelectOption>
                                            ),
                                        )}
                                    </NativeSelect>
                                </div>
                            </Field>
                        )}
                        {isDuration && (
                            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, cursor: "pointer" }}>
                                <Switch checked={permanent} onCheckedChange={(v) => setNum(v ? -1 : 0)} />
                                <span>{t("toolbox.fail2ban.permanent")}</span>
                            </label>
                        )}
                        {kind === "banaction" && (
                            <Field label={t("toolbox.fail2ban.banAction")}>
                                <NativeSelect
                                    style={{ width: "100%" }}
                                    value={text ?? ""}
                                    aria-label={t("common.select")}
                                    onChange={(event) => setText(String(event.target.value))}
                                >
                                    {BAN_ACTIONS.map((a) => ({ label: a, value: a })).map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </Field>
                        )}
                        {kind === "logpath" && (
                            <Field label={t("toolbox.fail2ban.logPath")} help={t("toolbox.fail2ban.logPathHelper")}>
                                <Input value={text ?? ""} onChange={(event) => setText(event.target.value)} />
                            </Field>
                        )}
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

function IpListModal({ operate, onClose, onSaved }: { operate: "ignore" | "banned"; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data = [], isFetching } = useSearchFail2banQuery({ status: operate });
    const [value, setValue] = useState<string | null>(null);
    const [save, { isLoading }] = useOperateFail2banSSHDMutation();

    const text = value ?? (data || []).join("\n");

    const onSave = async () => {
        const ips = text
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
        try {
            await save({ ips, operate }).unwrap();
            toast.success(t("toolbox.fail2ban.saved"));
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
                        if (!isLoading) void onSave();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{operate === "ignore" ? t("toolbox.fail2ban.ignoreIP") : t("toolbox.fail2ban.bannedIP")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Field label={t("toolbox.fail2ban.ipHelper")}>
                            <Textarea disabled={isFetching} value={text ?? ""} onChange={(event) => setValue(event.target.value)} />
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

/** Fail2ban 原始配置文件（jail.local）。 */
function Fail2banConfModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [loadConf] = useLazyLoadFail2banConfQuery();
    const [updateByFile] = useUpdateFail2banConfByFileMutation();
    return (
        <ConfigEditorModal
            title={t("toolbox.config.fail2ban")}
            onClose={onClose}
            tabs={[
                {
                    key: "jail",
                    label: "/etc/fail2ban/jail.local",
                    load: () => loadConf().unwrap(),
                    save: (file) => updateByFile({ file }).unwrap(),
                },
            ]}
        />
    );
}

export default function Fail2banTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const { data, isFetching, refetch } = useGetFail2banBaseQuery();
    const [operate] = useOperateFail2banMutation();
    const [configKind, setConfigKind] = useState<ConfigKind | null>(null);
    const [ipKind, setIpKind] = useState<"ignore" | "banned" | null>(null);
    const [confOpen, setConfOpen] = useState(false);

    if (!data) {
        return (
            <div style={{ padding: 24 }}>
                <span className="text-muted-foreground">{isFetching ? t("common.loading") : t("common.empty")}</span>
            </div>
        );
    }

    if (!data.isExist) {
        return (
            <div style={{ padding: 24 }}>
                <span className="text-muted-foreground">{t("toolbox.fail2ban.notInstalled")}</span>
            </div>
        );
    }

    const onOperate = (operation: string) => {
        confirm({
            title: t("toolbox.actions." + operation, operation),
            description: t("toolbox.fail2ban.operationConfirm", { op: t("toolbox.actions." + operation, operation) }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await operate({ operation }).unwrap();
                    toast.success(t("toolbox.fail2ban.saved"));
                    refetch();
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
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <Badge variant={["red"].includes("green") ? "destructive" : "secondary"}>Fail2ban</Badge>
                        <Badge variant={["red"].includes(data.isActive ? "green" : "grey") ? "destructive" : "secondary"}>
                            {data.isActive ? t("toolbox.actions.enable") : t("toolbox.actions.disable")}
                        </Badge>
                        <Badge variant={"secondary"}>
                            {t("toolbox.fail2ban.version")}: {data.version}
                        </Badge>
                        <Button onClick={() => onOperate(data.isActive ? "stop" : "start")} type="button" variant="ghost">
                            {data.isActive ? t("toolbox.fail2ban.stop") : t("toolbox.fail2ban.start")}
                        </Button>
                        <Button onClick={() => onOperate("restart")} type="button" variant="ghost">
                            {t("toolbox.fail2ban.restart")}
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                            <span>{t("toolbox.fail2ban.autoStart")}</span>
                            <Switch checked={data.isEnable} onCheckedChange={(v) => onOperate(v ? "enable" : "disable")} />
                        </div>
                        <Button onClick={() => refetch()} type="button" variant="ghost" disabled={isFetching}>
                            {isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                            {t("toolbox.actions.refresh")}
                        </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={() => setIpKind("ignore")} type="button" variant="default" disabled={!data.isActive}>
                            {t("toolbox.fail2ban.ignoreIP")}
                        </Button>
                        <Button onClick={() => setIpKind("banned")} type="button" variant="outline" disabled={!data.isActive}>
                            {t("toolbox.fail2ban.bannedIP")}
                        </Button>
                        <Button onClick={() => setConfOpen(true)} type="button" variant="outline">
                            {<FileIcon data-icon="inline-start" />}
                            {t("toolbox.config.title")}
                        </Button>
                    </div>

                    <div style={{ maxWidth: 900 }}>
                        <SettingRow
                            label={t("toolbox.fail2ban.sshPort")}
                            value={<span>{data.port}</span>}
                            setLabel={t("toolbox.actions.set")}
                            onSet={() => setConfigKind("port")}
                        />
                        <SettingRow
                            label={t("toolbox.fail2ban.maxRetry")}
                            value={<span>{data.maxRetry}</span>}
                            setLabel={t("toolbox.actions.set")}
                            onSet={() => setConfigKind("maxretry")}
                        />
                        <SettingRow
                            label={t("toolbox.fail2ban.banTime")}
                            value={<span>{data.banTime}</span>}
                            setLabel={t("toolbox.actions.set")}
                            onSet={() => setConfigKind("bantime")}
                        />
                        <SettingRow
                            label={t("toolbox.fail2ban.findTime")}
                            value={<span>{data.findTime}</span>}
                            setLabel={t("toolbox.actions.set")}
                            onSet={() => setConfigKind("findtime")}
                        />
                        <SettingRow
                            label={t("toolbox.fail2ban.banAction")}
                            value={<span>{data.banAction}</span>}
                            setLabel={t("toolbox.actions.set")}
                            onSet={() => setConfigKind("banaction")}
                        />
                        <SettingRow
                            label={t("toolbox.fail2ban.logPath")}
                            value={<span>{data.logPath}</span>}
                            setLabel={t("toolbox.actions.set")}
                            onSet={() => setConfigKind("logpath")}
                        />
                    </div>

                    {configKind && (
                        <ConfigEditModal
                            kind={configKind}
                            value={
                                configKind === "port"
                                    ? String(data.port)
                                    : configKind === "maxretry"
                                      ? String(data.maxRetry)
                                      : configKind === "bantime"
                                        ? data.banTime
                                        : configKind === "findtime"
                                          ? data.findTime
                                          : configKind === "banaction"
                                            ? data.banAction
                                            : data.logPath
                            }
                            onClose={() => setConfigKind(null)}
                            onSaved={() => {
                                setConfigKind(null);
                                refetch();
                            }}
                        />
                    )}
                    {ipKind && (
                        <IpListModal
                            operate={ipKind}
                            onClose={() => setIpKind(null)}
                            onSaved={() => {
                                setIpKind(null);
                                refetch();
                            }}
                        />
                    )}
                    {confOpen && <Fail2banConfModal onClose={() => setConfOpen(false)} />}
                </div>
            }
        </>
    );
}
