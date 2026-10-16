import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { ChoiceToggle, SafeEdit, randomEntrance } from "./security-choices";
import { Field } from "./shared";
export function SecurityDialogs({
    edit,
    draft,
    setDraft,
    ipv6,
    setIpv6,
    savingPort,
    savingSetting,
    savingBind,
    ifaces,
    onClose,
    onPort,
    onBind,
    onSetting,
}: {
    edit: SafeEdit;
    draft: string;
    setDraft: (value: string) => void;
    ipv6: string;
    setIpv6: (value: string) => void;
    savingPort: boolean;
    savingSetting: boolean;
    savingBind: boolean;
    ifaces: string[] | undefined;
    onClose: () => void;
    onPort: () => Promise<void>;
    onBind: () => Promise<void>;
    onSetting: (key: string, value: string) => Promise<void>;
}) {
    const { t } = useTranslation();
    return (
        <>
            <Dialog
                open={edit === "port"}
                onOpenChange={(next) => {
                    if (!next) onClose();
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void onPort())();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.safe.port")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.safe.port")} help={t("settings.safe.portHelper")}>
                            <Input
                                type="number"
                                required
                                min={1}
                                max={65535}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                            />
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onClose()}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingPort}>
                                {savingPort ? <Spinner data-icon="inline-start" /> : null}
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={edit === "bind"}
                onOpenChange={(next) => {
                    if (!next) onClose();
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void onBind())();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.safe.bindAddress")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.safe.bindAddress")} help={t("settings.safe.bindHelper")}>
                            <Select value={draft} onValueChange={setDraft}>
                                <SelectTrigger className="w-full" aria-label={t("settings.safe.bindAddress")}>
                                    <SelectValue placeholder="0.0.0.0" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        {(ifaces ?? []).map((item) => (
                                            <SelectItem key={item} value={item}>
                                                {item}
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </Field>
                        <Field label="IPv6">
                            <ChoiceToggle
                                value={ipv6}
                                onChange={setIpv6}
                                options={[
                                    { value: "Enable", label: t("settings.safe.enable") },
                                    { value: "Disable", label: t("settings.safe.disable") },
                                ]}
                            />
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onClose()}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingSetting || savingBind}>
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={edit === "entrance"}
                onOpenChange={(next) => {
                    if (!next) onClose();
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void onSetting("SecurityEntrance", draft))();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.safe.entrance")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.safe.entrance")} help={t("settings.safe.entranceInputHelper")}>
                            <InputGroup>
                                <InputGroupInput
                                    value={draft}
                                    aria-label={t("settings.safe.entrance")}
                                    onChange={(event) => setDraft(event.target.value)}
                                />
                                <InputGroupAddon align="inline-end">
                                    <InputGroupButton type="button" onClick={() => setDraft(randomEntrance())}>
                                        {t("settings.safe.random")}
                                    </InputGroupButton>
                                </InputGroupAddon>
                            </InputGroup>
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onClose()}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingSetting || savingBind}>
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={edit === "allowIPs"}
                onOpenChange={(next) => {
                    if (!next) onClose();
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void onSetting("AllowIPs", draft))();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.safe.allowIPs")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.safe.allowIPs")} help={t("settings.safe.allowIPsModalHelper")}>
                            <Textarea
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                rows={4}
                                placeholder="192.168.1.0/24"
                            />
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onClose()}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingSetting || savingBind}>
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={edit === "bindDomain"}
                onOpenChange={(next) => {
                    if (!next) onClose();
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void onSetting("BindDomain", draft))();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.safe.bindDomain")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.safe.bindDomain")} help={t("settings.safe.bindDomainHelper")}>
                            <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onClose()}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingSetting || savingBind}>
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <Dialog
                open={edit === "expiration"}
                onOpenChange={(next) => {
                    if (!next) onClose();
                }}
            >
                <DialogContent>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            (() => void onSetting("ExpirationDays", draft))();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t("settings.safe.expiration")}</DialogTitle>
                        </DialogHeader>
                        <Field label={t("settings.safe.expiration")} help={t("settings.safe.expirationHelper")}>
                            <Input type="number" required min={0} value={draft} onChange={(event) => setDraft(event.target.value)} />
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onClose()}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={savingSetting || savingBind}>
                                {t("common.confirm")}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
