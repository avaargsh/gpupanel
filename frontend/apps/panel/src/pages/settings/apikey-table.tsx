import type { APIKeyItem } from "@/api/settingsApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";
import { formatDateTime, isAnyIP, normalizeIPs } from "./apikey-values";
import { TablePager } from "./table-pager";

export function APIKeyTable({
    rows,
    isFetching,
    page,
    pageSize,
    total,
    onPage,
    onPageSize,
    onView,
    onEdit,
    onStatus,
    onRevoke,
}: {
    rows: APIKeyItem[];
    isFetching: boolean;
    page: number;
    pageSize: number;
    total: number;
    onPage: (page: number) => void;
    onPageSize: (size: number) => void;
    onView: (id: string) => void;
    onEdit: (item: APIKeyItem) => void;
    onStatus: (item: APIKeyItem, status: "Enable" | "Disable") => void;
    onRevoke: (item: APIKeyItem) => void;
}) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col gap-3">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t("settings.apikeys.name")}</TableHead>
                        <TableHead>{t("settings.apikeys.status")}</TableHead>
                        <TableHead>{t("settings.apikeys.ipWhiteList")}</TableHead>
                        <TableHead>{t("settings.apikeys.expiresAt")}</TableHead>
                        <TableHead>{t("settings.apikeys.allowAppBinding")}</TableHead>
                        <TableHead>{t("settings.apikeys.operate")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {isFetching ? (
                        <TableRow>
                            <TableCell colSpan={6}>
                                <Spinner className="mx-auto" />
                            </TableCell>
                        </TableRow>
                    ) : !rows.length ? (
                        <TableRow>
                            <TableCell colSpan={6}>
                                <Empty>
                                    <EmptyDescription>{t("common.empty")}</EmptyDescription>
                                </Empty>
                            </TableCell>
                        </TableRow>
                    ) : (
                        rows.map((row) => (
                            <TableRow key={row.id}>
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <Button type="button" variant="link" onClick={() => onView(row.id)}>
                                            {row.kind === "legacy" ? t("settings.apikeys.legacy") : row.name}
                                        </Button>
                                        <span className="text-muted-foreground">{row.keyHint}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="secondary">{t(`settings.apikeys.statusLabel.${row.status}`)}</Badge>
                                </TableCell>
                                <TableCell>
                                    {isAnyIP(row.ipWhiteList)
                                        ? t("settings.apikeys.anyIp")
                                        : normalizeIPs(row.ipWhiteList).split("\n").filter(Boolean).join(", ") || "-"}
                                </TableCell>
                                <TableCell>{row.expiresAt ? formatDateTime(row.expiresAt) : t("settings.apikeys.never")}</TableCell>
                                <TableCell>{row.allowAppBinding ? t("settings.apikeys.yes") : t("settings.apikeys.no")}</TableCell>
                                <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => onView(row.id)}>
                                            {t("settings.apikeys.view")}
                                        </Button>
                                        {row.status !== "Revoked" && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(row)}>
                                                {t("settings.apikeys.edit")}
                                            </Button>
                                        )}
                                        {row.status === "Enable" && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => onStatus(row, "Disable")}>
                                                {t("settings.apikeys.disable")}
                                            </Button>
                                        )}
                                        {row.status === "Disable" && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => onStatus(row, "Enable")}>
                                                {t("settings.apikeys.enable")}
                                            </Button>
                                        )}
                                        {row.status !== "Revoked" && (
                                            <Button type="button" variant="destructive" size="sm" onClick={() => onRevoke(row)}>
                                                {t("settings.apikeys.revoke")}
                                            </Button>
                                        )}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
            <TablePager page={page} pageSize={pageSize} total={total} onPageChange={onPage} onPageSizeChange={onPageSize} />
        </div>
    );
}
