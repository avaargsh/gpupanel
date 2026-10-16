import { Alert, AlertDescription } from '@/components/ui/alert';
import { McpFormModal, DomainModal } from './McpSettings';

import { useConfirmAction } from '@/components/use-confirm-action';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Plus, RefreshCw } from 'lucide-react';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useDeleteMcpServerMutation,
    useOperateMcpServerMutation,
    usePageMcpServersQuery,
    useSyncMcpStatusMutation,
    useTestMcpConnectionMutation,
    type McpServer,
} from '@/api/aiApi';
import { useDebouncedValue } from '@/pages/database/shared';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
function statusColor(status: string) {
    switch ((status || '').toLowerCase()) {
        case 'running':
            return 'green';
        case 'error':
            return 'red';
        case 'stopped':
            return 'grey';
        default:
            return 'blue';
    }
}
export default function McpTab() {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [formRow, setFormRow] = useState<McpServer | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showDomain, setShowDomain] = useState(false);
    useEffect(() => {
        setPage(1);
    }, [name]);
    const listQuery = usePageMcpServersQuery({ page, pageSize, name });
    const rows = listQuery.data?.items ?? [];
    const [operate] = useOperateMcpServerMutation();
    const [remove] = useDeleteMcpServerMutation();
    const [syncStatus] = useSyncMcpStatusMutation();
    const [test] = useTestMcpConnectionMutation();
    const onRefresh = async () => {
        const ids = rows.map((r) => r.id);
        if (ids.length) {
            try {
                await syncStatus({ ids }).unwrap();
            } catch {
                /* ignore sync errors */
            }
        }
        listQuery.refetch();
    };
    const doOperate = (row: McpServer, op: string) => {
        confirm({
            title: t(`ai.actions.${op}` as never),
            description: t('ai.mcp.operateConfirm', { name: row.name, operate: t(`ai.actions.${op}` as never) }),
            run: async () => {
                try {
                    await operate({ id: row.id, operate: op }).unwrap();
                    toast.success(t('common.confirm'));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    const onTest = async (row: McpServer) => {
        try {
            const res = await test({ id: row.id }).unwrap();
            if (res?.success) toast.success(`${t('ai.mcp.testSuccess')}${res.message ? `: ${res.message}` : ''}`);
            else toast.error(`${t('ai.mcp.testFailed')}${res?.message ? `: ${res.message}` : ''}`);
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const onDelete = (row: McpServer) => {
        confirm({
            title: t('ai.actions.delete'),
            description: t('ai.mcp.deleteConfirm', { name: row.name }),
            run: async () => {
                try {
                    await remove({ id: row.id }).unwrap();
                    toast.success(t('common.confirm'));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    return (
        <>
            {' '}
            {dialog}{' '}
            {
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="flex flex-row flex-wrap gap-3 items-center">
                        <Input
                            aria-label={t('ai.mcp.searchPlaceholder')}
                            value={nameInput}
                            placeholder={t('ai.mcp.searchPlaceholder')}
                            style={{ width: 220 }}
                            onChange={(event) => setNameInput(event.target.value)}
                        />
                        <Button
                            onClick={() => {
                                setFormRow(null);
                                setShowForm(true);
                            }}
                            variant={'default'}
                            type={'button'}
                        >
                            {<Plus />}
                            {t('ai.mcp.create')}
                        </Button>
                        <Button onClick={() => setShowDomain(true)} variant={'outline'} type={'button'}>
                            {t('ai.mcp.bindDomain')}
                        </Button>
                        <Button onClick={onRefresh} variant={'outline'} type={'button'}>
                            {<RefreshCw />}
                            {t('ai.actions.refresh')}
                        </Button>
                    </div>

                    {listQuery.isError && (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {t('hostOps.loadError')}{' '}
                                <Button variant="outline" onClick={() => void listQuery.refetch()}>
                                    {t('common.refresh')}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    )}
                    <div className="flex flex-col gap-3" aria-busy={listQuery.isLoading}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('ai.table.name')}</TableHead>
                                    <TableHead style={{ width: 110 }}>{t('ai.table.status')}</TableHead>
                                    <TableHead style={{ width: 90 }}>{t('ai.table.type')}</TableHead>
                                    <TableHead style={{ width: 90 }}>{t('ai.table.port')}</TableHead>
                                    <TableHead>{t('ai.table.address')}</TableHead>
                                    <TableHead style={{ width: 340 }}>{t('ai.table.operate')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {listQuery.isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            <Spinner role="status" aria-label="Loading" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            {<span className="text-muted-foreground text-sm">{t('ai.mcp.empty')}</span>}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={row['id'] ?? rowIndex}>
                                            <TableCell>{row['name']}</TableCell>
                                            <TableCell>
                                                {
                                                    <Badge
                                                        variant={
                                                            ['red', 'orange'].includes(statusColor(row['status']))
                                                                ? 'destructive'
                                                                : 'secondary'
                                                        }
                                                    >
                                                        {row['status'] || '-'}
                                                    </Badge>
                                                }
                                            </TableCell>
                                            <TableCell>{row['type'] || '-'}</TableCell>
                                            <TableCell>{row['port']}</TableCell>
                                            <TableCell className="max-w-64 truncate">{row.url || row.baseUrl || '-'}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-row  gap-3 items-center">
                                                        <Button
                                                            onClick={() => {
                                                                setFormRow(row);
                                                                setShowForm(true);
                                                            }}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.actions.edit')}
                                                        </Button>
                                                        <Button
                                                            onClick={() => doOperate(row, 'start')}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.actions.start')}
                                                        </Button>
                                                        <Button
                                                            onClick={() => doOperate(row, 'stop')}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.actions.stop')}
                                                        </Button>
                                                        <Button
                                                            onClick={() => doOperate(row, 'restart')}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.actions.restart')}
                                                        </Button>
                                                        <Button onClick={() => onTest(row)} variant={'ghost'} size="sm" type={'button'}>
                                                            {t('ai.actions.test')}
                                                        </Button>
                                                        <Button
                                                            onClick={() => onDelete(row)}
                                                            variant={'destructive'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.actions.delete')}
                                                        </Button>
                                                    </div>
                                                }
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <Button variant="outline" disabled={page <= 1 || listQuery.isLoading} onClick={() => setPage(page - 1)}>
                                ‹
                            </Button>
                            <span>
                                {page} / {Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 20))}
                            </span>
                            <Button
                                variant="outline"
                                disabled={page * 20 >= (listQuery.data?.total ?? 0) || listQuery.isLoading}
                                onClick={() => setPage(page + 1)}
                            >
                                ›
                            </Button>
                            <NativeSelect
                                aria-label="Page size"
                                value={20}
                                onChange={(event) => {
                                    setPageSize(Number(event.target.value));
                                    setPage(1);
                                }}
                            >
                                {[10, 20, 50].map((size) => (
                                    <NativeSelectOption key={size} value={size}>
                                        {size}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </div>
                    </div>

                    {showForm && <McpFormModal row={formRow} onClose={() => setShowForm(false)} />}
                    {showDomain && <DomainModal onClose={() => setShowDomain(false)} />}
                </div>
            }{' '}
        </>
    );
}
