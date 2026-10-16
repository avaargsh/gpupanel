import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type FormState } from "./operate-model";

import { useTranslation } from "react-i18next";
import { defaultSpecObj, specTypes, transObjToSpec, weekLabel, weekOptions } from "./helper";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export function ScheduleFields({
    form,
    set,
    onPreview,
}: {
    form: FormState;
    set: (patch: Partial<FormState>) => void;
    onPreview: (spec: string) => Promise<unknown>;
}) {
    const { t } = useTranslation();
    return (
        <>
            {/* 执行周期 */}
            <div className="subpanel">
                <div className="flex items-center justify-between">
                    <strong>{t("cronjob.operate.cronSpec")}</strong>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <Switch checked={form.specCustom} onCheckedChange={(v) => set({ specCustom: v })} />
                        <span>{t("cronjob.operate.custom")}</span>
                    </label>
                </div>
                {form.specCustom ? (
                    <>
                        {form.specs.map((spec, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2 w-full">
                                <Input
                                    className="w-[260px]"
                                    placeholder={"0 3 * * *"}
                                    value={spec ?? ""}
                                    onChange={(event) => set({ specs: form.specs.map((s, idx) => (idx === i ? event.target.value : s)) })}
                                />
                                <Button onClick={() => onPreview(spec)} type="button" variant="ghost">
                                    {t("cronjob.operate.preview")}
                                </Button>
                                {form.specs.length > 1 && (
                                    <Button
                                        onClick={() => set({ specs: form.specs.filter((_, idx) => idx !== i) })}
                                        type="button"
                                        variant="destructive"
                                    >
                                        {<Trash2Icon data-icon="inline-start" />}
                                    </Button>
                                )}
                            </div>
                        ))}
                        <Button onClick={() => set({ specs: [...form.specs, ""] })} type="button" variant="ghost">
                            {<PlusIcon data-icon="inline-start" />}
                            {t("cronjob.operate.addSpec")}
                        </Button>
                    </>
                ) : (
                    <>
                        {form.specObjs.map((o, i) => (
                            <div key={i} className="flex flex-wrap gap-2 items-center">
                                <NativeSelect
                                    className="w-[140px]"
                                    value={o.specType ?? ""}
                                    aria-label={t("common.select")}
                                    onChange={(event) =>
                                        set({
                                            specObjs: form.specObjs.map((item, idx) =>
                                                idx === i ? { ...item, specType: String(event.target.value) } : item,
                                            ),
                                        })
                                    }
                                >
                                    {specTypes
                                        .map((s) => ({ label: t(`cronjob.specType.${s}`), value: s }))
                                        .map((option) => (
                                            <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                                {option.label}
                                            </NativeSelectOption>
                                        ))}
                                </NativeSelect>
                                {o.specType === "perWeek" && (
                                    <NativeSelect
                                        className="w-[120px]"
                                        value={o.week ?? ""}
                                        aria-label={t("common.select")}
                                        onChange={(event) =>
                                            set({
                                                specObjs: form.specObjs.map((item, idx) =>
                                                    idx === i ? { ...item, week: Number(event.target.value) } : item,
                                                ),
                                            })
                                        }
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
                                {["perMonth", "perNDay"].includes(o.specType) && (
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.day")}</span>
                                        <Input
                                            min={1}
                                            className="w-[120px]"
                                            value={o.day ?? ""}
                                            type="number"
                                            required
                                            onChange={(event) =>
                                                set({
                                                    specObjs: form.specObjs.map((item, idx) =>
                                                        idx === i
                                                            ? {
                                                                  ...item,
                                                                  day: Number(
                                                                      (event.target.value === ""
                                                                          ? undefined
                                                                          : Number(event.target.value)) ?? 1,
                                                                  ),
                                                              }
                                                            : item,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                )}
                                {["perMonth", "perWeek", "perDay", "perNDay", "perNHour"].includes(o.specType) && (
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.hour")}</span>
                                        <Input
                                            min={0}
                                            max={23}
                                            className="w-[120px]"
                                            value={o.hour ?? ""}
                                            type="number"
                                            required
                                            onChange={(event) =>
                                                set({
                                                    specObjs: form.specObjs.map((item, idx) =>
                                                        idx === i
                                                            ? {
                                                                  ...item,
                                                                  hour: Number(
                                                                      (event.target.value === ""
                                                                          ? undefined
                                                                          : Number(event.target.value)) ?? 0,
                                                                  ),
                                                              }
                                                            : item,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                )}
                                {o.specType === "perNMinute" && (
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.minute")}</span>
                                        <Input
                                            min={1}
                                            className="w-[120px]"
                                            value={o.minute ?? ""}
                                            type="number"
                                            required
                                            onChange={(event) =>
                                                set({
                                                    specObjs: form.specObjs.map((item, idx) =>
                                                        idx === i
                                                            ? {
                                                                  ...item,
                                                                  minute: Number(
                                                                      (event.target.value === ""
                                                                          ? undefined
                                                                          : Number(event.target.value)) ?? 1,
                                                                  ),
                                                              }
                                                            : item,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                )}
                                {o.specType === "perNSecond" ? (
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.second")}</span>
                                        <Input
                                            min={1}
                                            className="w-[120px]"
                                            value={o.second ?? ""}
                                            type="number"
                                            required
                                            onChange={(event) =>
                                                set({
                                                    specObjs: form.specObjs.map((item, idx) =>
                                                        idx === i
                                                            ? {
                                                                  ...item,
                                                                  second: Number(
                                                                      (event.target.value === ""
                                                                          ? undefined
                                                                          : Number(event.target.value)) ?? 1,
                                                                  ),
                                                              }
                                                            : item,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                ) : o.specType !== "perNMinute" ? (
                                    <div className="flex items-center gap-2">
                                        <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.minute")}</span>
                                        <Input
                                            min={0}
                                            max={59}
                                            className="w-[120px]"
                                            value={o.minute ?? ""}
                                            type="number"
                                            required
                                            onChange={(event) =>
                                                set({
                                                    specObjs: form.specObjs.map((item, idx) =>
                                                        idx === i
                                                            ? {
                                                                  ...item,
                                                                  minute: Number(
                                                                      (event.target.value === ""
                                                                          ? undefined
                                                                          : Number(event.target.value)) ?? 0,
                                                                  ),
                                                              }
                                                            : item,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                ) : null}
                                <Button
                                    onClick={() => onPreview(transObjToSpec(o.specType, o.week, o.day, o.hour, o.minute, o.second))}
                                    type="button"
                                    variant="ghost"
                                >
                                    {t("cronjob.operate.preview")}
                                </Button>
                                {form.specObjs.length > 1 && (
                                    <Button
                                        onClick={() => set({ specObjs: form.specObjs.filter((_, idx) => idx !== i) })}
                                        type="button"
                                        variant="destructive"
                                    >
                                        {<Trash2Icon data-icon="inline-start" />}
                                    </Button>
                                )}
                            </div>
                        ))}
                        <Button
                            onClick={() => set({ specObjs: [...form.specObjs, defaultSpecObj(form.type)] })}
                            type="button"
                            variant="ghost"
                        >
                            {<PlusIcon data-icon="inline-start" />}
                            {t("cronjob.operate.addSpec")}
                        </Button>
                    </>
                )}
            </div>
        </>
    );
}
