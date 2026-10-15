import { Banner, Button } from '@douyinfe/semi-ui';
import { IconApps, IconCode, IconComponent, IconFolder, IconHistogram, IconRefresh, IconServer } from '@douyinfe/semi-icons';
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
    const refresh = () => { void os.refetch(); void base.refetch(); void gpu.refetch(); };
    return <div className="workbench">
        <header className="workbench-heading">
            <div><h1>{t('workbench.title')}</h1><p>{t('workbench.subtitle')}</p></div>
            <Button aria-label={t('workbench.retry')} icon={<IconRefresh />} loading={os.isFetching || base.isFetching || gpu.isFetching} onClick={refresh}>{t('workbench.retry')}</Button>
        </header>
        <section className="workbench-start" aria-labelledby="workbench-start-title">
            <div className="workbench-start-heading"><span className="workbench-start-icon"><IconCode size="extra-large" /></span><div><h2 id="workbench-start-title">{t('workbench.intro')}</h2><p>{t('workbench.start')}</p></div></div>
            <div className="workbench-actions">
                <Link to="/host?tab=terminal" className="workbench-action"><IconCode /><span><strong>{t('workbench.terminal')}</strong><small>{t('workbench.terminalHint')}</small></span></Link>
                <Link to="/apps" className="workbench-action"><IconApps /><span><strong>{t('workbench.templates')}</strong><small>{t('workbench.templatesHint')}</small></span></Link>
                <div className="workbench-planned"><Button aria-label={t('workbench.newProject')} disabled icon={<IconFolder />}>{t('workbench.newProject')}</Button><p>{t('workbench.projectHint')}</p></div>
            </div>
        </section>
        <div className="workbench-columns">
            <section className="workbench-panel" aria-labelledby="recent-projects-title">
                <div className="workbench-panel-heading"><h2 id="recent-projects-title">{t('workbench.recent')}</h2><span className="workbench-neutral-tag">{t('workbench.notConnected')}</span></div>
                <div className="workbench-empty"><IconFolder size="extra-large" /><h3>{t('workbench.noProjects')}</h3><p>{t('workbench.noProjectsHint')}</p><Link to="/apps?tab=installed">{t('workbench.installed')}</Link></div>
            </section>
            <section className="workbench-panel" aria-labelledby="workbench-tools-title">
                <div className="workbench-panel-heading"><h2 id="workbench-tools-title">{t('workbench.tools')}</h2></div>
                <p className="workbench-muted">{t('workbench.toolsHint')}</p>
                <div className="workbench-tool-links">
                    <Link to="/apps?tab=installed"><IconApps />{t('workbench.installed')}</Link>
                    <Link to="/logs?tab=task"><IconHistogram />{t('workbench.tasks')}</Link>
                    <Link to="/host?tab=overview"><IconServer />{t('workbench.diagnostics')}</Link>
                </div>
            </section>
        </div>
        <section className="workbench-resources" aria-labelledby="resource-heading">
            <div className="workbench-section-heading"><div><h2 id="resource-heading">{t('workbench.resources')}</h2><p>{t('workbench.resourcesHint')}</p></div><Link to="/gpu">{t('workbench.inspect')}</Link></div>
            {failed && <Banner type="warning" description={t('home.noData')} closeIcon={null} />}
            <div className="workbench-stats">
                <StatCard title={t('workbench.gpu')} value={devices ? String(devices.length) : '--'} icon={<IconComponent />} />
                <StatCard title={t('home.cpu')} value={observedPercent(baseInfo?.cpuUsedPercent)} icon={<IconHistogram />} />
                <StatCard title={t('home.memory')} value={observedPercent(baseInfo?.memoryUsedPercent)} icon={<IconComponent />} />
                <StatCard title={t('home.disk')} value={observedPercent(baseInfo?.diskUsedPercent)} icon={<IconServer />} />
            </div>
            <dl className="workbench-host-facts">
                <div><dt>{t('home.hostname')}</dt><dd>{baseInfo?.hostname || '--'}</dd></div>
                <div><dt>{t('home.system')}</dt><dd>{osInfo?.prettyDistro || osInfo?.os || '--'}</dd></div>
                <div><dt>{t('home.arch')}</dt><dd>{osInfo?.arch || '--'}</dd></div>
                <div><dt>{t('home.uptime')}</dt><dd>{baseInfo?.timeSinceUptime || '--'}</dd></div>
            </dl>
        </section>
        <FirstRun />
    </div>;
}
