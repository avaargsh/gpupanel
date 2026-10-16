import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect } from 'react';

export interface TablePaginationProps {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    pageSizeOptions?: number[];
}

/**
 * 受控分页控件：服务端分页由调用方提供 page/pageSize/total。
 * 仅使用数字与图形，避免引入新的 i18n key。
 */
export function TablePagination({
    page,
    pageSize,
    total,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
}: TablePaginationProps) {
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pageCount);

    useEffect(() => {
        if (page !== current) onPageChange(current);
    }, [page, current, onPageChange]);

    return (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
            <NativeSelect
                size="sm"
                aria-label="page size"
                value={String(pageSize)}
                onChange={(e) => {
                    onPageChange(1);
                    onPageSizeChange(Number(e.target.value));
                }}
            >
                {pageSizeOptions.map((size) => (
                    <NativeSelectOption key={size} value={String(size)}>
                        {size}
                    </NativeSelectOption>
                ))}
            </NativeSelect>
            <span className="text-sm text-muted-foreground tabular-nums">
                {current} / {pageCount}
            </span>
            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Previous page"
                    disabled={current <= 1}
                    onClick={() => onPageChange(current - 1)}
                >
                    <ChevronLeftIcon />
                </Button>
                <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Next page"
                    disabled={current >= pageCount}
                    onClick={() => onPageChange(current + 1)}
                >
                    <ChevronRightIcon />
                </Button>
            </div>
        </div>
    );
}
