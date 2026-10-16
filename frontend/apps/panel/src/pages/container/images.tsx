import type { ImageInfo } from '@/api/containerApi';
import { usePullImageMutation, useRemoveImageMutation, useSearchImagesQuery } from '@/api/containerApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes } from '@/utils/format';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from './confirm-dialog';
import { TablePagination } from './table-pagination';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/**
 * 镜像页签：镜像列表 + 拉取 + 删除。
 */
export default function ContainerImages() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const [name, setName] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setName(nameInput);
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [nameInput]);

    const listQuery = useSearchImagesQuery({ page, pageSize, name, orderBy: 'createdAt', order: 'descending' });
    const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

    const [removeImage] = useRemoveImageMutation();
    const [pullImage, { isLoading: pulling }] = usePullImageMutation();

    const [removeTarget, setRemoveTarget] = useState<string[] | null>(null);
    const [pullOpen, setPullOpen] = useState(false);
    const [pullInput, setPullInput] = useState('');
    const [pullError, setPullError] = useState('');

    const confirmRemove = (names: string[]) => setRemoveTarget(names);

    const handleRemove = async () => {
        if (!removeTarget) return;
        try {
            await removeImage({ names: removeTarget }).unwrap();
            toast.success(t('container.images.removeSuccess'));
            setSelected([]);
            setRemoveTarget(null);
        } catch (e) {
            toast.error(errText(e));
            throw new Error(errText(e));
        }
    };

    const handlePull = async () => {
        const imageName = pullInput
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        if (!imageName.length) {
            setPullError(t('container.images.pullRequired'));
            return;
        }
        try {
            await pullImage({ imageName, repoID: 0 }).unwrap();
            toast.success(t('container.images.pullSuccess'));
            setPullOpen(false);
            setPullInput('');
            setPullError('');
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const selectableIds = rows.filter((r) => !r.isUsed).map((r) => r.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

    const toggleAll = (checked: boolean) => {
        if (checked) {
            setSelected((prev) => Array.from(new Set([...prev, ...selectableIds])));
        } else {
            setSelected((prev) => prev.filter((id) => !selectableIds.includes(id)));
        }
    };

    const toggleRow = (id: string, checked: boolean) => {
        setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
    };

    if (listQuery.isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('container.images.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>{t('container.overview.noData')}</EmptyTitle>
                            <EmptyDescription>{t('container.overview.backendOffline')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="module-section">
            <Card>
                <CardHeader>
                    <CardTitle>{t('container.images.title')}</CardTitle>
                    <CardAction>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" onClick={() => listQuery.refetch()}>
                                <RefreshCwIcon data-icon="inline-start" />
                                {t('home.refresh')}
                            </Button>
                            {selected.length > 0 && (
                                <Button variant="destructive" onClick={() => confirmRemove(selected)}>
                                    {t('container.images.remove')} ({selected.length})
                                </Button>
                            )}
                            <Button onClick={() => setPullOpen(true)}>
                                <PlusIcon data-icon="inline-start" />
                                {t('container.images.pull')}
                            </Button>
                        </div>
                    </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <Input
                        className="max-w-[280px]"
                        placeholder={t('container.images.search')}
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                    />
                    {listQuery.isFetching ? (
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Spinner />
                            {t('common.loading')}
                        </span>
                    ) : null}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40px]">
                                    <Checkbox
                                        aria-label={t('container.images.inUse')}
                                        checked={allSelected}
                                        disabled={selectableIds.length === 0}
                                        onCheckedChange={(checked) => toggleAll(checked === true)}
                                    />
                                </TableHead>
                                <TableHead>{t('container.images.name')}</TableHead>
                                <TableHead className="w-[140px]">{t('container.images.id')}</TableHead>
                                <TableHead className="w-[120px]">{t('container.images.size')}</TableHead>
                                <TableHead className="w-[200px]">{t('container.images.created')}</TableHead>
                                <TableHead className="w-[100px]">{t('container.table.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                                        {t('container.images.empty')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row: ImageInfo) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            <Checkbox
                                                aria-label={row.id}
                                                checked={selected.includes(row.id)}
                                                disabled={row.isUsed}
                                                onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                {row.tags && row.tags.length ? (
                                                    row.tags.map((tag) => (
                                                        <Badge key={tag} variant="secondary">
                                                            {tag}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">
                                                        {row.id.slice(0, 12)}
                                                    </span>
                                                )}
                                                {row.isUsed && (
                                                    <Badge variant="outline">{t('container.images.inUse')}</Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{row.id.slice(0, 12)}</TableCell>
                                        <TableCell>{formatBytes(row.size)}</TableCell>
                                        <TableCell className="text-sm">{row.createdAt}</TableCell>
                                        <TableCell>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                disabled={row.isUsed}
                                                onClick={() =>
                                                    confirmRemove(row.tags && row.tags.length ? row.tags : [row.id])
                                                }
                                            >
                                                {t('container.images.remove')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {rows.length > 0 || page > 1 || (listQuery.data?.total ?? 0) > 0 ? (
                        <TablePagination
                            page={page}
                            pageSize={pageSize}
                            total={listQuery.data?.total ?? 0}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                        />
                    ) : null}
                </CardContent>
            </Card>

            <Dialog
                open={pullOpen}
                onOpenChange={(open) => {
                    setPullOpen(open);
                    if (!open) {
                        setPullInput('');
                        setPullError('');
                    }
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('container.images.pull')}</DialogTitle>
                    </DialogHeader>
                    <Field>
                        <FieldLabel htmlFor="pull-images">{t('container.images.pullName')}</FieldLabel>
                        <Textarea
                            id="pull-images"
                            aria-invalid={Boolean(pullError)}
                            aria-describedby={pullError ? 'pull-images-error' : undefined}
                            className="min-h-[100px]"
                            placeholder={'nginx:latest\nredis:7'}
                            value={pullInput}
                            onChange={(e) => {
                                setPullInput(e.target.value);
                                if (pullError) setPullError('');
                            }}
                        />
                        {pullError ? (
                            <span id="pull-images-error" role="alert" className="text-sm text-destructive">
                                {pullError}
                            </span>
                        ) : null}
                    </Field>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPullOpen(false);
                                setPullInput('');
                                setPullError('');
                            }}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handlePull} disabled={pulling}>
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={Boolean(removeTarget)}
                onOpenChange={(open) => {
                    if (!open) setRemoveTarget(null);
                }}
                title={t('container.images.removeTitle')}
                description={t('container.images.removeContent', { names: (removeTarget ?? []).join(', ') })}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                destructive
                onConfirm={handleRemove}
            />
        </div>
    );
}
