import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { ChoiceToggle } from "./security-choices";
import { Field } from "./shared";
export function SSLDialog({
    open,
    onClose,
    savingSSL,
    sslType,
    setSslType,
    sslCert,
    setSslCert,
    sslKey,
    setSslKey,
    sslInfo,
    onSave,
}: {
    open: boolean;
    onClose: () => void;
    savingSSL: boolean;
    sslType: "self" | "import-paste";
    setSslType: (value: "self" | "import-paste") => void;
    sslCert: string;
    setSslCert: (value: string) => void;
    sslKey: string;
    setSslKey: (value: string) => void;
    sslInfo: { sslID?: number } | undefined;
    onSave: () => Promise<void>;
}) {
    const { t } = useTranslation();
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !savingSSL) onClose();
            }}
        >
            <DialogContent>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        (() => void onSave())();
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>HTTPS</DialogTitle>
                    </DialogHeader>
                    <Field label={t("settings.safe.sslType")}>
                        <ChoiceToggle
                            value={sslType}
                            onChange={(next) => setSslType(next === "import-paste" ? "import-paste" : "self")}
                            options={[
                                { value: "self", label: t("settings.safe.sslSelfSigned") },
                                { value: "import-paste", label: t("settings.safe.sslImport") },
                            ]}
                        />
                    </Field>
                    {sslType === "import-paste" ? (
                        <>
                            <Field label={t("settings.safe.sslCert")}>
                                <Textarea
                                    value={sslCert}
                                    onChange={(event) => setSslCert(event.target.value)}
                                    rows={4}
                                    placeholder="-----BEGIN CERTIFICATE-----"
                                />
                            </Field>
                            <Field label={t("settings.safe.sslKey")}>
                                <Textarea
                                    value={sslKey}
                                    onChange={(event) => setSslKey(event.target.value)}
                                    rows={4}
                                    placeholder="-----BEGIN PRIVATE KEY-----"
                                />
                            </Field>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {t("settings.safe.sslSelfHelper", { domain: window.location.hostname })}
                            {sslInfo?.sslID ? ` (sslID: ${sslInfo.sslID})` : ""}
                        </p>
                    )}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onClose()} disabled={savingSSL}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" disabled={savingSSL}>
                            {savingSSL ? <Spinner data-icon="inline-start" /> : null}
                            {t("common.confirm")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
