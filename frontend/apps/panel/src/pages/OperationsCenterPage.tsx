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
import { useSearchTasksQuery, type TaskInfo } from '@/api/logsApi';
import { useAppSelector } from '@/store/hooks';
import { isConfirmablePlan, projectOperationReceipts } from '@/utils/operationViews';
import { projectAgentTasks } from '@/utils/agentTaskViews';

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

function AgentTaskRows({ rows }: { rows: TaskInfo[] }) {
    const { t } = useTranslation();
    if (!rows.length) return <p role="status" className="py-6 text-sm text-muted-foreground">{t('opsCenter.emptyTasks')}</p>;
    return <ul className="flex flex-col gap-2" aria-label={t('opsCenter.agentTasks')}>
        {rows.map((row) => <li key={row.id} className="rounded-lg border border-border/70 p-4">
            <div className="flex flex-wrap justify-between gap-2">
                <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{row.name || row.type || t('opsCenter.taskUnnamed')}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{row.type} · {row.operate}</p>
                </div>
                <Badge variant={row.status === 'Failed' || row.status === 'Unknown' ? 'destructive' : 'secondary'}>
                    {t('opsCenter.taskStates.' + row.status, { defaultValue: row.status || t('opsCenter.unrecognized') })}
                </Badge>
            </div>
            <p className="mt-2 break-all text-xs text-muted-foreground">{t('opsCenter.created')}: {row.createdAt} · ID: {row.id}</p>
            {(row.status === 'Unknown' || row.status === 'Failed') && <p className="mt-2 text-sm">{t('opsCenter.taskWarning')}</p>}
            <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/logs?tab=task">{t('opsCenter.openTaskLogs')}</Link>
            </Button>
        </li>)}
    </ul>;
}

/**
 * Source of truth: the existing authenticated Core GET /hosts/operations.
 * Host receipts are session-scoped; Agent task logs come separately from the
 * existing local /logs/tasks/search (not session-scoped). No ACP approval backend is
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
    const taskLogs = useSearchTasksQuery(
        { page: 1, pageSize: 20, type: '', status: '' },
        { skip: !isLocal, pollingInterval: 5000, refetchOnMountOrArgChange: true },
    );
    const now = Date.now();
    // A failed refresh must never show previously cached receipts as current.
    const rows = isLocal && receipts.isSuccess && !receipts.isError
        ? receipts.currentData ?? []
        : [];
    const projection = projectOperationReceipts(rows, now);
    // Agent tasks are a separate local-host execution log, NOT Host receipts
    // or per-session approvals. Never display stale cached results on refresh.
    const executionTasks = isLocal && !taskLogs.isFetching && !taskLogs.isError && taskLogs.isSuccess
        ? (taskLogs.currentData?.items ?? [])
        : [];
    const agentTasks = projectAgentTasks(executionTasks);
    const agentTaskSection = (items: TaskInfo[]) => (
        <section className="mt-5 border-t pt-4" aria-label={t('opsCenter.agentTasks')}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">{t('opsCenter.agentTasks')}</h3>
                    <p className="text-xs text-muted-foreground">{t('opsCenter.agentScope')}</p>
                </div>
                <Button asChild size="sm" variant="ghost"><Link to="/logs?tab=task">{t('opsCenter.allTaskLogs')}</Link></Button>
            </div>
            {taskLogs.isError ? <Alert variant="destructive"><AlertDescription>
                {t('opsCenter.taskLoadError')}{' '}
                <Button type="button" size="sm" variant="outline" onClick={() => void taskLogs.refetch()}>
                    {t('common.refresh')}
                </Button>
            </AlertDescription></Alert> : taskLogs.isLoading || taskLogs.isFetching
                ? <p role="status" className="text-sm text-muted-foreground">{t('hostOps.loading')}</p>
                : <AgentTaskRows rows={items} />}
        </section>
    );
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
                {isLocal && <Button variant="outline" type="button" disabled={receipts.isFetching || taskLogs.isFetching}
                    onClick={() => { void receipts.refetch(); void taskLogs.refetch(); }}>
                    {(receipts.isFetching || taskLogs.isFetching) && <Spinner data-icon="inline-start" />}
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
                    <TabsTrigger value="tasks">{labels.tasks}</TabsTrigger>
                    <TabsTrigger value="confirmations">{labels.confirmations} ({projection.pendingConfirmation.length})</TabsTrigger>
                    <TabsTrigger value="activity">{labels.activity}</TabsTrigger>
                </TabsList>
                <Card className="mt-3">
                    <CardHeader className="gap-1">
                        <CardTitle>{labels[tab]}</CardTitle>
                        <p className="text-xs text-muted-foreground">{t('opsCenter.retention')}</p>
                    </CardHeader>
                    <CardContent>
                        <TabsContent value="tasks">
                            <h3 className="mb-2 text-sm font-semibold">{t('opsCenter.hostReceipts')}</h3>
                            <ReceiptRows rows={projection.tasks} now={now} />
                            {agentTaskSection(agentTasks.needsAttention)}
                        </TabsContent>
                        <TabsContent value="confirmations"><ReceiptRows rows={projection.pendingConfirmation} now={now} /></TabsContent>
                        <TabsContent value="activity">
                            <h3 className="mb-2 text-sm font-semibold">{t('opsCenter.hostReceipts')}</h3>
                            <ReceiptRows rows={projection.activity} now={now} />
                            {agentTaskSection(agentTasks.activity)}
                        </TabsContent>
                    </CardContent>
                </Card>
            </Tabs>}
        </div>
    </div>;
}
