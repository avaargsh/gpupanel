import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
    ChartColumnIcon,
    CodeIcon,
    FolderIcon,
    LayoutGridIcon,
    RefreshCwIcon,
    ServerIcon,
    ComponentIcon,
    TriangleAlertIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetProjectsQuery } from '@/api/projectApi';
import { useGetBaseInfoQuery, useGetOsInfoQuery } from '@/api/dashboardApi';
import { useGetGpuInfoQuery } from '@/api/gpuApi';
import FirstRun from '@/components/FirstRun';
import StatCard from '@/components/StatCard';
import { observedPercent } from '@/utils/observations';

export default function HomePage() {
    const { t } = useTranslation();
    const os = useGetOsInfoQuery();
    const base = useGetBaseInfoQuery({ ioOption: 'all', netOption: 'all' });
    const gpu = useGetGpuInfoQuery();
    const projects = useGetProjectsQuery(undefined, { refetchOnMountOrArgChange: true });
    const currentProjects = !projects.isError && !projects.isFetching && projects.isSuccess ? projects.currentData : undefined;
    // Never present last successful values as current after a failed refresh.
    const osInfo = !os.isError ? os.currentData : undefined;
    const baseInfo = !base.isError ? base.currentData : undefined;
    const gpuInfo = !gpu.isError ? gpu.currentData : undefined;
    const hasGpuSnapshot = gpuInfo && (typeof gpuInfo.collectedAt === 'string' || [gpuInfo.gpu, gpuInfo.npu, gpuInfo.xpu].some(Array.isArray));
    const devices = hasGpuSnapshot ? [gpuInfo.gpu, gpuInfo.npu, gpuInfo.xpu].flatMap((items) => Array.isArray(items) ? items : []) : undefined;
    const failed = os.isError || base.isError || gpu.isError;
    const refreshing = os.isFetching || base.isFetching || gpu.isFetching;
    const refresh = () => { void os.refetch(); void base.refetch(); void gpu.refetch(); };

    return (
        <div className="workbench">
            {/* 顶部：标题、副标题、刷新。本机模式芯片已在顶栏。 */}
            <header className="workbench-heading">
                <div className="max-w-[64ch]">
                    <h1>{t('workbench.title')}</h1>
                    <p>{t('workbench.subtitle')}</p>
                </div>
                <Button type="button" aria-label={t('workbench.retry')} variant="outline" disabled={refreshing} onClick={refresh}>
                    {refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                    {t('workbench.retry')}
                </Button>
            </header>

            {/* 快速入口：始终可用的本地优先入口。 */}
            <section className="workbench-start" aria-labelledby="workbench-start-title">
                <div className="workbench-start-heading">
                    <div className="workbench-start-icon"><CodeIcon className="size-5" /></div>
                    <div>
                        <h2 id="workbench-start-title">{t('workbench.intro')}</h2>
                        <p>{t('workbench.start')}</p>
                    </div>
                </div>
                <div className="workbench-actions">
                    <Link to="/host?tab=terminal" className="workbench-action">
                        <CodeIcon className="size-4 shrink-0" />
                        <span>
                            <strong>{t('workbench.terminal')}</strong>
                            <small>{t('workbench.terminalHint')}</small>
                        </span>
                    </Link>
                    <Link to="/apps" className="workbench-action">
                        <LayoutGridIcon className="size-4 shrink-0" />
                        <span>
                            <strong>{t('workbench.templates')}</strong>
                            <small>{t('workbench.templatesHint')}</small>
                        </span>
                    </Link>
                    <Link to="/gpu" className="workbench-action workbench-action-wide">
                        <ComponentIcon className="size-4 shrink-0" />
                        <span>
                            <strong>{t('workbench.gpu')}</strong>
                            <small>{t('workbench.gpuHint')}</small>
                        </span>
                    </Link>
                    <div className="workbench-planned">
                        <Button asChild variant="outline">
                            <Link to="/projects"><FolderIcon data-icon="inline-start" />{t('workbench.newProject')}</Link>
                        </Button>
                        <p>{t('workbench.projectHint')}</p>
                    </div>
                </div>
            </section>

            {/* 资源摘要：实际观测，不代表环境已可运行。 */}
            <section className="workbench-resources" aria-labelledby="resource-heading">
                <div className="workbench-section-heading">
                    <div>
                        <h2 id="resource-heading">{t('workbench.resources')}</h2>
                        <p>{t('workbench.resourcesHint')}</p>
                    </div>
                    <Link to="/gpu">{t('workbench.inspect')}</Link>
                </div>
                {failed && (
                    <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        <TriangleAlertIcon />
                        <AlertDescription className="text-inherit">{t('home.noData')}</AlertDescription>
                    </Alert>
                )}
                <div className="workbench-stats">
                    <StatCard compact title={t('workbench.gpu')} value={devices ? String(devices.length) : '--'} icon={<ComponentIcon className="size-4" />} />
                    <StatCard compact title={t('home.cpu')} value={observedPercent(baseInfo?.cpuUsedPercent)} icon={<ChartColumnIcon className="size-4" />} />
                    <StatCard compact title={t('home.memory')} value={observedPercent(baseInfo?.memoryUsedPercent)} icon={<ComponentIcon className="size-4" />} />
                    <StatCard compact title={t('home.disk')} value={observedPercent(baseInfo?.diskUsedPercent)} icon={<ServerIcon className="size-4" />} />
                </div>
                <dl className="workbench-host-facts">
                    <div>
                        <dt>{t('home.hostname')}</dt>
                        <dd>{baseInfo?.hostname || '--'}</dd>
                    </div>
                    <div>
                        <dt>{t('home.system')}</dt>
                        <dd>{osInfo?.prettyDistro || osInfo?.os || '--'}</dd>
                    </div>
                    <div>
                        <dt>{t('home.arch')}</dt>
                        <dd>{osInfo?.arch || '--'}</dd>
                    </div>
                    <div>
                        <dt>{t('home.uptime')}</dt>
                        <dd>{baseInfo?.timeSinceUptime || '--'}</dd>
                    </div>
                </dl>
            </section>

            <div className="workbench-columns">
                <section className="workbench-panel" aria-labelledby="recent-projects-title">
                    <div className="workbench-panel-heading"><h2 id="recent-projects-title">{t('workbench.recent')}</h2></div>
                    {projects.isError ? <div className="workbench-empty">
                        <TriangleAlertIcon className="size-5" />
                        <h3>{t('projectRegistry.loadError')}</h3>
                        <Link to="/projects">{t('workbench.projects')}</Link>
                    </div> : currentProjects === undefined ? <p className="workbench-muted" role="status">{t('common.loading')}</p>
                        : currentProjects.length === 0 ? <div className="workbench-empty">
                            <FolderIcon className="size-5" />
                            <h3>{t('workbench.noProjects')}</h3>
                            <p>{t('workbench.noProjectsHint')}</p>
                            <Link to="/projects">{t('workbench.newProject')}</Link>
                        </div> : <div className="workbench-tool-links">
                            {currentProjects.slice(0, 3).map((project) => <Link to="/projects" key={project.id}>
                                <FolderIcon className="size-4 shrink-0" />
                                <span>{project.name} · {t('projectRegistry.notProvisioned')}</span>
                            </Link>)}
                        </div>}
                </section>
                <section className="workbench-panel" aria-labelledby="workbench-tools-title">
                    <div className="workbench-panel-heading"><h2 id="workbench-tools-title">{t('workbench.tools')}</h2></div>
                    <p className="workbench-muted">{t('workbench.toolsHint')}</p>
                    <div className="workbench-tool-links">
                        <Link to="/apps?tab=installed"><LayoutGridIcon className="size-4 shrink-0" />{t('workbench.installed')}</Link>
                        <Link to="/logs?tab=task"><ChartColumnIcon className="size-4 shrink-0" />{t('workbench.tasks')}</Link>
                        <Link to="/host?tab=overview"><ServerIcon className="size-4 shrink-0" />{t('workbench.diagnostics')}</Link>
                    </div>
                </section>
            </div>

            <FirstRun />
        </div>
    );
}
