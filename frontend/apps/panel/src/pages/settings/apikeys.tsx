import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useConfirmAction } from "@/components/use-confirm-action";
import { useState } from "react";
import { toast } from "sonner";
import { APIKeyTable } from "./apikey-table";
import { formatDateTime, isAnyIP, normalizeIPs } from "./apikey-values";
import { localDateTime } from "./date-input";

import { useGenerateApiKeyMutation, useLazyGetCurrentUserQuery } from "@/api/authApi";
import {
    useCreateAPIKeyMutation,
    useRevokeAPIKeyMutation,
    useSearchAPIKeysQuery,
    useSetAPIKeyStatusMutation,
    useUpdateAPIKeyMutation,
    type APIKeyEditable,
    type APIKeyItem,
} from "@/api/settingsApi";
import { useTranslation } from "react-i18next";
import { Field, SettingRow, errText } from "./shared";

const ANY_KEY_IP = "0.0.0.0/0\n::/0";

function defaultExpiry(): string {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

function emptyForm(): APIKeyEditable {
    return {
        name: "",
        description: "",
        ipWhiteList: "",
        apiTrustedProxies: "",
        apiKeyValidityTime: 120,
        expiresAt: defaultExpiry(),
        allowAppBinding: false,
    };
}

export default function APIKeysTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [excludeRevoked, setExcludeRevoked] = useState(true);
    const { data, isFetching, refetch } = useSearchAPIKeysQuery({ page, pageSize, excludeRevoked });
    const [createAPIKey, { isLoading: creating }] = useCreateAPIKeyMutation();
    const [updateAPIKey, { isLoading: updating }] = useUpdateAPIKeyMutation();
    const [setStatus] = useSetAPIKeyStatusMutation();
    const [revoke] = useRevokeAPIKeyMutation();
    const [loadCurrentUser] = useLazyGetCurrentUserQuery();
    const [generateApiKey] = useGenerateApiKeyMutation();

    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [form, setForm] = useState<APIKeyEditable>(emptyForm());
    const [ipMode, setIpMode] = useState<"restricted" | "any">("restricted");
    const [neverExpires, setNeverExpires] = useState(false);

    const [secret, setSecret] = useState("");
    const [secretName, setSecretName] = useState("");

    const [detail, setDetail] = useState<string | null>(null);
    const [legacySecret, setLegacySecret] = useState("");

    const rows = data?.items ?? [];
    const detailItem = rows.find((r) => r.id === detail) ?? null;

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm());
        setIpMode("restricted");
        setNeverExpires(false);
        setEditorOpen(true);
    };

    const openEdit = (item: APIKeyItem) => {
        setEditing(item.id);
        setForm({
            name: item.kind === "legacy" ? t("settings.apikeys.legacy") : item.name,
            description: item.description,
            ipWhiteList: normalizeIPs(item.ipWhiteList),
            apiTrustedProxies: normalizeIPs(item.apiTrustedProxies),
            apiKeyValidityTime: item.apiKeyValidityTime,
            expiresAt: item.expiresAt,
            allowAppBinding: item.allowAppBinding,
        });
        setIpMode(isAnyIP(item.ipWhiteList) ? "any" : "restricted");
        setNeverExpires(!item.expiresAt);
        setEditorOpen(true);
    };

    const submit = async () => {
        if (creating || updating) return;
        if (!form.name.trim()) {
            toast.warning(t("settings.apikeys.nameRequired"));
            return;
        }
        const payload: APIKeyEditable = {
            name: form.name.trim(),
            description: form.description,
            ipWhiteList: ipMode === "any" ? ANY_KEY_IP : normalizeIPs(form.ipWhiteList),
            apiTrustedProxies: normalizeIPs(form.apiTrustedProxies),
            apiKeyValidityTime: form.apiKeyValidityTime,
            expiresAt: neverExpires ? null : form.expiresAt,
            allowAppBinding: form.allowAppBinding,
        };
        try {
            if (editing) {
                const current = rows.find((r) => r.id === editing);
                await updateAPIKey({ ...payload, id: editing, revision: current?.revision ?? 0 }).unwrap();
                toast.success(t("settings.saved"));
            } else {
                const res = await createAPIKey({ ...payload, requestID: crypto.randomUUID() }).unwrap();
                setSecret(res.apiKey);
                setSecretName(res.item?.name ?? payload.name);
            }
            setEditorOpen(false);
            void refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const changeStatus = (item: APIKeyItem, next: "Enable" | "Disable") => {
        confirm({
            title: t("settings.apikeys.title"),
            description:
                next === "Enable"
                    ? t("settings.apikeys.enableConfirm", { name: item.name })
                    : t("settings.apikeys.disableConfirm", { name: item.name }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await setStatus({ id: item.id, revision: item.revision, status: next }).unwrap();
                    toast.success(t("settings.saved"));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const doRevoke = (item: APIKeyItem) => {
        confirm({
            title: t("settings.apikeys.title"),
            description: t("settings.apikeys.revokeConfirm", { name: item.name }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                try {
                    await revoke({ id: item.id, revision: item.revision }).unwrap();
                    toast.success(t("settings.saved"));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const revealLegacy = async () => {
        try {
            const res = await loadCurrentUser().unwrap();
            setLegacySecret(res.apiKey);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const resetLegacy = async () => {
        try {
            const key = await generateApiKey().unwrap();
            setLegacySecret(key);
            toast.success(t("settings.saved"));
            void refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t("settings.apikeys.copied"));
        } catch {
            toast.error(t("settings.apikeys.copyFailed"));
        }
    };

    return (
        <>
            {confirmationDialog}
            {
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <Button onClick={openCreate} type="button" variant="default">
                            {t("settings.apikeys.create")}
                        </Button>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>{t("settings.apikeys.showRevoked")}</span>
                            <Switch
                                checked={!excludeRevoked}
                                onCheckedChange={(v) => {
                                    setExcludeRevoked(!v);
                                    setPage(1);
                                }}
                            />
                        </div>
                    </div>

                    <APIKeyTable
                        rows={rows}
                        isFetching={isFetching}
                        page={page}
                        pageSize={pageSize}
                        total={data?.total ?? 0}
                        onPage={setPage}
                        onPageSize={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                        onView={setDetail}
                        onEdit={openEdit}
                        onStatus={changeStatus}
                        onRevoke={doRevoke}
                    />

                    <Dialog
                        open={editorOpen}
                        onOpenChange={(open) => {
                            if (!open && !(creating || updating)) setEditorOpen(false);
                        }}
                    >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                            <form
                                className="flex flex-col gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (!(creating || updating)) void submit();
                                }}
                            >
                                <DialogHeader>
                                    <DialogTitle>{editing ? t("settings.apikeys.edit") : t("settings.apikeys.create")}</DialogTitle>
                                </DialogHeader>
                                <FieldGroup>
                                    <Field label={t("settings.apikeys.name")}>
                                        <Input
                                            required
                                            maxLength={64}
                                            disabled={editing !== null && rows.find((r) => r.id === editing)?.kind === "legacy"}
                                            value={form.name ?? ""}
                                            onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                                        />
                                    </Field>
                                    <Field label={t("settings.apikeys.description")}>
                                        <Textarea
                                            rows={2}
                                            maxLength={256}
                                            value={form.description ?? ""}
                                            onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
                                        />
                                    </Field>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ marginBottom: 6 }}>
                                            <strong>{t("settings.apikeys.ipWhiteList")}</strong>
                                        </div>
                                        <ToggleGroup
                                            value={ipMode}
                                            type="single"
                                            onValueChange={(value) => {
                                                if (value) setIpMode(String(value) === "any" ? "any" : "restricted");
                                            }}
                                        >
                                            <ToggleGroupItem value={"restricted"}>{t("settings.apikeys.specifiedIPs")}</ToggleGroupItem>
                                            <ToggleGroupItem value={"any"}>{t("settings.apikeys.anyIp")}</ToggleGroupItem>
                                        </ToggleGroup>
                                        {ipMode === "restricted" ? (
                                            <Textarea
                                                style={{ marginTop: 8 }}
                                                rows={4}
                                                maxLength={4096}
                                                placeholder={"192.168.1.0/24\n10.0.0.1"}
                                                value={form.ipWhiteList ?? ""}
                                                onChange={(event) => setForm((f) => ({ ...f, ipWhiteList: event.target.value }))}
                                            />
                                        ) : null}
                                    </div>
                                    <Field label={t("settings.apikeys.trustedProxies")}>
                                        <Textarea
                                            rows={2}
                                            maxLength={4096}
                                            value={form.apiTrustedProxies ?? ""}
                                            onChange={(event) => setForm((f) => ({ ...f, apiTrustedProxies: event.target.value }))}
                                        />
                                    </Field>
                                    <Field label={t("settings.apikeys.validityTime")}>
                                        <Input
                                            min={0}
                                            max={1440}
                                            value={form.apiKeyValidityTime ?? ""}
                                            type="number"
                                            required
                                            onChange={(event) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    apiKeyValidityTime: Number(
                                                        (event.target.value === "" ? undefined : Number(event.target.value)) ?? 0,
                                                    ),
                                                }))
                                            }
                                        />
                                        <span style={{ marginLeft: 8 }}>{t("settings.apikeys.minute")}</span>
                                    </Field>
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ marginBottom: 6 }}>
                                            <strong>{t("settings.apikeys.expiresAt")}</strong>
                                        </div>
                                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                            <input
                                                type="checkbox"
                                                checked={neverExpires}
                                                onChange={(e) => setNeverExpires(e.target.checked)}
                                            />
                                            {t("settings.apikeys.never")}
                                        </label>
                                        {!neverExpires ? (
                                            <Input
                                                type="datetime-local"
                                                value={localDateTime(form.expiresAt ? new Date(form.expiresAt) : undefined)}
                                                onChange={(event) =>
                                                    setForm((f) => ({
                                                        ...f,
                                                        expiresAt: (event.target.value ? new Date(event.target.value) : undefined)
                                                            ? new Date(
                                                                  (event.target.value ? new Date(event.target.value) : undefined) as Date,
                                                              ).toISOString()
                                                            : null,
                                                    }))
                                                }
                                            />
                                        ) : null}
                                    </div>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <input
                                            type="checkbox"
                                            checked={form.allowAppBinding}
                                            onChange={(e) => setForm((f) => ({ ...f, allowAppBinding: e.target.checked }))}
                                        />
                                        {t("settings.apikeys.allowAppBinding")}
                                    </label>
                                </FieldGroup>
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={creating || updating}
                                        onClick={() => setEditorOpen(false)}
                                    >
                                        {t("common.cancel")}
                                    </Button>
                                    <Button type="submit" disabled={creating || updating}>
                                        {creating || updating ? <Spinner data-icon="inline-start" /> : null}
                                        {t("common.confirm")}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>

                    <Dialog
                        open={secret !== ""}
                        onOpenChange={(open) => {
                            if (!open && true) setSecret("");
                        }}
                    >
                        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                            <div className="flex flex-col gap-4">
                                <DialogHeader>
                                    <DialogTitle>{t("settings.apikeys.createdTitle")}</DialogTitle>
                                </DialogHeader>
                                <FieldGroup>
                                    <p>{t("settings.apikeys.createdTip")}</p>
                                    <SettingRow
                                        label={t("settings.apikeys.name")}
                                        value={secretName}
                                        action={
                                            <Button onClick={() => void copy(secret)} type="button" variant="secondary">
                                                {t("settings.apikeys.copy")}
                                            </Button>
                                        }
                                    />
                                    <Textarea rows={2} readOnly style={{ marginTop: 8 }} value={secret ?? ""} />
                                </FieldGroup>
                                {
                                    <Button onClick={() => setSecret("")} type="button" variant="default">
                                        {t("common.confirm")}
                                    </Button>
                                }
                            </div>
                        </DialogContent>
                    </Dialog>

                    <Sheet
                        open={detail !== null}
                        onOpenChange={(open) => {
                            if (!open && true)
                                (() => {
                                    setDetail(null);
                                    setLegacySecret("");
                                })();
                        }}
                    >
                        <SheetContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                            <div className="flex flex-col gap-4">
                                <SheetHeader>
                                    <SheetTitle>{t("settings.apikeys.details")}</SheetTitle>
                                </SheetHeader>
                                <FieldGroup>
                                    {detailItem ? (
                                        <div>
                                            <SettingRow label={t("settings.apikeys.name")} value={detailItem.name} />
                                            <SettingRow
                                                label={t("settings.apikeys.status")}
                                                value={t(`settings.apikeys.statusLabel.${detailItem.status}`)}
                                            />
                                            <SettingRow label={t("settings.apikeys.keyHint")} value={detailItem.keyHint} />
                                            <SettingRow
                                                label={t("settings.apikeys.ipWhiteList")}
                                                value={
                                                    isAnyIP(detailItem.ipWhiteList)
                                                        ? t("settings.apikeys.anyIp")
                                                        : normalizeIPs(detailItem.ipWhiteList).split("\n").filter(Boolean).join(", ") || "-"
                                                }
                                            />
                                            <SettingRow
                                                label={t("settings.apikeys.trustedProxies")}
                                                value={
                                                    normalizeIPs(detailItem.apiTrustedProxies).split("\n").filter(Boolean).join(", ") || "-"
                                                }
                                            />
                                            <SettingRow
                                                label={t("settings.apikeys.validityTime")}
                                                value={`${detailItem.apiKeyValidityTime} ${t("settings.apikeys.minute")}`}
                                            />
                                            <SettingRow
                                                label={t("settings.apikeys.expiresAt")}
                                                value={
                                                    detailItem.expiresAt
                                                        ? formatDateTime(detailItem.expiresAt)
                                                        : t("settings.apikeys.never")
                                                }
                                            />
                                            <SettingRow
                                                label={t("settings.apikeys.createdAt")}
                                                value={formatDateTime(detailItem.createdAt)}
                                            />
                                            {detailItem.kind === "legacy" && detailItem.status !== "Revoked" ? (
                                                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                                                    <span className="text-muted-foreground">{t("settings.apikeys.legacyHelp")}</span>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <Button onClick={() => void revealLegacy()} type="button" variant="secondary">
                                                            {t("settings.apikeys.showLegacy")}
                                                        </Button>
                                                        <Button onClick={() => void resetLegacy()} type="button" variant="outline">
                                                            {t("settings.apikeys.resetLegacy")}
                                                        </Button>
                                                    </div>
                                                    {legacySecret ? <Textarea rows={2} readOnly value={legacySecret ?? ""} /> : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </FieldGroup>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            }
        </>
    );
}
