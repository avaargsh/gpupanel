import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useTranslation } from "react-i18next";

export const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 统一的「标签 + 内容 + 设置按钮」行，用于系统设备等快速设置页。 */
export function SettingRow({
    label,
    value,
    onSet,
    setLabel,
}: {
    label: ReactNode;
    value: ReactNode;
    onSet?: () => void;
    setLabel: string;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
            }}
        >
            <span style={{ minWidth: 160 }}>{label}</span>
            <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                <span style={{ maxWidth: 560, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
                {onSet ? (
                    <Button onClick={onSet} type="button" variant="outline" size="sm">
                        {setLabel}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

export { Field } from "../settings/shared";

/** 原始配置文件编辑页签：`load` 拉取内容，`save` 存在则可编辑，否则只读（如日志文件）。 */
export interface ConfigTab {
    key: string;
    label: string;
    load: () => Promise<string>;
    save?: (content: string) => Promise<unknown>;
    readOnly?: boolean;
}

/**
 * 原始配置文件编辑器，使用原生 Textarea 与显式保存。
 * 支持多文件页签（系统设备的 DNS / Hosts、病毒扫描的 clamd / freshclam 及日志）。
 */
export function ConfigEditorModal({ title, tabs, onClose }: { title: string; tabs: ConfigTab[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [active, setActive] = useState(tabs[0]?.key ?? "");
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [retry, setRetry] = useState(0);

    const current = tabs.find((tab) => tab.key === active);

    useEffect(() => {
        const tab = tabs.find((item) => item.key === active);
        if (!tab) return undefined;
        let cancelled = false;
        setLoading(true);
        setLoadError("");
        tab.load()
            .then((value) => {
                if (!cancelled) setContent(value ?? "");
            })
            .catch((e) => {
                if (!cancelled) {
                    setLoadError(errText(e));
                    setContent("");
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // 仅在切换页签 / 挂载时拉取，tabs 由父组件一次性传入
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, retry]);

    const doSave = async () => {
        if (saving || loading || loadError) return;
        if (!current?.save) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            await current.save(content);
            toast.success(t("toolbox.config.saved"));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !saving) onClose();
            }}
        >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!saving) void doSave();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <Tabs value={active} onValueChange={(key) => setActive(String(key))}>
                            <TabsList className="flex-wrap">
                                {tabs.map((tab) => (
                                    <TabsTrigger value={tab.key} key={tab.key}>
                                        {tab.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                            {tabs.map((tab) => (
                                <TabsContent value={tab.key} key={tab.key}></TabsContent>
                            ))}
                        </Tabs>
                        <Textarea
                            id="host-config-content"
                            aria-label={title}
                            rows={18}
                            readOnly={Boolean(current?.readOnly) || loading || Boolean(loadError)}
                            placeholder={loading ? t("toolbox.config.loading") : ""}
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginTop: 12 }}
                            value={content ?? ""}
                            onChange={(event) => setContent(event.target.value)}
                        />
                    </FieldGroup>
                    {loadError && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {loadError}
                                <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>
                                    {t("common.retry")}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                            {t("common.close")}
                        </Button>
                        {!current?.readOnly && (
                            <Button type="submit" disabled={saving || loading || Boolean(loadError)}>
                                {saving && <Spinner data-icon="inline-start" />}
                                {t("common.confirm")}
                            </Button>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
