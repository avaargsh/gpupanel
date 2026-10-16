import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ChartColumnIcon, CodeIcon, FolderIcon, LayoutGridIcon, RefreshCwIcon, ServerIcon, ComponentIcon, TriangleAlertIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetBaseInfoQuery, useGetOsInfoQuery } from '@/api/dashboardApi';
import { useGetGpuInfoQuery } from '@/api/gpuApi';
import FirstRun from '@/components/FirstRun';
import StatCard from '@/components/StatCard';
import { observedPercent } from '@/utils/observations';
import './workbench.css';

export default function HomePage() {
    const { t } = useTranslation();
    const os = useGetOsInfoQuery();
    const base = useGetBaseInfoQuery({ ioOption: 'all', netOption: 'all' });
    const gpu = useGetGpuInfoQuery();
    // Never present last successful values as current after a failed refresh.
    const osInfo = !os.isError ? os.currentData : undefined;
    const baseInfo = !base.isError ? base.currentData : undefined;
    const gpuInfo = !gpu.isError ? gpu.currentData : undefined;
    const hasGpuSnapshot = gpuInfo && (typeof gpuInfo.collectedAt === 'string' || [gpuInfo.gpu, gpuInfo.npu, gpuInfo.xpu].some(Array.isArray));
    const devices = hasGpuSnapshot ? [gpuInfo.gpu, gpuInfo.npu, gpuInfo.xpu].flatMap((items) => Array.isArray(items) ? items : []) : undefined;
    const failed = os.isError || base.isError || gpu.isError;
    const refreshing = os.isFetching || base.isFetching || gpu.isFetching;
    const refresh = () => { void os.refetch(); void base.refetch(); void gpu.refetch(); };
    return <div className="workbench">
        <header className="workbench-heading">
            <div><h1>{t('workbench.title')}</h1><p>{t('workbench.subtitle')}</p></div>
            <Button type="button" aria-label={t('workbench.retry')} variant="outline" disabled={refreshing} onClick={refresh}>
                {refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
                {t('workbench.retry')}
            </Button>
        </header>
        <section className="workbench-start" aria-labelledby="workbench-start-title">
            <div className="workbench-start-heading"><span className="workbench-start-icon"><CodeIcon className="size-5" /></span><div><h2 id="workbench-start-title">{t('workbench.intro')}</h2><p>{t('workbench.start')}</p></div></div>
            <div className="workbench-actions">
                <Link to="/host?tab=terminal" className="workbench-action"><CodeIcon className="size-4 shrink-0" /><span><strong>{t('workbench.terminal')}</strong><small>{t('workbench.terminalHint')}</small></span></Link>
                <Link to="/apps" className="workbench-action"><LayoutGridIcon className="size-4 shrink-0" /><span><strong>{t('workbench.templates')}</strong><small>{t('workbench.templatesHint')}</small></span></Link>
                <div className="workbench-planned"><Button type="button" aria-label={t('workbench.newProject')} disabled variant="outline"><FolderIcon data-icon="inline-start" />{t('workbench.newProject')}</Button><p>{t('workbench.projectHint')}</p></div>
            </div>
        </section>
        <section className="workbench-resources" aria-labelledby="resource-heading">
            <div className="workbench-section-heading"><div><h2 id="resource-heading">{t('workbench.resources')}</h2><p>{t('workbench.resourcesHint')}</p></div><Link to="/gpu">{t('workbench.inspect')}</Link></div>
            {failed && <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <TriangleAlertIcon />
                <AlertDescription className="text-inherit">{t('home.noData')}</AlertDescription>
            </Alert>}
            <div className="workbench-stats">
                <StatCard compact title={t('workbench.gpu')} value={devices ? String(devices.length) : '--'} icon={<ComponentIcon className="size-4" />} />
                <StatCard compact title={t('home.cpu')} value={observedPercent(baseInfo?.cpuUsedPercent)} icon={<ChartColumnIcon className="size-4" />} />
                <StatCard compact title={t('home.memory')} value={observedPercent(baseInfo?.memoryUsedPercent)} icon={<ComponentIcon className="size-4" />} />
                <StatCard compact title={t('home.disk')} value={observedPercent(baseInfo?.diskUsedPercent)} icon={<ServerIcon className="size-4" />} />
            </div>
            <dl className="workbench-host-facts">
                <div><dt>{t('home.hostname')}</dt><dd>{baseInfo?.hostname || '--'}</dd></div>
                <div><dt>{t('home.system')}</dt><dd>{osInfo?.prettyDistro || osInfo?.os || '--'}</dd></div>
                <div><dt>{t('home.arch')}</dt><dd>{osInfo?.arch || '--'}</dd></div>
                <div><dt>{t('home.uptime')}</dt><dd>{baseInfo?.timeSinceUptime || '--'}</dd></div>
            </dl>
        </section>
        <div className="workbench-columns">
            <section className="workbench-panel" aria-labelledby="recent-projects-title">
                <div className="workbench-panel-heading"><h2 id="recent-projects-title">{t('workbench.recent')}</h2></div>
                <div className="workbench-empty"><FolderIcon className="size-5" /><h3>{t('workbench.noProjects')}</h3><p>{t('workbench.noProjectsHint')}</p><Link to="/apps?tab=installed">{t('workbench.installed')}</Link></div>
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
    </div>;
}
