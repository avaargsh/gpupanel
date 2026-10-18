import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/store/hooks';
import { useSearchParams } from 'react-router-dom';
import HostDiagnosisReport from './HostDiagnosisReport';
import {
    useGetHostOperationsQuery,
    usePlanHostOperationMutation,
    useConfirmHostOperationMutation,
    type HostOperation,
} from '@/api/hostOperationsApi';
export default function HostOperations() {
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const { t } = useTranslation();
    const [params] = useSearchParams();
    // A deep link may select an intention but must never plan or execute it.
    const requestedTarget = params.get('operationTarget') || params.get('restartTarget') || '';
    const target = /^[a-f0-9]{64}$/.test(requestedTarget) ? requestedTarget : '';
    const requestedKind = params.get('operationKind');
    const kind = target
        ? (requestedKind === 'container.start' || requestedKind === 'container.stop' || requestedKind === 'container.restart'
            ? requestedKind : 'container.restart')
        : 'host.diagnose';
    return node === 'local' ? (
        <LocalOperations key={`${node}:${kind}:${target}`} initialKind={kind} initialTarget={target} />
    ) : (
        <Empty className="host-operations-empty">
            <EmptyHeader>
                <EmptyDescription>{t('hostOps.localOnly')}</EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}
function LocalOperations({ initialKind, initialTarget }: { initialKind: string; initialTarget: string }) {
    const { t } = useTranslation();
    const [kind, setKind] = useState(initialKind);
    const [target, setTarget] = useState(initialTarget);
    const [preview, setPreview] = useState<HostOperation | null>(null);
    const [error, setError] = useState('');
    const [plan, planning] = usePlanHostOperationMutation();
    const [confirm, executing] = useConfirmHostOperationMutation();
    const receipts = useGetHostOperationsQuery(undefined, { pollingInterval: 5000, refetchOnMountOrArgChange: true });
    const epoch = useRef(0);
    const pending = useRef<{
        abort(): void;
    } | null>(null);
    const busy = planning.isLoading || executing.isLoading;
    useEffect(() => {
        epoch.current += 1;
        pending.current?.abort();
        setPreview(null);
        setError('');
        return () => {
            epoch.current += 1;
            pending.current?.abort();
        };
    }, [kind, target]);
    const createPlan = async () => {
        const version = epoch.current;
        setError('');
        setPreview(null);
        const request = plan({ kind, target: kind === 'host.diagnose' ? 'local' : target.trim(), key: crypto.randomUUID() });
        pending.current = request;
        try {
            const result = await request.unwrap();
            if (epoch.current === version) setPreview(result);
        } catch {
            if (epoch.current === version) setError(t('hostOps.planError'));
        }
    };
    const execute = async () => {
        if (!preview) return;
        const version = epoch.current;
        const request = confirm({ id: preview.id, hash: preview.hash });
        pending.current = request;
        try {
            const result = await request.unwrap();
            if (epoch.current === version) setPreview(result);
        } catch {
            if (epoch.current === version) setError(t('hostOps.uncertain'));
        } finally {
            void receipts.refetch();
        }
    };
    const expired = preview ? Date.now() >= Date.parse(preview.expiresAt) : true;
    return (
        <div className="host-operations w-full flex flex-col gap-4">
            <Card className="host-operations-card">
                <CardHeader>
                    <CardTitle>{t('hostOps.title')}</CardTitle>
                </CardHeader>
                <CardContent className="host-operations-form">
                    <p className="text-sm text-muted-foreground">{t('hostOps.description')}</p>
                    <div className="flex flex-row flex-wrap gap-3 items-center">
                        <NativeSelect
                            value={kind}
                            disabled={busy}
                            className="w-[220px]"
                            aria-label={t('hostOps.operation')}
                            onChange={(event) =>
                                setKind(
                                    String(
                                        [
                                            { value: 'host.diagnose', label: t('hostOps.diagnose') },
                                            { value: 'container.restart', label: t('hostOps.restart') },
                                            { value: 'container.start', label: t('hostOps.start') },
                                            { value: 'container.stop', label: t('hostOps.stop') },
                                        ].find((option) => String(option.value) === event.target.value)?.value ?? event.target.value,
                                    ),
                                )
                            }
                        >
                            <NativeSelectOption value="" disabled>
                                {'—'}
                            </NativeSelectOption>
                            {[
                                { value: 'host.diagnose', label: t('hostOps.diagnose') },
                                { value: 'container.restart', label: t('hostOps.restart') },
                                            { value: 'container.start', label: t('hostOps.start') },
                                            { value: 'container.stop', label: t('hostOps.stop') },
                            ].map((option) => (
                                <NativeSelectOption key={String(option.value)} value={option.value}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        {kind !== 'host.diagnose' && (
                            <Input
                                value={target}
                                disabled={busy}
                                placeholder={t('hostOps.containerId')}
                                className="w-[420px] max-w-full"
                                aria-label={t('hostOps.containerId')}
                                onChange={(event) => setTarget(event.target.value)}
                            />
                        )}
                        <Button
                            onClick={() => void createPlan()}
                            variant={'outline'}
                            type={'button'}
                            disabled={busy || (kind !== 'host.diagnose' && !/^[a-f0-9]{64}$/.test(target.trim())) || planning.isLoading}
                        >
                            {planning.isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t('hostOps.preview')}
                        </Button>
                    </div>
                    {error && (
                        <Alert variant="destructive" className="host-operations-error mt-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    {preview && (
                        <div className="host-operations-preview mt-4">
                            <strong className="text-sm">
                                {preview.kind}· {t('hostOps.target')}: local · {preview.target}
                            </strong>
                            <p>{preview.impact}</p>
                            <p>
                                {t('hostOps.expires')}: {preview.expiresAt} · ID: {preview.id}
                            </p>
                            <Badge variant={'secondary'}>{preview.state}</Badge>
                            {preview.state === 'planned' && (
                                <Button
                                    onClick={() => void execute()}
                                    className="ml-3"
                                    variant={preview.kind === 'host.diagnose' ? 'default' : 'destructive'}
                                    type={'button'}
                                    disabled={busy || expired || !!error || executing.isLoading}
                                >
                                    {executing.isLoading ? <Spinner data-icon="inline-start" /> : null}
                                    {t('hostOps.confirm')}
                                </Button>
                            )}
                            {preview.output && (preview.kind === 'host.diagnose'
                                ? <HostDiagnosisReport output={preview.output} />
                                : <pre className="log-output">{preview.output}</pre>)}
                            {preview.error && <p role="alert">{preview.error}</p>}
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card className="host-operations-card">
                <CardHeader className="host-operations-receipts-header">
                    <CardTitle>{t('hostOps.receipts')}</CardTitle>
                    <CardAction>
                        {
                            <Button
                                onClick={() => void receipts.refetch()}
                                variant={'outline'}
                                type={'button'}
                                disabled={false || receipts.isFetching}
                            >
                                {receipts.isFetching ? <Spinner data-icon="inline-start" /> : null}
                                {t('common.refresh')}
                            </Button>
                        }
                    </CardAction>
                </CardHeader>
                <CardContent className="host-operations-receipts">
                    <p className="text-sm text-muted-foreground">{t('hostOps.retention')}</p>
                    {receipts.isLoading ? (
                        <p role="status" className="text-muted-foreground">{t('hostOps.loading')}</p>
                    ) : receipts.isError ? (
                        <Alert variant="destructive">
                            <AlertDescription>{t('hostOps.loadError')}</AlertDescription>
                        </Alert>
                    ) : !receipts.currentData?.length ? (
                        <Empty className="host-operations-empty">
                            <EmptyHeader>
                                <EmptyDescription>{t('hostOps.empty')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        receipts.currentData.map((row) => (
                            <details key={row.id} className="host-operations-receipt">
                                <summary>
                                    {row.kind} · {row.state} · {row.createdAt} · {row.target}
                                </summary>
                                <p>
                                    ID: {row.id} · {row.impact}
                                </p>
                                {row.error && <p role="alert">{row.error}</p>}
                                {row.state === 'unknown' && <p>{t('hostOps.uncertain')}</p>}
                                {row.output && row.kind === 'host.diagnose'
                                    ? <HostDiagnosisReport output={row.output} />
                                    : <pre className="log-output">{row.output || t('hostOps.noOutput')}</pre>}
                                {row.state === 'planned' && (
                                    <Button
                                        onClick={() => {
                                            epoch.current += 1;
                                            setPreview(row);
                                            setError('');
                                        }}
                                        variant={'outline'}
                                        type={'button'}
                                        disabled={busy}
                                    >
                                        {t('hostOps.review')}
                                    </Button>
                                )}
                            </details>
                        ))
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
