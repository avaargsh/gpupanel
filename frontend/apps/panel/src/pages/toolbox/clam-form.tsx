import { useCreateClamMutation, useUpdateClamMutation, type ClamInfo } from "@/api/toolboxApi";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { defaultSpecObj, transObjToSpec, transSpecToObj, weekLabel, weekOptions } from "@/pages/cronjob/helper";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Field, errText } from "./shared";

export const specTypeOptions = ["perMonth", "perWeek", "perDay", "perHour", "perNDay", "perNHour", "perNMinute", "perNSecond"];

export const INFECTED_STRATEGIES = ["none", "move", "copy"];

export function SpecEditor({
    value,
    onChange,
}: {
    value: { specType: string; week: number; day: number; hour: number; minute: number; second: number };
    onChange: (v: ReturnType<typeof defaultSpecObj>) => void;
}) {
    const { t } = useTranslation();
    const type = value.specType;
    const patch = (p: Partial<typeof value>) => onChange({ ...value, ...p });

    return (
        <div className="flex flex-col gap-2.5">
            <NativeSelect
                className="w-full"
                value={type ?? ""}
                aria-label={t("common.select")}
                onChange={(event) => onChange(defaultSpecObj(String(event.target.value)))}
            >
                {specTypeOptions
                    .map((s) => ({ label: t("cronjob." + s), value: s }))
                    .map((option) => (
                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
            </NativeSelect>
            <div className="flex flex-wrap items-center gap-2">
                {type === "perWeek" && (
                    <NativeSelect
                        className="w-[140px]"
                        value={value.week ?? ""}
                        aria-label={t("common.select")}
                        onChange={(event) => patch({ week: Number(event.target.value) })}
                    >
                        {weekOptions
                            .map((w) => ({ label: weekLabel(t, w), value: w }))
                            .map((option) => (
                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                    </NativeSelect>
                )}
                {["perMonth", "perWeek", "perNDay"].includes(type) && (
                    <div className="flex items-center gap-2">
                        <Input
                            min={1}
                            max={31}
                            className="w-[160px]"
                            value={value.day ?? ""}
                            type="number"
                            required
                            onChange={(event) =>
                                patch({ day: Number(event.target.value === "" ? undefined : Number(event.target.value)) || 1 })
                            }
                        />
                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.day")}</span>
                    </div>
                )}
                {["perMonth", "perWeek", "perDay", "perNDay", "perNHour"].includes(type) && (
                    <div className="flex items-center gap-2">
                        <Input
                            min={0}
                            max={23}
                            className="w-[160px]"
                            value={value.hour ?? ""}
                            type="number"
                            required
                            onChange={(event) =>
                                patch({ hour: Number(event.target.value === "" ? undefined : Number(event.target.value)) || 0 })
                            }
                        />
                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.hour")}</span>
                    </div>
                )}
                {type !== "perNSecond" && (
                    <div className="flex items-center gap-2">
                        <Input
                            min={0}
                            max={59}
                            className="w-[160px]"
                            value={value.minute ?? ""}
                            type="number"
                            required
                            onChange={(event) =>
                                patch({ minute: Number(event.target.value === "" ? undefined : Number(event.target.value)) || 0 })
                            }
                        />
                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.minute")}</span>
                    </div>
                )}
                {type === "perNSecond" && (
                    <div className="flex items-center gap-2">
                        <Input
                            min={1}
                            max={59}
                            className="w-[160px]"
                            value={value.second ?? ""}
                            type="number"
                            required
                            onChange={(event) =>
                                patch({ second: Number(event.target.value === "" ? undefined : Number(event.target.value)) || 1 })
                            }
                        />
                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.second")}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export function ClamFormModal({ target, onClose, onSaved }: { target: ClamInfo | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [name, setName] = useState(target?.name ?? "");
    const [path, setPath] = useState(target?.path ?? "/");
    const [strategy, setStrategy] = useState(target?.infectedStrategy ?? "none");
    const [infectedDir, setInfectedDir] = useState(target?.infectedDir ?? "/");
    const [specObj, setSpecObj] = useState(() => transSpecToObj(target?.spec ?? "") ?? defaultSpecObj("perDay"));
    const timeoutInit = useMemo(() => {
        const sec = Number(target?.timeout ?? 1800);
        if (sec % 3600 === 0) return { v: sec / 3600, u: "h" };
        if (sec % 60 === 0) return { v: sec / 60, u: "m" };
        return { v: sec, u: "s" };
    }, [target]);
    const [timeoutValue, setTimeoutValue] = useState(timeoutInit.v);
    const [timeoutUnit, setTimeoutUnit] = useState(timeoutInit.u);
    const [description, setDescription] = useState(target?.description ?? "");
    const [create, { isLoading: creating }] = useCreateClamMutation();
    const [update, { isLoading: updating }] = useUpdateClamMutation();

    const save = async () => {
        if (!name.trim()) {
            toast.error(t("toolbox.clam.nameRequired"));
            return;
        }
        if (!path.trim()) {
            toast.error(t("toolbox.clam.pathRequired"));
            return;
        }
        if (strategy !== "none" && !infectedDir.trim()) {
            toast.error(t("toolbox.clam.infectedDirRequired"));
            return;
        }
        const spec = transObjToSpec(specObj.specType, specObj.week, specObj.day, specObj.hour, specObj.minute, specObj.second);
        const timeout = Math.round(timeoutValue * (timeoutUnit === "h" ? 3600 : timeoutUnit === "m" ? 60 : 1));
        try {
            if (isEdit && target) {
                await update({ id: target.id, name, path, infectedStrategy: strategy, infectedDir, spec, timeout, description }).unwrap();
            } else {
                await create({
                    name,
                    status: "Enable",
                    path,
                    infectedStrategy: strategy,
                    infectedDir,
                    spec,
                    timeout,
                    description,
                }).unwrap();
            }
            toast.success(t("toolbox.clam.saved"));
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
                        <DialogTitle>{isEdit ? t("toolbox.clam.edit") : t("toolbox.clam.create")}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <div className="flex flex-col gap-3.5">
                            <Field label={t("toolbox.clam.name")}>
                                <Input required value={name ?? ""} onChange={(event) => setName(event.target.value)} />
                            </Field>
                            <Field label={t("toolbox.clam.scanDir")}>
                                <Input value={path ?? ""} onChange={(event) => setPath(event.target.value)} />
                            </Field>
                            <Field label={t("toolbox.clam.infectedStrategy")}>
                                <NativeSelect
                                    className="w-full"
                                    value={strategy ?? ""}
                                    aria-label={t("common.select")}
                                    onChange={(event) => setStrategy(String(event.target.value))}
                                >
                                    {INFECTED_STRATEGIES.map((s) => ({ label: t("toolbox.clam." + s), value: s })).map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </Field>
                            {strategy !== "none" && (
                                <Field label={t("toolbox.clam.infectedDir")}>
                                    <Input value={infectedDir ?? ""} onChange={(event) => setInfectedDir(event.target.value)} />
                                </Field>
                            )}
                            <Field label={t("toolbox.clam.spec")}>
                                <SpecEditor value={specObj} onChange={setSpecObj} />
                            </Field>
                            <Field label={t("toolbox.clam.timeout")}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                        min={1}
                                        className="w-[160px]"
                                        value={timeoutValue ?? ""}
                                        type="number"
                                        required
                                        onChange={(event) =>
                                            setTimeoutValue(Number(event.target.value === "" ? undefined : Number(event.target.value)) || 1)
                                        }
                                    />
                                    <NativeSelect
                                        className="w-[120px]"
                                        value={timeoutUnit ?? ""}
                                        aria-label={t("common.select")}
                                        onChange={(event) => setTimeoutUnit(String(event.target.value))}
                                    >
                                        {[
                                            { label: t("toolbox.fail2ban.unitSecond"), value: "s" },
                                            { label: t("toolbox.fail2ban.unitMinute"), value: "m" },
                                            { label: t("toolbox.fail2ban.unitHour"), value: "h" },
                                        ].map((option) => (
                                            <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                {option.label}
                                            </NativeSelectOption>
                                        ))}
                                    </NativeSelect>
                                </div>
                            </Field>
                            <Field label={t("toolbox.clam.description")}>
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
