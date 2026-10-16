import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FolderOpen, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetProjectQuery } from '@/api/projectApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { projectWorkspaceReady, validProjectId } from '@/utils/project-registry';

export default function ProjectDetailPage() {
    const { id } = useParams();
    const { t } = useTranslation();
    const validId = id && validProjectId(id) ? id : null;
    const detail = useGetProjectQuery(validId ?? '', {
        skip: !validId,
        refetchOnMountOrArgChange: true,
    });
    // Never show an older authenticated scope's cache while refreshing,
    // after a failed request, or for a malformed deep link.
    const project = validId && detail.isSuccess && !detail.isFetching && !detail.isError
        ? detail.currentData
        : undefined;

    return <div className="workbench" aria-label={t('projectRegistry.detail')}>
        <header className="workbench-heading">
            <div>
                <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="size-4" aria-hidden="true" />{t('projectRegistry.back')}
                </Link>
                <h1 className="mt-2">{t('projectRegistry.detail')}</h1>
                <p>{t('projectRegistry.metadataOnly')}</p>
            </div>
            <Button type="button" variant="outline" disabled={!validId || detail.isFetching}
                onClick={() => { if (validId) void detail.refetch(); }}>
                {detail.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                {t('common.refresh')}
            </Button>
        </header>

        {!validId || detail.isError ? <Alert variant="destructive">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>{t('projectRegistry.detailUnavailable')}</AlertDescription>
        </Alert> : !project ? <p role="status" className="text-sm text-muted-foreground">
            {t('common.loading')}
        </p> : <Card>
            <CardHeader><CardTitle>{project.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
                <p>{t('projectRegistry.source')}: {project.sourceHint}</p>
                <p>{t('projectRegistry.registeredState')} · {t('projectRegistry.metadata')}</p>
                <p className="break-all text-xs text-muted-foreground">ID: {project.id}</p>
                <div className="space-y-2 border-t border-border pt-3">
                    <p className="flex items-center gap-2 font-medium">
                        <FolderOpen className="size-4" aria-hidden="true" />
                        {t('projectRegistry.workspace')}
                    </p>
                    {project.workspaces.map(ws => <div key={ws.id} className="rounded-md border p-3">
                        <p>{ws.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {projectWorkspaceReady(ws.state) ? t('projectRegistry.ready') : t('projectRegistry.notProvisioned')}
                        </p>
                    </div>)}
                </div>
                <Alert><AlertDescription>{t('projectRegistry.metadataOnly')}</AlertDescription></Alert>
            </CardContent>
        </Card>}
    </div>;
}
