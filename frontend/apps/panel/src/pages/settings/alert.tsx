import {
    useCleanAlertLogsMutation,
    useDeleteAlertMutation,
    useSearchAlertLogsQuery,
    useSearchAlertsQuery,
    useSetAlertStatusMutation,
    type AlertRule,
} from "@/api/settingsApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmAction } from "@/components/use-confirm-action";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ALERT_TYPES, AlertFormModal } from "./alert-form";
import { errText } from "./shared";
import { StatusBadge } from "./status-badge";
import { TablePager } from "./table-pager";

function AlertRules({ onOpenLogs }: { onOpenLogs: () => void }) {
    const { t } = useTranslation();
    const { confirm, dialog } = useConfirmAction();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [type, setType] = useState("");
    const [status, setStatus] = useState("");

    const { data, isFetching, refetch } = useSearchAlertsQuery({ page, pageSize, type, status });
    const [setAlertStatus] = useSetAlertStatusMutation();
    const [deleteAlert] = useDeleteAlertMutation();

    const [formOpen, setFormOpen] = useState(false);
    const [formTarget, setFormTarget] = useState<AlertRule | null>(null);

    const toggleStatus = async (row: AlertRule) => {
        try {
            await setAlertStatus({ id: row.id, status: row.status === "Enable" ? "Disable" : "Enable" }).unwrap();
            toast.success(t("settings.alert.statusChanged"));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const remove = (row: AlertRule) => {
        confirm({
            title: t("settings.alert.delete"),
            description: t("settings.alert.deleteConfirm", { name: row.title }),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            destructive: true,
            run: async () => {
                try {
                    await deleteAlert({ id: row.id }).unwrap();
                    toast.success(t("settings.alert.deleted"));
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const rows = data?.items ?? [];

    return (
        <div className="flex flex-col gap-3">
            {dialog}
            <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                    className="w-full sm:w-50"
                    aria-label={t("settings.alert.type")}
                    value={type}
                    onChange={(event) => {
                        setType(event.target.value);
                        setPage(1);
                    }}
                >
                    <NativeSelectOption value="">{t("settings.alert.type")}</NativeSelectOption>
                    {ALERT_TYPES.map((value) => (
                        <NativeSelectOption key={value} value={value}>
                            {t(`settings.alert.typeLabel.${value}`, value)}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <NativeSelect
                    className="w-full sm:w-40"
                    aria-label={t("settings.alert.status")}
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                >
                    <NativeSelectOption value="">{t("settings.alert.status")}</NativeSelectOption>
                    <NativeSelectOption value="Enable">{t("settings.alert.enable")}</NativeSelectOption>
                    <NativeSelectOption value="Disable">{t("settings.alert.disable")}</NativeSelectOption>
                </NativeSelect>
                <Button
                    type="button"
                    onClick={() => {
                        setFormTarget(null);
                        setFormOpen(true);
                    }}
                >
                    <PlusIcon data-icon="inline-start" />
                    {t("settings.alert.add")}
                </Button>
                <Button type="button" variant="outline" onClick={() => void refetch()}>
                    <RefreshCwIcon data-icon="inline-start" />
                    {t("common.refresh")}
                </Button>
                <Button type="button" variant="outline" onClick={onOpenLogs}>
                    {t("settings.alert.viewLogs")}
                </Button>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("settings.alert.ruleTitle")}</TableHead>
                        <TableHead className="w-40">{t("settings.alert.type")}</TableHead>
                        <TableHead className="w-30">{t("settings.alert.method")}</TableHead>
                        <TableHead className="w-25">{t("settings.alert.cycle")}</TableHead>
                        <TableHead className="w-25">{t("settings.alert.count")}</TableHead>
                        <TableHead className="w-25">{t("settings.alert.status")}</TableHead>
                        <TableHead className="w-45">{t("settings.alert.createdAt")}</TableHead>
                        <TableHead className="w-40" />
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isFetching && rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                <Spinner className="mx-auto" />
                            </TableCell>
                        </TableRow>
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={8}>
                                <Empty className="border-0 p-0">
                                    <EmptyDescription>{t("settings.alert.empty")}</EmptyDescription>
                                </Empty>
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.title}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{t(`settings.alert.typeLabel.${row.type}`, row.type)}</Badge>
                                </TableCell>
                                <TableCell>{t(`settings.alert.methodLabel.${row.method}`, row.method)}</TableCell>
                                <TableCell>{row.cycle}</TableCell>
                                <TableCell>{row.count}</TableCell>
                                <TableCell>
                                    <Switch
                                        checked={row.status === "Enable"}
                                        aria-label={t("settings.alert.status")}
                                        onCheckedChange={() => void toggleStatus(row)}
                                    />
                                </TableCell>
                                <TableCell>{row.createdAt}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setFormTarget(row);
                                                setFormOpen(true);
                                            }}
                                        >
                                            {t("common.edit")}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => remove(row)}
                                        >
                                            {t("common.delete")}
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <TablePager
                page={page}
                pageSize={pageSize}
                total={data?.total ?? 0}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
            />

            {formOpen && (
                <AlertFormModal
                    target={formTarget}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}

function AlertLogs() {
    const { t } = useTranslation();
    const { confirm, dialog } = useConfirmAction();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState("");
    const { data, isFetching, refetch } = useSearchAlertLogsQuery({ page, pageSize, status });
    const [cleanLogs, { isLoading: cleaning }] = useCleanAlertLogsMutation();

    const onClean = () => {
        confirm({
            title: t("settings.alert.cleanLogs"),
            description: t("settings.alert.cleanLogsConfirm"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            destructive: true,
            run: async () => {
                try {
                    await cleanLogs().unwrap();
                    toast.success(t("settings.alert.cleaned"));
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    const rows = data?.items ?? [];

    return (
        <div className="flex flex-col gap-3">
            {dialog}
            <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                    className="w-full sm:w-40"
                    aria-label={t("settings.alert.logStatus")}
                    value={status}
                    onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                    }}
                >
                    <NativeSelectOption value="">{t("settings.alert.logStatus")}</NativeSelectOption>
                    <NativeSelectOption value="Success">{t("settings.alert.logSuccess")}</NativeSelectOption>
                    <NativeSelectOption value="Failed">{t("settings.alert.logFailed")}</NativeSelectOption>
                </NativeSelect>
                <Button type="button" variant="outline" onClick={() => void refetch()}>
                    <RefreshCwIcon data-icon="inline-start" />
                    {t("common.refresh")}
                </Button>
                <Button type="button" variant="ghost" className="text-destructive" disabled={cleaning} onClick={onClean}>
                    {cleaning ? <Spinner data-icon="inline-start" /> : null}
                    {t("settings.alert.cleanLogs")}
                </Button>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-40">{t("settings.alert.logType")}</TableHead>
                        <TableHead className="w-30">{t("settings.alert.logStatus")}</TableHead>
                        <TableHead>{t("settings.alert.logMessage")}</TableHead>
                        <TableHead className="w-25">{t("settings.alert.logCount")}</TableHead>
                        <TableHead className="w-45">{t("settings.alert.createdAt")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isFetching && rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                <Spinner className="mx-auto" />
                            </TableCell>
                        </TableRow>
                    ) : rows.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5}>
                                <Empty className="border-0 p-0">
                                    <EmptyDescription>{t("settings.alert.logEmpty")}</EmptyDescription>
                                </Empty>
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>{row.type}</TableCell>
                                <TableCell>
                                    <StatusBadge tone={row.status === "Success" ? "green" : "red"}>{row.status || "-"}</StatusBadge>
                                </TableCell>
                                <TableCell>{row.message || "-"}</TableCell>
                                <TableCell>{row.count}</TableCell>
                                <TableCell>{row.createdAt}</TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <TablePager
                page={page}
                pageSize={pageSize}
                total={data?.total ?? 0}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                }}
            />
        </div>
    );
}

export default function AlertSettingsTab() {
    const { t } = useTranslation();
    const [sub, setSub] = useState("rules");

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("settings.alert.title")}</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs value={sub} onValueChange={setSub} className="gap-4">
                    <TabsList>
                        <TabsTrigger value="rules">{t("settings.alert.rulesTab")}</TabsTrigger>
                        <TabsTrigger value="logs">{t("settings.alert.logsTab")}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="rules">
                        <AlertRules onOpenLogs={() => setSub("logs")} />
                    </TabsContent>
                    <TabsContent value="logs">
                        <AlertLogs />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
