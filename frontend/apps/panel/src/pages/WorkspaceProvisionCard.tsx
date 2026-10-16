import { useState } from 'react';
import { TriangleAlert, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    useGetProvisionPlanQuery, useRequestProvisionIntentMutation,
    useGetLocalEvidenceQuery, useReportLocalEvidenceMutation,
    type LocalEvidenceInput,
} from '@/api/projectApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
    projectId: string;
    workspaceId: string;
    state: string;
}

// An intent is NOT a provisioned Workspace. No Host runner is wired.
export default function WorkspaceProvisionCard({ projectId, workspaceId, state }: Props) {
    const { t } = useTranslation();
    const [unknown, setUnknown] = useState(false);
    const [request, pending] = useRequestProvisionIntentMutation();
    const key = { projectId, workspaceId };
    const supported = state === 'NotProvisioned';
    const result = useGetProvisionPlanQuery(key, { skip: !supported, refetchOnMountOrArgChange: true });
    const plan = supported && result.isSuccess && !result.isError && !result.isFetching
        ? result.currentData : undefined;
    const record = async () => {
        if (!plan || plan.intent || pending.isLoading) return;
        setUnknown(false);
        try {
            await request({ ...key, planDigest: plan.planDigest }).unwrap();
        } catch {
            // HTTP result may be lost after SQLite commits. Read back; do not
            // automatically submit another request or claim environment ready.
            setUnknown(true);
            void result.refetch();
        }
    };

    return <Card>
        <CardHeader><CardTitle>{t('projectRegistry.preparation')}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
            <Alert><AlertDescription>{t('projectRegistry.preparationWarning')}</AlertDescription></Alert>
            {!supported || result.isError ? <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>{t('projectRegistry.planUnavailable')}</AlertDescription>
            </Alert> : !plan ? <p role="status">{t('common.loading')}</p> : <>
                <p>{t('projectRegistry.profile')}: {plan.profile}</p>
                <p>{t('projectRegistry.runner')}: {t('projectRegistry.runnerNotBound')}</p>
                <p className="break-all text-xs text-muted-foreground">{t('projectRegistry.planDigest')}: {plan.planDigest}</p>
                {plan.intent ? <p role="status">{t('projectRegistry.intentRecorded')}: {plan.intent.state}</p>
                    : <Button disabled={pending.isLoading} type="button" onClick={() => { void record(); }}>
                        {t('projectRegistry.requestPreparation')}
                    </Button>}
                {plan.intent && <LocalEvidencePanel projectId={projectId} workspaceId={workspaceId}
                    intentId={plan.intent.id} planDigest={plan.planDigest} />}
                {unknown && <Alert variant="destructive">
                    <TriangleAlert aria-hidden="true" />
                    <AlertDescription>{t('projectRegistry.requestUnknown')}</AlertDescription>
                </Alert>}
                <Button type="button" variant="outline" disabled={result.isFetching}
                    onClick={() => { setUnknown(false); void result.refetch(); }}>
                    <RefreshCw data-icon="inline-start" />{t('common.refresh')}
                </Button>
            </>}
        </CardContent>
    </Card>;
}

interface EvidenceProps {
    projectId: string;
    workspaceId: string;
    intentId: string;
    planDigest: string;
}

function LocalEvidencePanel({ projectId, workspaceId, intentId, planDigest }: EvidenceProps) {
    const { t } = useTranslation();
    const [content, setContent] = useState('');
    const [unknown, setUnknown] = useState(false);
    const key = { projectId, workspaceId };
    const query = useGetLocalEvidenceQuery(key, { refetchOnMountOrArgChange: true });
    const [report, mutation] = useReportLocalEvidenceMutation();
    const latest = query.isSuccess && !query.isError && !query.isFetching ? query.currentData : undefined;
    const submit = async () => {
        if (mutation.isLoading || !latest || latest.evidence || content.length > 2048) return;
        let payload: LocalEvidenceInput;
        try {
            const raw: unknown = JSON.parse(content);
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
            const data = raw as Record<string, unknown>;
            if (Object.keys(data).sort().join(',') !== 'evidenceDigest,intentId,planDigest,receiptDigest' ||
                data.intentId !== intentId || data.planDigest !== planDigest ||
                typeof data.receiptDigest !== 'string' || !/^[0-9a-f]{64}$/.test(data.receiptDigest) ||
                typeof data.evidenceDigest !== 'string' || !/^[0-9a-f]{64}$/.test(data.evidenceDigest)) return;
            payload = data as unknown as LocalEvidenceInput;
        } catch {
            return;
        }
        setUnknown(false);
        try {
            await report({ ...key, ...payload }).unwrap();
            setContent('');
        } catch {
            // This could have persisted before losing the HTTP response.
            // Read back once; do not re-submit an untrusted observation.
            setUnknown(true);
            void query.refetch();
        }
    };
    return <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="font-medium">{t('projectRegistry.localEvidence')}</p>
        <p className="text-xs text-muted-foreground">{t('projectRegistry.untrustedEvidence')}</p>
        {query.isError ? <p role="alert">{t('projectRegistry.evidenceUnavailable')}</p>
            : !latest ? <p role="status">{t('common.loading')}</p>
                : latest.evidence ? <p role="status">
                    {t('projectRegistry.evidenceRecorded')} · {latest.trustState}
                    <span className="block break-all text-xs">{latest.evidence.evidenceDigest}</span>
                </p> : <>
                    <textarea className="min-h-20 w-full resize-y rounded-md border border-input bg-background p-2 text-xs"
                        aria-label={t('projectRegistry.pasteEvidence')} maxLength={2048}
                        placeholder={t('projectRegistry.pasteEvidence')}
                        value={content} onChange={event => setContent(event.target.value)} />
                    <Button type="button" variant="outline" disabled={mutation.isLoading || !content}
                        onClick={() => { void submit(); }}>{t('projectRegistry.reportEvidence')}</Button>
                </>}
        {unknown && <p role="alert" className="text-xs">{t('projectRegistry.evidenceUnknown')}</p>}
        <Button type="button" variant="outline" disabled={query.isFetching}
            onClick={() => { setUnknown(false); void query.refetch(); }}>
            <RefreshCw data-icon="inline-start" />{t('common.refresh')}
        </Button>
    </div>;
}
