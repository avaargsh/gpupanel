import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ManagementPageHeader from '@/components/ManagementPageHeader';
import { useGetHostOperationsQuery, type HostOperation } from '@/api/hostOperationsApi';
import { useAppSelector } from '@/store/hooks';
import { isConfirmablePlan, projectOperationReceipts } from '@/utils/operationViews';

type View = 'tasks' | 'confirmations' | 'activity';

function ReceiptRows({ rows, now }: { rows: HostOperation[]; now: number }) {
    const { t } = useTranslation();
    if (!rows.length) {
        return <p role="status" className="py-8 text-center text-sm text-muted-foreground">{t('opsCenter.emptyView')}</p>;
    }
    return <ul className="flex flex-col gap-2" aria-label={t('opsCenter.receipts')}>
        {rows.map((row) => {
            const isPending = isConfirmablePlan(row, now);
            const expired = row.state === 'planned' && !isPending;
            const stateLabel = expired
                ? t('opsCenter.expired')
                : t(`opsCenter.states.${row.state}` as never, { defaultValue: row.state });
            return <li key={row.id} className="rounded-lg border border-border/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{row.kind}</p>
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                            {t('opsCenter.target')}: {row.host} · {row.target}
                        </p>
                    </div>
                    <Badge variant={row.state === 'failed' || row.state === 'unknown' ? 'destructive' : 'secondary'}>
                        {stateLabel}
                    </Badge>
                </div>
                <p className="mt-2 break-words text-sm text-muted-foreground">{row.impact}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                    {t('opsCenter.created')}: {row.createdAt} · ID: {row.id}
                </p>
                {row.error && <p role="alert" className="mt-2 break-words text-sm text-destructive">{row.error}</p>}
                {row.state === 'unknown' && <p className="mt-2 text-sm">{t('opsCenter.uncertain')}</p>}
                {expired && <p className="mt-2 text-sm">{t('opsCenter.expiredHint')}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                    {isPending && <Button variant="outline" size="sm" asChild>
                        <Link to="/host?tab=operations">{t('opsCenter.reviewInHost')}</Link>
                    </Button>}
                    {(row.state === 'unknown' || row.state === 'failed') && <Button variant="outline" size="sm" asChild>
                        <Link to="/host?tab=operations">{t('opsCenter.inspectReceipt')}</Link>
                    </Button>}
                </div>
            </li>;
        })}
    </ul>;
}

/**
 * Source of truth: the existing authenticated Core GET /hosts/operations.
 * Session-scoped Host receipts only. No ACP Agent / human approval backend is
 * attached; actions remain solely on the existing Host review screen.
 */
export default function OperationsCenterPage() {
    const { t } = useTranslation();
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const [tab, setTab] = useState<View>('tasks');
    const isLocal = node === 'local';
    const receipts = useGetHostOperationsQuery(undefined, {
        skip: !isLocal,
        pollingInterval: 5000,
        refetchOnMountOrArgChange: true,
    });
    const now = Date.now();
    // A failed refresh must never show previously cached receipts as current.
    const rows = isLocal && receipts.isSuccess && !receipts.isError
        ? receipts.currentData ?? []
        : [];
    const projection = projectOperationReceipts(rows, now);
    const labels = {
        tasks: t('opsCenter.tasks'),
        confirmations: t('opsCenter.confirmations'),
        activity: t('opsCenter.activity'),
    };
    return <div className="module-shell management-shell">
        <ManagementPageHeader title={t('opsCenter.title')} />
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">{t('opsCenter.description')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('opsCenter.scope')}</p>
                </div>
                {isLocal && <Button variant="outline" type="button" disabled={receipts.isFetching}
                    onClick={() => void receipts.refetch()}>
                    {receipts.isFetching && <Spinner data-icon="inline-start" />}
                    {t('common.refresh')}
                </Button>}
            </div>
            {!isLocal ? <Alert>
                <AlertDescription>{t('opsCenter.localOnly')}</AlertDescription>
            </Alert> : receipts.isLoading ? <p role="status" className="text-sm text-muted-foreground">
                {t('hostOps.loading')}
            </p> : receipts.isError ? <Alert variant="destructive">
                <AlertDescription>
                    {t('hostOps.loadError')}{' '}
                    <Button variant="outline" size="sm" type="button" onClick={() => void receipts.refetch()}>
                        {t('common.refresh')}
                    </Button>
                </AlertDescription>
            </Alert> : <Tabs value={tab} onValueChange={(next) => setTab(next as View)}>
                <TabsList variant="line" className="module-tabs">
                    <TabsTrigger value="tasks">{labels.tasks} ({projection.tasks.length})</TabsTrigger>
                    <TabsTrigger value="confirmations">{labels.confirmations} ({projection.pendingConfirmation.length})</TabsTrigger>
                    <TabsTrigger value="activity">{labels.activity} ({projection.activity.length})</TabsTrigger>
                </TabsList>
                <Card className="mt-3">
                    <CardHeader className="gap-1">
                        <CardTitle>{labels[tab]}</CardTitle>
                        <p className="text-xs text-muted-foreground">{t('opsCenter.retention')}</p>
                    </CardHeader>
                    <CardContent>
                        <TabsContent value="tasks"><ReceiptRows rows={projection.tasks} now={now} /></TabsContent>
                        <TabsContent value="confirmations"><ReceiptRows rows={projection.pendingConfirmation} now={now} /></TabsContent>
                        <TabsContent value="activity"><ReceiptRows rows={projection.activity} now={now} /></TabsContent>
                    </CardContent>
                </Card>
            </Tabs>}
        </div>
    </div>;
}
