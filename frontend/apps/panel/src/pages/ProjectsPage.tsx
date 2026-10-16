import { useState, type FormEvent } from 'react';
import { FolderOpen, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetProjectsQuery, useRegisterProjectMutation } from '@/api/projectApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { normalizeProjectName, projectWorkspaceReady, type ProjectSource } from '@/utils/project-registry';

export default function ProjectsPage() {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [sourceHint, setSourceHint] = useState<ProjectSource>('manual');
    const [register, registration] = useRegisterProjectMutation();
    const projects = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true });
    const [outcome, setOutcome] = useState<'none' | 'saved' | 'unknown'>('none');
    const safeName = normalizeProjectName(name);
    // Do not display cached data from a previous authentication scope while
    // revalidating; an API failure is not an empty project list.
    const current = !projects.isError && !projects.isFetching && projects.isSuccess
        ? projects.currentData
        : undefined;

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!safeName || registration.isLoading) return;
        setOutcome('none');
        try {
            await register({ name: safeName, sourceHint }).unwrap();
            setName('');
            setOutcome('saved');
        } catch {
            // The DB may have committed before the response was lost.
            // Never automatically retry a possibly committed POST.
            setOutcome('unknown');
            void projects.refetch();
        }
    };

    return <div className="workbench" aria-label={t('workbench.projects')}>
        <header className="workbench-heading">
            <div>
                <h1>{t('workbench.projects')}</h1>
                <p>{t('projectRegistry.description')}</p>
            </div>
            <Button variant="outline" type="button" onClick={() => { void projects.refetch(); }}
                disabled={projects.isFetching} aria-label={t('common.refresh')}>
                {projects.isFetching ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                {t('common.refresh')}
            </Button>
        </header>

        <Alert>
            <FolderOpen aria-hidden="true" />
            <AlertDescription>{t('projectRegistry.metadataOnly')}</AlertDescription>
        </Alert>

        <Card>
            <CardHeader><CardTitle>{t('projectRegistry.register')}</CardTitle></CardHeader>
            <CardContent>
                <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(event) => { void submit(event); }}>
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                        <span>{t('projectRegistry.name')}</span>
                        <Input name="name" value={name} maxLength={120} autoComplete="off"
                            onChange={(event) => { setName(event.target.value); setOutcome('none'); }}
                            placeholder={t('projectRegistry.namePlaceholder')} required />
                    </label>
                    <label className="flex min-w-36 flex-col gap-1 text-sm">
                        <span>{t('projectRegistry.source')}</span>
                        <select className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
                            value={sourceHint} onChange={(event) => setSourceHint(event.target.value as ProjectSource)}>
                            <option value="manual">{t('projectRegistry.manual')}</option>
                            <option value="uv">uv</option>
                            <option value="catalog">Catalog</option>
                        </select>
                    </label>
                    <Button type="submit" disabled={!safeName || registration.isLoading}>
                        {registration.isLoading ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                        {t('projectRegistry.register')}
                    </Button>
                </form>
                {name && !safeName && <p role="alert" className="mt-2 text-xs text-destructive">
                    {t('projectRegistry.invalidName')}
                </p>}
                {outcome === 'saved' && <p role="status" className="mt-2 text-xs text-muted-foreground">
                    {t('projectRegistry.saved')}
                </p>}
                {outcome === 'unknown' && <Alert variant="destructive" className="mt-3">
                    <TriangleAlert aria-hidden="true" />
                    <AlertDescription>{t('projectRegistry.unknown')}</AlertDescription>
                </Alert>}
            </CardContent>
        </Card>

        <Card>
            <CardHeader><CardTitle>{t('projectRegistry.registered')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                {projects.isError ? <Alert variant="destructive">
                    <TriangleAlert aria-hidden="true" />
                    <AlertDescription>{t('projectRegistry.loadError')}</AlertDescription>
                </Alert> : current === undefined ? <p role="status" className="text-sm text-muted-foreground">
                    {t('common.loading')}
                </p> : current.length === 0 ? <p className="text-sm text-muted-foreground">
                    {t('projectRegistry.empty')}
                </p> : current.map((project) => <div key={project.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
                    <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{project.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('projectRegistry.source')}: {project.sourceHint} · {t('projectRegistry.registeredState')}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {t('projectRegistry.workspace')}: {project.workspaces.map((entry) =>
                                `${entry.name} · ${projectWorkspaceReady(entry.state)
                                    ? t('projectRegistry.ready')
                                    : t('projectRegistry.notProvisioned')}`).join(', ') || t('projectRegistry.notProvisioned')}
                        </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{t('projectRegistry.metadata')}</span>
                </div>)}
            </CardContent>
        </Card>
    </div>;
}
