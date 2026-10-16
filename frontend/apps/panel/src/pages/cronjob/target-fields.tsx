import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { OptionPicker } from "../settings/option-picker";
import { Field } from "../settings/shared";
import { DB_TYPES, type FormState } from "./operate-model";

import { useTranslation } from "react-i18next";
import { isWebsite } from "./helper";

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export function TargetFields({
    form,
    set,
    websites,
    appOptions,
}: {
    form: FormState;
    set: (patch: Partial<FormState>) => void;
    websites: { id: number; primaryDomain: string }[];
    appOptions: { label: string; value: string }[];
}) {
    const { t } = useTranslation();
    return (
        <>
            {/* 类型专属字段 */}
            {isWebsite(form.type) && (
                <Field label={form.type === "website" ? t("cronjob.operate.website") : t("cronjob.operate.cutWebsiteLog")}>
                    <OptionPicker
                        value={(form.websiteList ?? []).map(String)}
                        options={[
                            { label: t("cronjob.operate.all"), value: "all" },
                            ...websites.map((w) => ({ label: w.primaryDomain, value: String(w.id) })),
                        ]}
                        multiple
                        searchable
                        onValueChange={(v) => {
                            const arr = v as string[];
                            set({ websiteList: arr.includes("all") ? ["all"] : arr });
                        }}
                    />
                </Field>
            )}
            {form.type === "app" && (
                <Field label={t("cronjob.operate.app")}>
                    <OptionPicker
                        value={(form.appIdList ?? []).map(String)}
                        options={[{ label: t("cronjob.operate.all"), value: "all" }, ...appOptions]}
                        multiple
                        searchable
                        onValueChange={(v) => {
                            const arr = v as string[];
                            set({ appIdList: arr.includes("all") ? ["all"] : arr });
                        }}
                    />
                </Field>
            )}
            {form.type === "database" && (
                <>
                    <Field label={t("cronjob.operate.dbType")}>
                        <NativeSelect
                            style={{ width: "100%" }}
                            value={form.dbType ?? ""}
                            aria-label={t("common.select")}
                            onChange={(event) => set({ dbType: String(event.target.value) })}
                        >
                            {DB_TYPES.map((d) => ({ label: d, value: d })).map((option) => (
                                <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field label={t("cronjob.operate.dbName")}>
                        <OptionPicker
                            value={(form.dbNameList ?? []).map(String)}
                            options={[{ label: t("cronjob.operate.all"), value: "all" }]}
                            multiple
                            creatable
                            searchable
                            placeholder={t("cronjob.operate.dbNameHelper")}
                            onValueChange={(v) => {
                                const arr = v as string[];
                                set({ dbNameList: arr.includes("all") ? ["all"] : arr });
                            }}
                        />
                    </Field>
                </>
            )}
            {form.type === "directory" && (
                <>
                    <Field label={t("cronjob.operate.directory")}>
                        <ToggleGroup
                            value={form.isDir ? "dir" : "files"}
                            type="single"
                            onValueChange={(value) => {
                                if (value) set({ isDir: String(value) === "dir" });
                            }}
                        >
                            <ToggleGroupItem value={"dir"}>{t("cronjob.operate.dir")}</ToggleGroupItem>
                            <ToggleGroupItem value={"files"}>{t("cronjob.operate.files")}</ToggleGroupItem>
                        </ToggleGroup>
                    </Field>
                    {form.isDir ? (
                        <Field label={t("cronjob.operate.sourceDir")}>
                            <Input
                                placeholder={"/data"}
                                value={form.sourceDir ?? ""}
                                onChange={(event) => set({ sourceDir: event.target.value })}
                            />
                        </Field>
                    ) : (
                        <Field label={t("cronjob.operate.filePath")}>
                            <OptionPicker
                                value={(form.files ?? []).map(String)}
                                options={[]}
                                multiple
                                creatable
                                searchable
                                placeholder={"/data/a.txt"}
                                onValueChange={(v) => set({ files: v as string[] })}
                            />
                        </Field>
                    )}
                </>
            )}
            {form.type === "curl" && (
                <Field label={t("cronjob.operate.curl")}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {form.urlItems.map((url, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2">
                                <Input
                                    style={{ width: 460 }}
                                    value={url ?? ""}
                                    onChange={(event) =>
                                        set({
                                            urlItems: form.urlItems.map((u, idx) => (idx === i ? event.target.value : u)),
                                        })
                                    }
                                />
                                {form.urlItems.length > 1 && (
                                    <Button
                                        onClick={() => set({ urlItems: form.urlItems.filter((_, idx) => idx !== i) })}
                                        type="button"
                                        variant="destructive"
                                    >
                                        {<Trash2Icon data-icon="inline-start" />}
                                    </Button>
                                )}
                            </div>
                        ))}
                        <Button onClick={() => set({ urlItems: [...form.urlItems, ""] })} type="button" variant="ghost">
                            {<PlusIcon data-icon="inline-start" />}
                            {t("cronjob.operate.addSpec")}
                        </Button>
                    </div>
                </Field>
            )}
            {form.type === "cleanLog" && (
                <Field label={t("cronjob.operate.scopes")}>
                    <OptionPicker
                        value={(form.scopes ?? []).map(String)}
                        options={[{ label: t("cronjob.operate.scopeWebsite"), value: "website" }]}
                        multiple
                        onValueChange={(v) => set({ scopes: v as string[] })}
                    />
                </Field>
            )}
            {form.type === "snapshot" && (
                <>
                    <label className="flex items-center gap-2">
                        <Checkbox checked={form.withImage} onCheckedChange={(e) => set({ withImage: !!e })} />
                        {t("cronjob.operate.withImage")}
                    </label>
                    <Field label={t("cronjob.operate.ignoreApp")}>
                        <OptionPicker
                            value={(form.ignoreAppIDs ?? []).map(String)}
                            options={appOptions}
                            multiple
                            searchable
                            onValueChange={(v) => set({ ignoreAppIDs: ((v as unknown as string[]) ?? []).map(Number) })}
                        />
                    </Field>
                </>
            )}
        </>
    );
}
