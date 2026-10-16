import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useGetContainerStatusQuery, useGetDockerStatusQuery } from '@/api/containerApi';
import { useAppSelector } from '@/store/hooks';

export const workstationLinks = [
    { path: '/host?tab=overview', labelKey: 'nav.host' },
    { path: '/host?tab=monitor', labelKey: 'host.tabs.monitor' },
    { path: '/host?tab=terminal', labelKey: 'workbench.terminal' },
    { path: '/containers', labelKey: 'nav.container' },
    { path: '/apps', labelKey: 'workbench.apps' },
    { path: '/gpu', labelKey: 'workbench.gpu' },
    { path: '/ai?tab=accounts', labelKey: 'ai.tabs.accounts' },
];
// Observations do not prove installation acceptance.
export default function FirstRun() {
    const { t } = useTranslation();
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const daemon = useGetDockerStatusQuery();
    const containers = useGetContainerStatusQuery(undefined, { skip: !daemon.currentData?.isActive });
    let status = t('workbench.dockerChecking');
    if (daemon.isError || containers.isError) status = t('workbench.dockerUnavailable');
    else if (daemon.currentData && !daemon.currentData.isExist) status = t('workbench.dockerMissing');
    else if (daemon.currentData && !daemon.currentData.isActive) status = t('workbench.dockerInactive');
    else if (typeof containers.currentData?.running === 'number' && Number.isFinite(containers.currentData.running))
        status = t('workbench.dockerRunning', { count: containers.currentData.running });
    const observed = typeof containers.currentData?.running === 'number' && Number.isFinite(containers.currentData.running);
    const tone = daemon.isError || containers.isError || (daemon.currentData && !daemon.currentData.isActive)
        ? 'warning' : daemon.currentData?.isActive && observed ? 'ok' : 'unknown';
    return <section className="workbench-readiness" aria-labelledby="workbench-readiness-title">
        <div className="workbench-readiness-main">
            <div className="workbench-readiness-heading">
                <span className="workbench-status-dot" data-state={tone} aria-hidden="true" />
                <div><h2 id="workbench-readiness-title">{t('workbench.readiness')}</h2><p role="status">{status}</p></div>
            </div>
            <div className="workbench-readiness-actions">
                <Link to="/host?tab=overview">{t('nav.host')}</Link>
                <Link to="/containers">{t('nav.container')}</Link>
                {daemon.isError || containers.isError
                    ? <Button type="button" size="sm" variant="outline" onClick={() => { void daemon.refetch(); if (daemon.currentData?.isActive) void containers.refetch(); }}>{t('common.retry')}</Button>
                    : null}
            </div>
        </div>
        <p className="workbench-readiness-note">{t('workbench.scope')}: {node === 'local' ? t('workbench.local') : node} · {t('workbench.observedOnly')}</p>
    </section>;
}
