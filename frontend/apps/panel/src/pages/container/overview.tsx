import { Button, Card, Descriptions, Empty, Progress, Skeleton, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconActivity, IconBolt, IconBox, IconImage, IconLayers, IconPlay, IconRefresh, IconServer } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useGetDockerStatusQuery, useGetContainerStatusQuery, useGetContainerItemStatsMutation, useDockerOperateMutation, type ContainerItemStats } from '@/api/containerApi';
import { useGetGpuInfoQuery, allAccelerators, type GpuDevice } from '@/api/gpuApi';
import { formatBytes, formatPercent, metricPercent } from '@/utils/format';
import StatCard from '@/components/StatCard';

const { Text } = Typography;

/**
 * 容器概览：Docker 状态 + 容器/镜像/网络/卷统计 + 磁盘占用 + GPU（主机级）。
 */
export default function ContainerOverview() {
    const { t } = useTranslation();
    const dockerStatus = useGetDockerStatusQuery();
    const statusQuery = useGetContainerStatusQuery();
    const gpuQuery = useGetGpuInfoQuery();
    const [loadItemStats] = useGetContainerItemStatsMutation();
    const [dockerOperate, { isLoading: dockerOperating }] = useDockerOperateMutation();
    const [itemStats, setItemStats] = useState<ContainerItemStats | null>(null);

    const handleStartDocker = async () => {
        try {
            await dockerOperate({ operation: 'start' }).unwrap();
            Toast.success(t('container.overview.dockerStarted'));
            dockerStatus.refetch();
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    const handleLoadItemStats = async () => {
        try {
            const res = await loadItemStats({ name: 'system' }).unwrap();
            setItemStats(res);
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    if (dockerStatus.isError) {
        return (
            <Card title={t('container.overview.title')}>
                <Empty title={t('container.overview.noData')} description={t('container.overview.backendOffline')} style={{ padding: '32px 0' }} />
            </Card>
        );
    }

    if (dockerStatus.isLoading || statusQuery.isLoading) {
        return (
            <Card title={t('container.overview.title')}>
                <Skeleton placeholder={<Skeleton.Title style={{ width: '100%', height: 72 }} />} loading />
            </Card>
        );
    }

    const docker = dockerStatus.data;
    const status = statusQuery.data;
    const devices = allAccelerators(gpuQuery.data);
    const acceleratorType = gpuQuery.data?.type || '';
    const running = status?.running ?? 0;
    const total = status?.containerCount ?? 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Typography.Title heading={4} style={{ margin: 0 }}>
                {t('container.overview.title')}
            </Typography.Title>
            {docker && !docker.isExist && (
                <Card>
                    <Empty title={t('container.overview.dockerNotInstalled')} description={t('container.overview.dockerNotInstalledDesc')} style={{ padding: '24px 0' }} />
                </Card>
            )}
            {docker && docker.isExist && !docker.isActive && (
                <Card bodyStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <Text type="danger">{t('container.overview.dockerNotRunning')}</Text>
                    <Button type="primary" icon={<IconPlay />} loading={dockerOperating} onClick={handleStartDocker}>
                        {t('container.overview.startDocker')}
                    </Button>
                </Card>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <StatCard
                    title={t('container.overview.containers')}
                    value={total ? `${running} / ${total}` : '0'}
                    percent={total ? (running / total) * 100 : 0}
                    icon={<IconBox size="large" />}
                />
                <StatCard title={t('container.overview.images')} value={String(status?.imageCount ?? 0)} icon={<IconImage size="large" />} color="var(--semi-color-success)" />
                <StatCard title={t('container.overview.networks')} value={String(status?.networkCount ?? 0)} icon={<IconServer size="large" />} color="var(--semi-color-warning)" />
                <StatCard title={t('container.overview.volumes')} value={String(status?.volumeCount ?? 0)} icon={<IconLayers size="large" />} color="var(--semi-color-info)" />
            </div>

            <Card
                title={t('container.overview.diskUsage')}
                headerExtraContent={
                    <Button size="small" icon={<IconRefresh />} onClick={handleLoadItemStats}>
                        {t('container.overview.loadDetail')}
                    </Button>
                }
            >
                {(() => {
                    const usage = itemStats ?? status;
                    if (!usage) return <Empty description={t('container.overview.loadDetailHint')} style={{ padding: '12px 0' }} />;
                    const rows: Array<{ label: string; used: number; reclaimable: number }> = [
                        { label: t('container.overview.containerUsage'), used: usage.containerUsage ?? 0, reclaimable: usage.containerReclaimable ?? 0 },
                        { label: t('container.overview.imageUsage'), used: usage.imageUsage ?? 0, reclaimable: usage.imageReclaimable ?? 0 },
                        { label: t('container.overview.volumeUsage'), used: usage.volumeUsage ?? 0, reclaimable: usage.volumeReclaimable ?? 0 },
                        { label: t('container.overview.buildCacheUsage'), used: usage.buildCacheUsage ?? 0, reclaimable: usage.buildCacheReclaimable ?? 0 },
                    ];
                    const maxUsage = Math.max(1, ...rows.map((r) => r.used));
                    return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {rows.map((r) => (
                                <div key={r.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Text size="small">{r.label}</Text>
                                        <Text size="small" type="tertiary">
                                            {formatBytes(r.used)} · {t('container.overview.reclaimable')} {formatBytes(r.reclaimable)}
                                        </Text>
                                    </div>
                                    <Progress percent={(r.used / maxUsage) * 100} showInfo={false} aria-label={r.label} />
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </Card>

            <Card
                title={
                    <Space>
                        <IconBolt />
                        <span>{t('container.overview.gpu')}</span>
                        {acceleratorType && <Tag color="blue">{acceleratorType}</Tag>}
                    </Space>
                }
                headerExtraContent={<Button size="small" icon={<IconRefresh />} onClick={() => gpuQuery.refetch()}>{t('home.refresh')}</Button>}
            >
                {gpuQuery.isError ? (
                    <Empty title={t('container.overview.gpuUnavailable')} description={t('container.overview.gpuUnavailableDesc')} style={{ padding: '16px 0' }} />
                ) : devices.length === 0 ? (
                    <Empty title={t('container.overview.noGpu')} description={t('container.overview.noGpuDesc')} style={{ padding: '16px 0' }} />
                ) : (
                    <>
                        <Descriptions
                            row
                            size="small"
                            style={{ marginBottom: 12, maxWidth: 900 }}
                            data={[
                                { key: t('container.overview.gpuType'), value: acceleratorType || '—' },
                                { key: t('container.overview.gpuDriver'), value: gpuQuery.data?.driverVersion || gpuQuery.data?.xpuDriverVersion || '—' },
                                { key: t('container.overview.gpuCuda'), value: gpuQuery.data?.cudaVersion || '—' },
                                { key: t('container.overview.gpuCount'), value: String(devices.length) },
                            ]}
                        />
                        <Table
                            rowKey={(row) => (row ? `${row.type}-${row.index}-${row.uuid}` : 'gpu')}
                            size="small"
                            pagination={false}
                            dataSource={devices}
                            columns={[
                                { title: '#', dataIndex: 'index', width: 50 },
                                { title: t('container.overview.gpuProduct'), dataIndex: 'productName', render: (v: string, row: GpuDevice) => v || row.type || '—' },
                                {
                                    title: t('container.overview.gpuUtil'),
                                    dataIndex: 'gpuUtil',
                                    render: (v: string) => v || '—',
                                },
                                {
                                    title: t('container.overview.gpuMemory'),
                                    dataIndex: 'memUsed',
                                    render: (_: string, row: GpuDevice) => {
                                        const pct = metricPercent(row.memUsed, row.memTotal);
                                        return (
                                            <div style={{ minWidth: 140 }}>
                                                <Text size="small">
                                                    {row.memUsed || '—'} / {row.memTotal || '—'} {pct !== undefined && `(${formatPercent(pct, 0)})`}
                                                </Text>
                                                {pct !== undefined && <Progress percent={pct} showInfo={false} aria-label="memory" />}
                                            </div>
                                        );
                                    },
                                },
                                { title: t('container.overview.gpuTemp'), dataIndex: 'temperature', render: (v: string) => v || '—' },
                                { title: t('container.overview.gpuPower'), dataIndex: 'powerDraw', render: (v: string, row: GpuDevice) => `${v || '—'} / ${row.powerLimit || '—'}` },
                                {
                                    title: t('container.overview.gpuProcesses'),
                                    dataIndex: 'processes',
                                    render: (v: GpuDevice['processes']) => (v && v.length ? `${v.length}` : '0'),
                                },
                            ]}
                        />
                        <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 10 }}>
                            <IconActivity size="small" /> {t('container.overview.gpuBindingNote')}
                        </Text>
                    </>
                )}
            </Card>
        </div>
    );
}
