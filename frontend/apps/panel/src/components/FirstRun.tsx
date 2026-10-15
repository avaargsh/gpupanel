import { Banner, Button, Card, Space } from '@douyinfe/semi-ui';
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
    else if (typeof containers.currentData?.running === 'number' && Number.isFinite(containers.currentData.running)) status = t('workbench.dockerRunning', { count: containers.currentData.running });
    return <Card title={t('workbench.readiness')}>
        <p>{t('workbench.scope')}: {node === 'local' ? t('workbench.local') : node}</p>
        <Banner type="info" description={status} closeIcon={null} />
        {daemon.isError || containers.isError ? <Button onClick={() => { void daemon.refetch(); if (daemon.currentData?.isActive) void containers.refetch(); }}>{t('common.retry')}</Button> : null}
        <Space wrap style={{ marginTop: 12 }}>{workstationLinks.map((link) => <Link key={link.path} to={link.path}>{t(link.labelKey)}</Link>)}</Space>
        <p>{t('workbench.observedOnly')}</p>
    </Card>;
}
