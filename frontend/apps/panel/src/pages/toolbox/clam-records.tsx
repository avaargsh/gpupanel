import { useSearchClamRecordQuery, type ClamInfo, type ClamRecord } from "@/api/toolboxApi";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { FieldGroup } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TablePager } from "../settings/table-pager";

export function ClamRecordSheet({ target, onClose }: { target: ClamInfo; onClose: () => void }) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [status, setStatus] = useState("");
    const [current, setCurrent] = useState<ClamRecord | null>(null);
    const { data, isFetching } = useSearchClamRecordQuery({ page, pageSize, clamID: target.id, status });

    return (
        <Sheet
            open={true}
            onOpenChange={(open) => {
                if (!open && true) onClose();
            }}
        >
            <SheetContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                <div className="flex flex-col gap-4">
                    <SheetHeader>
                        <SheetTitle>{`${t("toolbox.clam.recordTitle")} - ${target.name}`}</SheetTitle>
                    </SheetHeader>
                    <FieldGroup>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <NativeSelect
                                className="w-[160px]"
                                value={status ?? ""}
                                aria-label={t("toolbox.clam.statusFilter")}
                                onChange={(event) =>
                                    ((v) => {
                                        setStatus(String(v ?? ""));
                                        setPage(1);
                                    })(event.target.value)
                                }
                            >
                                <NativeSelectOption value="">{t("toolbox.clam.statusFilter")}</NativeSelectOption>
                                {[
                                    { label: "Done", value: "Done" },
                                    { label: "Waiting", value: "Waiting" },
                                    { label: "Failed", value: "Failed" },
                                ].map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={String(option.value)}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>
                        <div className="flex gap-4">
                            <div className="w-[420px]">
                                <div className="flex flex-col gap-3">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t("toolbox.clam.startTime")}</TableHead>
                                                <TableHead>{t("toolbox.clam.status")}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isFetching ? (
                                                <TableRow>
                                                    <TableCell colSpan={2}>
                                                        <Spinner className="mx-auto" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : (data?.items ?? []).length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={2}>
                                                        <Empty>
                                                            <EmptyDescription>
                                                                {
                                                                    <span className="text-muted-foreground">
                                                                        {t("toolbox.clam.recordEmpty")}
                                                                    </span>
                                                                }
                                                            </EmptyDescription>
                                                        </Empty>
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                (data?.items ?? []).map((row, rowIndex) => (
                                                    <TableRow
                                                        key={row["id"]}
                                                        {...{ onClick: () => setCurrent(row as ClamRecord) }}
                                                        tabIndex={0}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter" || event.key === " ") {
                                                                event.preventDefault();
                                                                ({ onClick: () => setCurrent(row as ClamRecord) }).onClick?.();
                                                            }
                                                        }}
                                                    >
                                                        <TableCell>{<span>{row.scanDate || row.startTime}</span>}</TableCell>
                                                        <TableCell>
                                                            {
                                                                <Badge
                                                                    variant={
                                                                        ["red"].includes(
                                                                            row["status"] === "Done"
                                                                                ? "green"
                                                                                : row["status"] === "Failed"
                                                                                  ? "red"
                                                                                  : "blue",
                                                                        )
                                                                            ? "destructive"
                                                                            : "secondary"
                                                                    }
                                                                >
                                                                    {row["status"]}
                                                                </Badge>
                                                            }
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
                                        onPageSizeChange={(s: number) => {
                                            setPageSize(s);
                                            setPage(1);
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                {current ? (
                                    <div className="flex flex-col gap-2.5">
                                        <strong>{t("toolbox.clam.detail")}</strong>
                                        <div>
                                            <span className="text-muted-foreground">{t("toolbox.clam.startTime")}: </span>
                                            <span>{current.startTime}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">{t("toolbox.clam.scanTime")}: </span>
                                            <span>{current.status === "Done" ? current.scanTime : "-"}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">{t("toolbox.clam.infectedFiles")}: </span>
                                            <span>{current.infectedFiles || "0"}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">{t("toolbox.clam.totalError")}: </span>
                                            <span>{current.totalError || "0"}</span>
                                        </div>
                                        {current.message ? <span className="text-muted-foreground">{current.message}</span> : null}
                                    </div>
                                ) : (
                                    <span className="text-muted-foreground">{t("toolbox.clam.selectHint")}</span>
                                )}
                            </div>
                        </div>
                    </FieldGroup>
                </div>
            </SheetContent>
        </Sheet>
    );
}
