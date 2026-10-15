import { Card, Descriptions, Empty, Skeleton } from '@douyinfe/semi-ui';
import {
    IconArchive,
    IconLayers,
    IconPulse,
    IconServer,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useGetBaseInfoQuery, useGetOsInfoQuery } from '@/api/dashboardApi';
import StatCard from '@/components/StatCard';

/**
 * 主机概览：主机信息 + 资源使用率。
 * 数据接口与总览页一致（dashboard/base/*），因为本机即当前节点。
 */
export default function HostOverview() {
    const { t } = useTranslation();
    const os = useGetOsInfoQuery();
    const base = useGetBaseInfoQuery({ ioOption: 'all', netOption: 'all' });

    const loading = os.isLoading || base.isLoading;
    const failed = os.isError || base.isError;

    if (failed) {
        return (
            <Card title={t('host.overview.title')}>
                <Empty
                    title={t('host.overview.noData')}
                    description={t('host.overview.noDataDesc')}
                    style={{ padding: '32px 0' }}
                />
            </Card>
        );
    }

    if (loading || !os.data || !base.data) {
        return (
            <Card title={t('host.overview.title')}>
                <Skeleton
                    placeholder={
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            <Skeleton.Title style={{ width: '100%', height: 72 }} />
                            <Skeleton.Title style={{ width: '100%', height: 72 }} />
                            <Skeleton.Title style={{ width: '100%', height: 72 }} />
                            <Skeleton.Title style={{ width: '100%', height: 72 }} />
                        </div>
                    }
                    loading
                />
                <Skeleton.Paragraph rows={3} style={{ marginTop: 20 }} />
            </Card>
        );
    }

    const b = base.data;
    const infoItems = [
        { key: t('home.hostname'), value: os.data.hostname },
        { key: t('home.system'), value: `${os.data.os} ${os.data.arch}` },
        { key: t('home.arch'), value: os.data.arch },
        { key: t('home.kernel'), value: os.data.kernelVersion },
        { key: t('home.uptime'), value: b.timeSinceUptime },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={t('host.overview.title')}>
                <Descriptions
                    data={infoItems}
                    row
                    size="small"
                    style={{ maxWidth: 900 }}
                />
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <StatCard
                    title={t('home.cpu')}
                    value={`${(b.cpuUsedPercent ?? 0).toFixed(1)} %`}
                    percent={b.cpuUsedPercent}
                    icon={<IconServer size="large" />}
                />
                <StatCard
                    title={t('home.memory')}
                    value={`${(b.memoryUsedPercent ?? 0).toFixed(1)} %`}
                    percent={b.memoryUsedPercent}
                    icon={<IconLayers size="large" />}
                    color="var(--semi-color-success)"
                />
                <StatCard
                    title={t('home.disk')}
                    value={`${(b.diskUsedPercent ?? 0).toFixed(1)} %`}
                    percent={b.diskUsedPercent}
                    icon={<IconArchive size="large" />}
                    color="var(--semi-color-warning)"
                />
                <StatCard
                    title={t('home.load')}
                    value={`${(b.load1 ?? 0).toFixed(2)}`}
                    icon={<IconPulse size="large" />}
                    color="var(--semi-color-info)"
                />
            </div>
        </div>
    );
}