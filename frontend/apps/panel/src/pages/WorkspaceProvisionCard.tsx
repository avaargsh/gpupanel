import { useState } from 'react';
import { TriangleAlert, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetProvisionPlanQuery, useRequestProvisionIntentMutation } from '@/api/projectApi';
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
