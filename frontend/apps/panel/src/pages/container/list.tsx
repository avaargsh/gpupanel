import {
    useGetContainerListStatsQuery,
    useGetContainerStatusQuery,
    useOperateContainerMutation,
    useSearchContainersQuery,
    type ContainerInfo,
    type ContainerOperation,
    type ContainerState,
} from '@/api/containerApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPercent } from '@/utils/format';
import { useAppSelector } from '@/store/hooks';
import { readPendingContainerOperation, savePendingContainerOperation, clearPendingContainerOperation, unresolvedContainerOperationExists } from '@/utils/container-operation-pending';
import { FileTextIcon, MoreHorizontalIcon, PlusIcon, RefreshCwIcon, TerminalIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from './confirm-dialog';
import { ContainerCreateDialog } from './list-create';
import { ContainerDetailSheet } from './list-detail';
import { ContainerPruneDialog, ContainerRenameDialog } from './list-forms';
import { TablePagination } from './table-pagination';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

interface ContainerListProps {
    onOpenLogs: (container: ContainerInfo) => void;
    onOpenExec: (container: ContainerInfo) => void;
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATE_VARIANT: Record<string, BadgeVariant> = {
    running: 'default',
    created: 'secondary',
    paused: 'outline',
    restarting: 'outline',
    removing: 'outline',
    exited: 'secondary',
    dead: 'destructive',
};

type OrderBy = 'name' | 'createdAt' | 'state';
type Order = 'ascending' | 'descending';

/**
 * 容器列表：状态筛选、搜索、批量操作、创建、运行/停止/重启/删除，
 * 以及跳转到日志 / 终端页签。CPU / 内存占用由 /containers/list/stats 合并。
 */
export default function ContainerList({ onOpenLogs, onOpenExec }: ContainerListProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const currentNode = useAppSelector((state) => state.ui.currentNode) || 'local';
    const eligibleForControlledOperation = (id: string) =>
        currentNode === 'local' && /^[a-f0-9]{64}$/.test(id) &&
        !pendingOperation && !unresolvedContainerOperationExists();
    const openControlledOperation = (kind: 'start' | 'stop' | 'restart', id: string) => {
        if (!eligibleForControlledOperation(id)) return;
        navigate(`/host?tab=operations&operationKind=container.${kind}&operationTarget=${id}`);
    };
    const node = useAppSelector((s) => s.ui.currentNode) || 'local';
    const [pendingOperation, setPendingOperation] = useState(readPendingContainerOperation);
    const [submissionState, setSubmissionState] = useState<'unverified' | 'accepted' | 'unknown'>('unverified');
    const flight = useRef(false);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const [name, setName] = useState('');
    const [state, setState] = useState<ContainerState>('all');
    const [orderBy, setOrderBy] = useState<OrderBy>('createdAt');
    const [order, setOrder] = useState<Order>('descending');
    const [selected, setSelected] = useState<string[]>([]);

    // A selection belongs to the visible query, never to a previous page,
    // filter, or ordering. Clear it before new rows become actionable.
    useEffect(() => {
        setSelected([]);
    }, [page, pageSize, name, state, orderBy, order]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setName(nameInput);
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [nameInput]);

    const listQuery = useSearchContainersQuery({ page, pageSize, name, state, orderBy, order });
    const statusQuery = useGetContainerStatusQuery();
    const statsQuery = useGetContainerListStatsQuery(undefined, { pollingInterval: 5000 });

    const rows = useMemo(() => {
        const items = listQuery.data?.items ?? [];
        const map = new Map((statsQuery.data ?? []).map((s) => [s.containerID, s]));
        return items.map((c) => {
            const s = map.get(c.containerID);
            if (!s) return c;
            return {
                ...c,
                hasLoad: true,
                cpuPercent: s.cpuPercent,
                memoryPercent: s.memoryPercent,
                memoryUsage: s.memoryUsage,
                memoryLimit: s.memoryLimit,
            };
        });
    }, [listQuery.data, statsQuery.data]);

    const total = listQuery.data?.total ?? 0;
    const nameMap = useMemo(() => new Map(rows.map((r) => [r.containerID, r.name])), [rows]);

    const [operate] = useOperateContainerMutation();

    /** HTTP acknowledgement is not a Docker terminal-state proof.
     * Keep a session-scoped, non-secret hint before the POST, and never auto-replay.
     */
    const runOperate = async (operation: ContainerOperation, names: string[]) => {
        const block = (message: string) => {
            toast.error(message);
            if (operation === 'remove') throw new Error(message);
        };
        if (flight.current || pendingOperation || unresolvedContainerOperationExists()) {
            return block(t('container.reconcile.blocked'));
        }
        if (listQuery.isFetching || listQuery.isError || names.length === 0) {
            return block(t('container.reconcile.unavailable'));
        }
        const receipt = { node, operation, names: [...new Set(names)], createdAt: Date.now() };
        if (!savePendingContainerOperation(receipt)) {
            return block(t('container.reconcile.storageFailed'));
        }
        flight.current = true;
        setPendingOperation(receipt);
        setSubmissionState('unverified');
        setSelected([]);
        try {
            await operate({ names: receipt.names, operation }).unwrap();
            setSubmissionState('accepted');
            toast.info(t('container.reconcile.accepted'));
        } catch {
            // A rejected or disconnected response can follow an accepted mutation.
            // Do not claim failure or resend automatically.
            setSubmissionState('unknown');
            toast.error(t('container.reconcile.unknown'));
            if (operation === 'remove') throw new Error(t('container.reconcile.unknown'));
        } finally {
            flight.current = false;
            // Read-only reconciliation, not a proof that start/stop/restart finished.
            void listQuery.refetch();
            void statusQuery.refetch();
        }
    };

    const [removeTarget, setRemoveTarget] = useState<string[] | null>(null);
    const confirmRemove = (names: string[]) => setRemoveTarget(names);
    const handleRemove = async () => {
        if (!removeTarget) return;
        await runOperate('remove', removeTarget);
        setRemoveTarget(null);
    };

    // ---------- 弹窗状态 ----------
    const [createOpen, setCreateOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<ContainerInfo | null>(null);
    const [pruneOpen, setPruneOpen] = useState(false);
    const [detail, setDetail] = useState<ContainerInfo | null>(null);

    // ---------- 状态筛选 chips ----------
    const statusChips = useMemo(() => {
        const s = statusQuery.data;
        if (!s) return [];
        return [
            { key: 'all' as ContainerState, count: s.containerCount },
            { key: 'running' as ContainerState, count: s.running },
            { key: 'exited' as ContainerState, count: s.exited },
            { key: 'created' as ContainerState, count: s.created },
            { key: 'paused' as ContainerState, count: s.paused },
            { key: 'restarting' as ContainerState, count: s.restarting },
            { key: 'dead' as ContainerState, count: s.dead },
        ].filter((c) => c.count > 0 || c.key === 'all');
    }, [statusQuery.data]);

    const idsOnPage = useMemo(() => rows.map((r) => r.containerID), [rows]);
    const allSelected = idsOnPage.length > 0 && idsOnPage.every((id) => selected.includes(id));

    const toggleAll = (checked: boolean) => {
        if (checked) {
            setSelected((prev) => Array.from(new Set([...prev, ...idsOnPage])));
        } else {
            setSelected((prev) => prev.filter((id) => !idsOnPage.includes(id)));
        }
    };

    const toggleRow = (id: string, checked: boolean) => {
        setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
    };

    const selectedNames = selected.map((id) => nameMap.get(id)).filter((n): n is string => Boolean(n));

    return (
        <div className="container-list">
            {pendingOperation && (
                <section role="status" aria-label={t('container.reconcile.title')} className="container-operation-receipt">
                    <div>
                        <h3 className="text-sm font-semibold">{t('container.reconcile.title')}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('container.reconcile.scope')}: {pendingOperation.node} ·
                            {' '}{t(`container.actions.${pendingOperation.operation}`)} ·
                            {' '}{pendingOperation.names.join(', ')}
                        </p>
                        <p className="mt-2 text-sm">{t(`container.reconcile.${submissionState}`)}</p>
                        {pendingOperation.node !== node && (
                            <p className="mt-1 text-xs text-destructive">{t('container.reconcile.otherHost')}</p>
                        )}
                    </div>
                    <div className="container-operation-receipt-actions">
                        <Button size="sm" variant="outline" type="button"
                            disabled={pendingOperation.node !== node || listQuery.isFetching}
                            onClick={() => { void listQuery.refetch(); void statusQuery.refetch(); }}>
                            {t('container.reconcile.refresh')}
                        </Button>
                        <Button size="sm" variant="outline" type="button"
                            disabled={pendingOperation.node !== node || flight.current}
                            onClick={() => {
                                if (!window.confirm(t('container.reconcile.clearConfirm'))) return;
                                if (clearPendingContainerOperation(pendingOperation.createdAt)) {
                                    setPendingOperation(null);
                                    setSubmissionState('unverified');
                                } else toast.error(t('container.reconcile.storageFailed'));
                            }}>
                            {t('container.reconcile.reviewed')}
                        </Button>
                    </div>
                </section>
            )}
            {listQuery.isError ? (
                <Card className="container-list-card">
                    <CardHeader>
                        <CardTitle>{t('container.list.title')}</CardTitle>
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
            ) : (
                <Card className="container-list-card">
                    <CardHeader>
                        <CardTitle>{t('container.list.title')}</CardTitle>
                        <CardAction>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        listQuery.refetch();
                                        statusQuery.refetch();
                                    }}
                                >
                                    <RefreshCwIcon data-icon="inline-start" />
                                    {t('home.refresh')}
                                </Button>
                                <Button variant="outline" onClick={() => setPruneOpen(true)}>
                                    {t('container.prune.title')}
                                </Button>
                                <Button onClick={() => setCreateOpen(true)}>
                                    <PlusIcon data-icon="inline-start" />
                                    {t('container.create.title')}
                                </Button>
                            </div>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="container-list-content">
                        <div className="flex flex-wrap items-center gap-2">
                            {statusChips.map((chip) => (
                                <Button
                                    key={chip.key}
                                    size="sm"
                                    className="container-state-chip"
                                    aria-pressed={state === chip.key}
                                    variant="outline"
                                    onClick={() => {
                                        setState(chip.key);
                                        setPage(1);
                                    }}
                                >
                                    {chip.key === 'all' ? t('container.state.all') : t(`container.state.${chip.key}`)}{' '}
                                    <span className="tabular-nums text-muted-foreground">{chip.count}</span>
                                </Button>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                className="w-[240px]"
                                placeholder={t('container.list.search')}
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                            />
                            <NativeSelect
                                aria-label={t('container.list.orderByCreated')}
                                value={orderBy}
                                onChange={(e) => setOrderBy(e.target.value as typeof orderBy)}
                            >
                                <NativeSelectOption value="createdAt">
                                    {t('container.list.orderByCreated')}
                                </NativeSelectOption>
                                <NativeSelectOption value="name">{t('container.list.orderByName')}</NativeSelectOption>
                                <NativeSelectOption value="state">
                                    {t('container.list.orderByState')}
                                </NativeSelectOption>
                            </NativeSelect>
                            <Button
                                variant="outline"
                                onClick={() => setOrder((o) => (o === 'ascending' ? 'descending' : 'ascending'))}
                            >
                                {order === 'ascending' ? t('container.list.ascending') : t('container.list.descending')}
                            </Button>

                        </div>

                            {!listQuery.isFetching && !listQuery.isError && selectedNames.length > 0 && (
                                <div className="container-selection-toolbar" role="region" aria-label={t('container.list.selected', { count: selectedNames.length })}>
                                    <span className="text-sm text-muted-foreground">
                                        {t('container.list.selected', { count: selectedNames.length })}
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={selected.length !== 1 || !rows.some((row) => selected.includes(row.containerID) &&
                                            (row.state === 'created' || row.state === 'exited') && eligibleForControlledOperation(row.containerID))}
                                        onClick={() => {
                                            const match = rows.find((row) => selected.includes(row.containerID));
                                            if (match && selected.length === 1 && (match.state === 'created' || match.state === 'exited')) openControlledOperation('start', match.containerID);
                                        }}
                                    >
                                        {t('container.actions.start')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={selected.length !== 1 || !rows.some((row) => selected.includes(row.containerID) &&
                                            row.state === 'running' && eligibleForControlledOperation(row.containerID))}
                                        onClick={() => {
                                            const match = rows.find((row) => selected.includes(row.containerID));
                                            if (match && selected.length === 1 && match.state === 'running') openControlledOperation('stop', match.containerID);
                                        }}
                                    >
                                        {t('container.actions.stop')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={selected.length !== 1 || !rows.some((row) => selected.includes(row.containerID) && eligibleForControlledOperation(row.containerID))}
                                        title={t('container.reconcile.restartSingleHint')}
                                        onClick={() => {
                                            const match = rows.find((row) => selected.includes(row.containerID));
                                            if (match && selected.length === 1) openControlledOperation('restart', match.containerID);
                                        }}
                                    >
                                        {t('container.reconcile.controlledRestart')}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => confirmRemove(selectedNames)}
                                    >
                                        {t('container.actions.remove')}
                                    </Button>
                                </div>
                            )}

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
                                            aria-label={t('container.list.title')}
                                            checked={allSelected}
                                            disabled={idsOnPage.length === 0}
                                            onCheckedChange={(checked) => toggleAll(checked === true)}
                                        />
                                    </TableHead>
                                    <TableHead>{t('container.table.name')}</TableHead>
                                    <TableHead className="w-[110px]">{t('container.table.state')}</TableHead>
                                    <TableHead>{t('container.table.image')}</TableHead>
                                    <TableHead className="w-[110px]">{t('container.table.cpu')}</TableHead>
                                    <TableHead className="w-[110px]">{t('container.table.memory')}</TableHead>
                                    <TableHead className="w-[140px]">{t('container.table.ports')}</TableHead>
                                    <TableHead className="w-[190px]">{t('container.table.created')}</TableHead>
                                    <TableHead className="w-[240px]">{t('container.table.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                                            {t('container.list.empty')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => {
                                        const isRunning = row.state === 'running';
                                        const isPaused = row.state === 'paused';
                                        return (
                                            <TableRow key={row.containerID}>
                                                <TableCell>
                                                    <Checkbox
                                                        aria-label={row.name}
                                                        checked={selected.includes(row.containerID)}
                                                        onCheckedChange={(checked) =>
                                                            toggleRow(row.containerID, checked === true)
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className="font-medium text-primary hover:underline"
                                                            onClick={() => setDetail(row)}
                                                        >
                                                            {row.name}
                                                        </button>
                                                        {row.isFromApp && (
                                                            <Badge variant="secondary">
                                                                {t('container.table.fromApp')}
                                                            </Badge>
                                                        )}
                                                        {row.isFromCompose && (
                                                            <Badge variant="outline">
                                                                {t('container.table.fromCompose')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={STATE_VARIANT[row.state] ?? 'outline'}>
                                                        {t(`container.state.${row.state}`) || row.state}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm">{row.imageName}</TableCell>
                                                <TableCell className="text-sm">
                                                    {row.hasLoad ? formatPercent(row.cpuPercent) : '—'}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {row.hasLoad ? formatPercent(row.memoryPercent) : '—'}
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {row.ports?.length
                                                        ? `${row.ports.length} ${t('container.table.items')}`
                                                        : '—'}
                                                </TableCell>
                                                <TableCell className="text-sm">{row.createTime}</TableCell>
                                                <TableCell>
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        {isRunning && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={!eligibleForControlledOperation(row.containerID)}
                                                                onClick={() => openControlledOperation('stop', row.containerID)}
                                                            >
                                                                {t('container.actions.stop')}
                                                            </Button>
                                                        )}
                                                        {(row.state === 'exited' ||
                                                            row.state === 'created') && (
                                                            <Button
                                                                size="sm"
                                                                disabled={!eligibleForControlledOperation(row.containerID)}
                                                                onClick={() => openControlledOperation('start', row.containerID)}
                                                            >
                                                                {t('container.actions.start')}
                                                            </Button>
                                                        )}
                                                        {isPaused && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => runOperate('unpause', [row.name])}
                                                            >
                                                                {t('container.actions.unpause')}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => onOpenLogs(row)}
                                                        >
                                                            <FileTextIcon data-icon="inline-start" />
                                                            {t('container.actions.logs')}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={!isRunning}
                                                            onClick={() => onOpenExec(row)}
                                                        >
                                                            <TerminalIcon data-icon="inline-start" />
                                                            {t('container.actions.exec')}
                                                        </Button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button
                                                                    size="icon-sm"
                                                                    variant="ghost"
                                                                    aria-label={t('container.table.actions')}
                                                                >
                                                                    <MoreHorizontalIcon />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuGroup>
                                                                    <DropdownMenuItem onSelect={() => setDetail(row)}>
                                                                        {t('container.actions.detail')}
                                                                    </DropdownMenuItem>
                                                                    {isRunning && (
                                                                        <DropdownMenuItem
                                                                            disabled={!eligibleForControlledOperation(row.containerID)}
                                                                            onSelect={() => openControlledOperation('restart', row.containerID)}
                                                                        >
                                                                            {t('container.reconcile.controlledRestart')}
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    {isRunning && (
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                runOperate('pause', [row.name])
                                                                            }
                                                                        >
                                                                            {t('container.actions.pause')}
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    {isRunning && (
                                                                        <DropdownMenuItem
                                                                            onClick={() =>
                                                                                runOperate('kill', [row.name])
                                                                            }
                                                                        >
                                                                            {t('container.actions.kill')}
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                    <DropdownMenuItem
                                                                        onClick={() => setRenameTarget(row)}
                                                                    >
                                                                        {t('container.actions.rename')}
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuItem
                                                                        variant="destructive"
                                                                        onClick={() => confirmRemove([row.name])}
                                                                    >
                                                                        {t('container.actions.remove')}
                                                                    </DropdownMenuItem>
                                                                </DropdownMenuGroup>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>

                        {total > 0 || page > 1 ? (
                            <TablePagination
                                page={page}
                                pageSize={pageSize}
                                total={total}
                                onPageChange={setPage}
                                onPageSizeChange={setPageSize}
                            />
                        ) : null}
                    </CardContent>
                </Card>
            )}

            <ContainerCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
            <ContainerRenameDialog target={renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)} />
            <ContainerPruneDialog open={pruneOpen} onOpenChange={setPruneOpen} />
            <ContainerDetailSheet container={detail} onClose={() => setDetail(null)} />

            <ConfirmDialog
                open={Boolean(removeTarget)}
                onOpenChange={(open) => {
                    if (!open) setRemoveTarget(null);
                }}
                title={t('container.actions.removeTitle')}
                description={t('container.actions.removeContent', { names: (removeTarget ?? []).join(', ') })}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                destructive
                onConfirm={handleRemove}
            />
        </div>
    );
}
