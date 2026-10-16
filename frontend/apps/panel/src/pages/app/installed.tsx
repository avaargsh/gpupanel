import { UninstallModal } from './InstalledRemoval';
import { UpgradeModal, IgnoreModal, IgnoredListModal } from './InstalledUpgrade';
import { ParamsModal, SortModal } from './InstalledConfig';
import { useConfirmAction } from '@/components/use-confirm-action';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { newInstallTaskID } from './InstallModal';
import EvidenceSheet from './EvidenceSheet';
import { useAppSelector } from '@/store/hooks';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAppIconUrl, useInstalledOpMutation, useSearchInstalledQuery, type AppInstallDto } from '@/api/appApi';
import { useDebouncedValue } from '@/pages/database/shared';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = newInstallTaskID;
function statusKey(status: string) {
    const map: Record<string, string> = {
        running: 'running',
        stopped: 'stopped',
        installing: 'installing',
        uninstalling: 'uninstalling',
        upgrading: 'upgrading',
        rebuilding: 'rebuilding',
        error: 'error',
        downloaderr: 'downloadErr',
        starting: 'starting',
    };
    return map[status.toLowerCase()] ?? 'other';
}
function statusColor(status: string) {
    switch (status) {
        case 'Running':
            return 'green';
        case 'Error':
        case 'DownloadErr':
            return 'red';
        case 'Stopped':
            return 'grey';
        default:
            return 'blue';
    }
}
export default function InstalledTab({ upgradeOnly = false }: { upgradeOnly?: boolean }) {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const [evidenceId, setEvidenceId] = useState<number | null>(null);
    const [uninstallRow, setUninstallRow] = useState<AppInstallDto | null>(null);
    const [upgradeRow, setUpgradeRow] = useState<AppInstallDto | null>(null);
    const [paramsRow, setParamsRow] = useState<AppInstallDto | null>(null);
    const [ignoreRow, setIgnoreRow] = useState<AppInstallDto | null>(null);
    const [ignoredOpen, setIgnoredOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);
    useEffect(() => {
        setPage(1);
    }, [name]);
    const listQuery = useSearchInstalledQuery({ page, pageSize, name, tags: [], update: upgradeOnly, sync: false });
    const rows = listQuery.currentData?.items ?? [];
    const [op, { isLoading: operating }] = useInstalledOpMutation();
    const doOperate = (row: AppInstallDto, operate: string) => {
        if (row.status.toUpperCase() === 'UNKNOWN') return toast.warning('先核对未知安装状态 / Review UNKNOWN installation first');
        const label = operate === 'delete' ? 'uninstall' : operate;
        confirm({
            title: t(`apps.actions.${label}` as never),
            description: t('apps.operateConfirm', { name: row.name, operate: t(`apps.actions.${label}` as never) }),
            run: async () => {
                try {
                    await op({ installId: row.id, operate, taskID: uuid() }).unwrap();
                    toast.success(t('apps.install.success'));
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
                            aria-label={t('apps.store.searchPlaceholder')}
                            value={nameInput}
                            placeholder={t('apps.store.searchPlaceholder')}
                            style={{ width: 220 }}
                            onChange={(event) => setNameInput(event.target.value)}
                        />
                        <Button onClick={() => listQuery.refetch()} variant={'outline'} type={'button'}>
                            {<RefreshCw />}
                            {t('apps.actions.refresh')}
                        </Button>
                        {upgradeOnly && (
                            <Button onClick={() => setIgnoredOpen(true)} variant={'outline'} type={'button'}>
                                {t('apps.actions.ignoredList')}
                            </Button>
                        )}
                        {!upgradeOnly && (
                            <Button onClick={() => setSortOpen(true)} variant={'outline'} type={'button'}>
                                {t('apps.actions.sort')}
                            </Button>
                        )}
                    </div>

                    {listQuery.isError ? (
                        <Alert variant="destructive">
                            <AlertDescription>{'列表加载失败，请重试 / List failed; retry'}</AlertDescription>
                        </Alert>
                    ) : null}
                    <div className="flex flex-col gap-3" aria-busy={listQuery.isLoading || operating}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('apps.table.name')}</TableHead>
                                    <TableHead style={{ width: 110 }}>{t('apps.table.version')}</TableHead>
                                    <TableHead style={{ width: 120 }}>{t('apps.table.status')}</TableHead>
                                    <TableHead style={{ width: 110 }}>{t('apps.table.webUI')}</TableHead>
                                    <TableHead style={{ width: 200 }}>{t('apps.table.path')}</TableHead>
                                    <TableHead style={{ width: 320 }}>{t('apps.table.operate')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {listQuery.isLoading || operating ? (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            <Spinner role="status" aria-label="Loading" />
                                        </TableCell>
                                    </TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6}>
                                            {<span className="text-muted-foreground text-sm">{t('apps.installed.empty')}</span>}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row, rowIndex) => (
                                        <TableRow key={row['id'] ?? rowIndex}>
                                            <TableCell>
                                                {
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <img
                                                            src={getAppIconUrl(row.appKey)}
                                                            alt={row.appName}
                                                            style={{ width: 24, height: 24, objectFit: 'contain' }}
                                                        />
                                                        <span className="text-sm">{row['name']}</span>
                                                    </div>
                                                }
                                            </TableCell>
                                            <TableCell>{row['version'] || '-'}</TableCell>
                                            <TableCell>
                                                {
                                                    <Badge
                                                        variant={
                                                            ['red', 'orange'].includes(
                                                                row['status'].toUpperCase() === 'UNKNOWN'
                                                                    ? 'orange'
                                                                    : statusColor(row['status']),
                                                            )
                                                                ? 'destructive'
                                                                : 'secondary'
                                                        }
                                                    >
                                                        {row['status'].toUpperCase() === 'UNKNOWN'
                                                            ? 'UNKNOWN'
                                                            : t(`apps.status.${statusKey(row['status'])}`)}
                                                    </Badge>
                                                }
                                            </TableCell>
                                            <TableCell>{row['httpPort'] ? String(row['httpPort']) : '-'}</TableCell>
                                            <TableCell>{row['path'] || '-'}</TableCell>
                                            <TableCell>
                                                {
                                                    <div className="flex flex-row flex-wrap gap-3 items-center">
                                                        <Button
                                                            onClick={() => setEvidenceId(row.id)}
                                                            variant={'ghost'}
                                                            size="sm"
                                                            type={'button'}
                                                            disabled={node !== 'local'}
                                                        >
                                                            证据 / Evidence
                                                        </Button>
                                                        {row.status.toUpperCase() === 'UNKNOWN' ? (
                                                            <span className="text-muted-foreground text-sm">
                                                                UNKNOWN · 请人工核对 / Manual review required
                                                            </span>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    onClick={() => doOperate(row, 'start')}
                                                                    variant={'ghost'}
                                                                    size="sm"
                                                                    type={'button'}
                                                                    disabled={false || operating}
                                                                >
                                                                    {operating ? <Spinner data-icon="inline-start" /> : null}
                                                                    {t('apps.actions.start')}
                                                                </Button>
                                                                <Button
                                                                    onClick={() => doOperate(row, 'stop')}
                                                                    variant={'ghost'}
                                                                    size="sm"
                                                                    type={'button'}
                                                                    disabled={false || operating}
                                                                >
                                                                    {operating ? <Spinner data-icon="inline-start" /> : null}
                                                                    {t('apps.actions.stop')}
                                                                </Button>
                                                                <Button
                                                                    onClick={() => doOperate(row, 'restart')}
                                                                    variant={'ghost'}
                                                                    size="sm"
                                                                    type={'button'}
                                                                    disabled={false || operating}
                                                                >
                                                                    {operating ? <Spinner data-icon="inline-start" /> : null}
                                                                    {t('apps.actions.restart')}
                                                                </Button>
                                                                <Button
                                                                    onClick={() => doOperate(row, 'rebuild')}
                                                                    variant={'ghost'}
                                                                    size="sm"
                                                                    type={'button'}
                                                                    disabled={false || operating}
                                                                >
                                                                    {operating ? <Spinner data-icon="inline-start" /> : null}
                                                                    {t('apps.actions.rebuild')}
                                                                </Button>
                                                                <Button
                                                                    onClick={() => setParamsRow(row)}
                                                                    variant={'ghost'}
                                                                    size="sm"
                                                                    type={'button'}
                                                                >
                                                                    {t('apps.actions.params')}
                                                                </Button>
                                                                {!upgradeOnly && (
                                                                    <Button
                                                                        onClick={() => setUpgradeRow(row)}
                                                                        variant={'ghost'}
                                                                        size="sm"
                                                                        type={'button'}
                                                                    >
                                                                        {t('apps.actions.upgrade')}
                                                                    </Button>
                                                                )}
                                                                {upgradeOnly && (
                                                                    <Button
                                                                        onClick={() => setIgnoreRow(row)}
                                                                        variant={'ghost'}
                                                                        size="sm"
                                                                        type={'button'}
                                                                    >
                                                                        {t('apps.actions.ignore')}
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    onClick={() => setUninstallRow(row)}
                                                                    variant={'destructive'}
                                                                    size="sm"
                                                                    type={'button'}
                                                                >
                                                                    {t('apps.actions.uninstall')}
                                                                </Button>
                                                            </>
                                                        )}
                                                    </div>
                                                }
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <Button
                                variant="outline"
                                disabled={page <= 1 || listQuery.isLoading || operating}
                                onClick={() => setPage(page - 1)}
                            >
                                ‹
                            </Button>
                            <span>
                                {page} / {Math.max(1, Math.ceil((listQuery.data?.total ?? 0) / 20))}
                            </span>
                            <Button
                                variant="outline"
                                disabled={page * 20 >= (listQuery.data?.total ?? 0) || listQuery.isLoading || operating}
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

                    {evidenceId !== null && (
                        <EvidenceSheet key={`${node}:${evidenceId}`} id={evidenceId} onClose={() => setEvidenceId(null)} />
                    )}
                    {uninstallRow && <UninstallModal row={uninstallRow} onClose={() => setUninstallRow(null)} />}
                    {upgradeRow && <UpgradeModal row={upgradeRow} onClose={() => setUpgradeRow(null)} />}
                    {paramsRow && <ParamsModal row={paramsRow} onClose={() => setParamsRow(null)} />}
                    {ignoreRow && <IgnoreModal row={ignoreRow} onClose={() => setIgnoreRow(null)} onSaved={() => listQuery.refetch()} />}
                    {ignoredOpen && <IgnoredListModal onClose={() => setIgnoredOpen(false)} />}
                    {sortOpen && (
                        <SortModal
                            rows={rows}
                            onClose={() => {
                                setSortOpen(false);
                                listQuery.refetch();
                            }}
                        />
                    )}
                </div>
            }{' '}
        </>
    );
}
