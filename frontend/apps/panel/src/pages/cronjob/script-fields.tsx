import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OptionPicker } from "../settings/option-picker";
import { Field } from "../settings/shared";
import { EXECUTORS, type FormState } from "./operate-model";

import { useTranslation } from "react-i18next";
import { hasScript } from "./helper";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export function ScriptFields({
    form,
    set,
    containers,
    scripts,
}: {
    form: FormState;
    set: (patch: Partial<FormState>) => void;
    containers: { name: string }[];
    scripts: { items: { id: number; name: string }[] } | undefined;
}) {
    const { t } = useTranslation();
    return (
        <>
            {/* Shell 脚本 */}
            {hasScript(form.type) && (
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
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <Switch checked={form.inContainer} onCheckedChange={(v) => set({ inContainer: v })} />
                        <span>{t("cronjob.operate.inContainer")}</span>
                    </label>
                    {form.inContainer && (
                        <div className="flex flex-wrap items-center gap-2">
                            <NativeSelect
                                style={{ width: 220 }}
                                value={(form.containerName || undefined) ?? ""}
                                aria-label={t("cronjob.operate.containerName")}
                                onChange={(event) => set({ containerName: String(event.target.value) })}
                            >
                                <NativeSelectOption value="">{t("cronjob.operate.containerName")}</NativeSelectOption>
                                {containers
                                    .map((c) => ({ label: c.name, value: c.name }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
                            <div className="flex items-center gap-2">
                                <span className="shrink-0 text-muted-foreground">{t("cronjob.operate.command")}</span>
                                <Input
                                    style={{ width: 200 }}
                                    value={form.command ?? ""}
                                    onChange={(event) => set({ command: event.target.value })}
                                />
                            </div>
                        </div>
                    )}
                    <Field label={t("cronjob.operate.user")}>
                        <Input style={{ width: 200 }} value={form.user ?? ""} onChange={(event) => set({ user: event.target.value })} />
                    </Field>
                    {!form.inContainer && (
                        <Field label={t("cronjob.operate.executor")}>
                            <OptionPicker
                                value={String(form.executor ?? "")}
                                options={EXECUTORS.map((e) => ({ label: e, value: e }))}
                                creatable
                                onValueChange={(v) => set({ executor: String(v) })}
                            />
                        </Field>
                    )}
                    <Field label={t("cronjob.operate.shellContent")}>
                        <ToggleGroup
                            value={form.scriptMode}
                            type="single"
                            onValueChange={(value) => {
                                if (value) set({ scriptMode: String(value), script: "", scriptID: undefined });
                            }}
                        >
                            <ToggleGroupItem value={"input"}>{t("cronjob.operate.scriptInput")}</ToggleGroupItem>
                            <ToggleGroupItem value={"library"}>{t("cronjob.operate.scriptLibrary")}</ToggleGroupItem>
                            <ToggleGroupItem value={"select"}>{t("cronjob.operate.scriptSelect")}</ToggleGroupItem>
                        </ToggleGroup>
                    </Field>
                    {form.scriptMode === "input" && (
                        <Textarea
                            rows={8}
                            placeholder={"#!/bin/bash"}
                            value={form.script ?? ""}
                            onChange={(event) => set({ script: event.target.value })}
                        />
                    )}
                    {form.scriptMode === "library" && (
                        <NativeSelect
                            style={{ width: "100%" }}
                            value={form.scriptID ?? ""}
                            aria-label={t("cronjob.operate.scriptLibrary")}
                            onChange={(event) => set({ scriptID: Number(event.target.value) })}
                        >
                            <NativeSelectOption value="">{t("cronjob.operate.scriptLibrary")}</NativeSelectOption>
                            {(scripts?.items ?? [])
                                .map((s) => ({ label: s.name, value: s.id }))
                                .map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                    )}
                    {form.scriptMode === "select" && (
                        <Input
                            placeholder={"/tmp/test.sh"}
                            value={form.script ?? ""}
                            onChange={(event) => set({ script: event.target.value })}
                        />
                    )}
                </div>
            )}
        </>
    );
}
