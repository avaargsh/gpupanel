import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * 服务端分页控件（页码 + 每页条数），替换 Semi `Table` 自带分页。
 *
 * 原生 shadcn 的 `Pagination*` 面向 URL 链接；表格分页需要「改页码即回调」，因此
 * 这里用 Button + NativeSelect 组合实现，保持原有 currentPage/pageSize/total 语义。
 * 文案复用已有词条：i18n 目前没有通用的上一页/下一页 key（请求见 handoff），
 * 暂用 `logs.system.previous` / `logs.system.next`（zh: 上一页 / 下一页）。
 * 移除触发条件：i18n 增加 `common.previous` / `common.next` / `common.pageSize` 后切换。
 */
const DEFAULT_PAGE_SIZES = [10, 20, 50, 100];

export function TablePager({
    page,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
    pageSizes = DEFAULT_PAGE_SIZES,
    prevLabel,
    nextLabel,
}: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizes?: number[];
    prevLabel?: string;
    nextLabel?: string;
}) {
    const { t } = useTranslation();
    const pageCount = Math.max(1, Math.ceil((total || 0) / Math.max(1, pageSize || 1)));
    const previous = prevLabel ?? t("logs.system.previous");
    const next = nextLabel ?? t("logs.system.next");

    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <NativeSelect
                    size="sm"
                    aria-label={t("common.pageSize", { defaultValue: "Rows per page" })}
                    value={String(pageSize)}
                    onChange={(event) => onPageSizeChange(Number(event.target.value))}
                >
                    {pageSizes.map((size) => (
                        <NativeSelectOption key={size} value={String(size)}>
                            {size}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={previous}
                    disabled={page <= 1}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                    <ChevronLeftIcon />
                </Button>
                <span className="text-sm text-muted-foreground">
                    {page} / {pageCount}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={next}
                    disabled={page >= pageCount}
                    onClick={() => onPageChange(page + 1)}
                >
                    <ChevronRightIcon />
                </Button>
            </div>
        </div>
    );
}
