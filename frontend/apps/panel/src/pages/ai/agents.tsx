import { Alert, AlertDescription } from '@/components/ui/alert';
import { OverviewModal, RemarkModal, BindModal, DeleteModal } from './AgentDialogs';

import { useConfirmAction } from '@/components/use-confirm-action';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

import { RefreshCw } from 'lucide-react';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResetAgentTokenMutation, useSearchAgentsQuery, useUnbindAgentWebsiteMutation, type AgentItem } from '@/api/aiApi';
import { useInstalledOpMutation } from '@/api/appApi';
import { useDebouncedValue } from '@/pages/database/shared';
import AgentConfigModal from './agentSettings';
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
export default function AgentsTab() {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [overviewRow, setOverviewRow] = useState<AgentItem | null>(null);
    const [remarkRow, setRemarkRow] = useState<AgentItem | null>(null);
    const [bindRow, setBindRow] = useState<AgentItem | null>(null);
    const [deleteRow, setDeleteRow] = useState<AgentItem | null>(null);
    const [configRow, setConfigRow] = useState<AgentItem | null>(null);
    useEffect(() => {
        setPage(1);
    }, [name]);
    const listQuery = useSearchAgentsQuery({ page, pageSize, name });
    const rows = listQuery.data?.items ?? [];
    const [resetToken] = useResetAgentTokenMutation();
    const [unbind] = useUnbindAgentWebsiteMutation();
    const [installedOp] = useInstalledOpMutation();
    const typeLabel = (type: string) => {
        const map: Record<string, string> = {
            openclaw: 'ai.agents.types.openclaw',
            copaw: 'ai.agents.types.copaw',
            'hermes-agent': 'ai.agents.types.hermes',
        };
        return map[type] ? t(map[type] as never) : type || '-';
    };
    const doOperate = (row: AgentItem, op: string) => {
        confirm({
            title: t(`ai.actions.${op}` as never),
            description: t('ai.agents.operateConfirm', { name: row.name, operate: t(`ai.actions.${op}` as never) }),
            run: async () => {
                try {
                    // 智能体容器操作复用「应用已安装」操作接口，installId 取 agent.appInstallId。
                    await installedOp({ installId: row.appInstallId, operate: op, taskID: uuid() }).unwrap();
                    toast.success(t('common.confirm'));
                    listQuery.refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    const onResetToken = (row: AgentItem) => {
        confirm({
            title: t('ai.actions.reset'),
            description: t('ai.agents.resetConfirm', { name: row.name }),
            run: async () => {
                try {
                    await resetToken({ id: row.id }).unwrap();
                    toast.success(t('ai.agents.resetDone'));
                    listQuery.refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    const onUnbind = (row: AgentItem) => {
        confirm({
            title: t('ai.actions.unbind'),
            description: t('ai.agents.unbindConfirm'),
            run: async () => {
                try {
                    await unbind({ agentId: row.id }).unwrap();
                    toast.success(t('common.confirm'));
                    listQuery.refetch();
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
                            aria-label={t('ai.agents.searchPlaceholder')}
                            value={nameInput}
                            placeholder={t('ai.agents.searchPlaceholder')}
                            style={{ width: 220 }}
                            onChange={(event) => setNameInput(event.target.value)}
                        />
                        <Button onClick={() => listQuery.refetch()} variant={'outline'} type={'button'}>
                            {<RefreshCw />}
                            {t('ai.actions.refresh')}
                        </Button>
                        <span className="text-muted-foreground text-sm">{t('ai.agents.deferred')}</span>
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
                                    <TableHead style={{ width: 110 }}>{t('ai.table.type')}</TableHead>
                                    <TableHead style={{ width: 110 }}>{t('ai.table.status')}</TableHead>
                                    <TableHead style={{ width: 100 }}>{t('ai.table.version')}</TableHead>
                                    <TableHead>{t('ai.table.model')}</TableHead>
                                    <TableHead style={{ width: 100 }}>{t('ai.table.webui')}</TableHead>
                                    <TableHead>{t('ai.table.remark')}</TableHead>
                                    <TableHead style={{ width: 380 }}>{t('ai.table.operate')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {listQuery.isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8}>
                                            <Spinner role="status" aria-label="Loading" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8}>
                                            {<span className="text-muted-foreground text-sm">{t('ai.agents.empty')}</span>}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={row['id'] ?? rowIndex}>
                                            <TableCell>{row['name']}</TableCell>
                                            <TableCell>{typeLabel(row['agentType'])}</TableCell>
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
                                            <TableCell>{row['appVersion'] || '-'}</TableCell>
                                            <TableCell>{row['model'] || '-'}</TableCell>
                                            <TableCell>{row['webUIPort'] || '-'}</TableCell>
                                            <TableCell>{row['remark'] || '-'}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-row flex-wrap gap-3 items-center">
                                                        <Button
                                                            onClick={() => setOverviewRow(row)}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.agents.overview')}
                                                        </Button>
                                                        <Button
                                                            onClick={() => setConfigRow(row)}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.agents.config')}
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
                                                        <Button
                                                            onClick={() => setRemarkRow(row)}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.table.remark')}
                                                        </Button>
                                                        <Button
                                                            onClick={() => onResetToken(row)}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                        >
                                                            {t('ai.actions.reset')}
                                                        </Button>
                                                        {row.websiteId ? (
                                                            <Button
                                                                onClick={() => onUnbind(row)}
                                                                variant={'ghost'}
                                                                size="sm"
                                                                type={'button'}
                                                            >
                                                                {t('ai.actions.unbind')}
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                onClick={() => setBindRow(row)}
                                                                variant={'ghost'}
                                                                size="sm"
                                                                type={'button'}
                                                            >
                                                                {t('ai.actions.bind')}
                                                            </Button>
                                                        )}
                                                        <Button
                                                            onClick={() => setDeleteRow(row)}
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

                    {overviewRow && <OverviewModal row={overviewRow} onClose={() => setOverviewRow(null)} />}
                    {configRow && <AgentConfigModal agentId={configRow.id} name={configRow.name} onClose={() => setConfigRow(null)} />}
                    {remarkRow && <RemarkModal row={remarkRow} onClose={() => setRemarkRow(null)} />}
                    {bindRow && <BindModal row={bindRow} onClose={() => setBindRow(null)} />}
                    {deleteRow && <DeleteModal row={deleteRow} onClose={() => setDeleteRow(null)} />}
                </div>
            }{' '}
        </>
    );
}
