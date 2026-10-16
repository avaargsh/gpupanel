import {
    useDockerOperateMutation,
    useGetContainerItemStatsMutation,
    useGetContainerStatusQuery,
    useGetDockerStatusQuery,
    type ContainerItemStats,
} from '@/api/containerApi';
import { allAccelerators, useGetGpuInfoQuery, type GpuDevice } from '@/api/gpuApi';
import StatCard from '@/components/StatCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatBytes, metricPercent } from '@/utils/format';
import {
    ActivityIcon,
    BoxIcon,
    ImageIcon,
    LayersIcon,
    PlayIcon,
    RefreshCwIcon,
    ServerIcon,
    ZapIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Descriptions } from './descriptions';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

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
            toast.success(t('container.overview.dockerStarted'));
            dockerStatus.refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const handleLoadItemStats = async () => {
        try {
            const res = await loadItemStats({ name: 'system' }).unwrap();
            setItemStats(res);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    if (dockerStatus.isError) {
        return (
            <Card className="container-overview-card">
                <CardHeader>
                    <CardTitle>{t('container.overview.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>{t('container.overview.noData')}</EmptyTitle>
                            <EmptyDescription>{t('container.overview.backendOffline')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        );
    }

    if (dockerStatus.isLoading || statusQuery.isLoading) {
        return (
            <Card className="container-overview-card">
                <CardHeader>
                    <CardTitle>{t('container.overview.title')}</CardTitle>
                </CardHeader>
                <CardContent className="container-overview-skeleton">
                    <Skeleton className="h-[72px] w-full" />
                </CardContent>
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
        <div className="container-overview">
            <h2 className="text-lg font-semibold">{t('container.overview.title')}</h2>
            {docker && !docker.isExist && (
                <Card className="container-overview-card">
                    <CardContent className="pt-4">
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('container.overview.dockerNotInstalled')}</EmptyTitle>
                                <EmptyDescription>{t('container.overview.dockerNotInstalledDesc')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </CardContent>
                </Card>
            )}
            {docker && docker.isExist && !docker.isActive && (
                <Card className="container-overview-card">
                    <CardContent className="flex items-center justify-between gap-4 pt-4">
                        <span className="text-sm text-destructive">{t('container.overview.dockerNotRunning')}</span>
                        <Button onClick={handleStartDocker} disabled={dockerOperating}>
                            <PlayIcon data-icon="inline-start" />
                            {t('container.overview.startDocker')}
                        </Button>
                    </CardContent>
                </Card>
            )}

            <div className="container-overview-stats">
                <StatCard
                    title={t('container.overview.containers')}
                    value={total ? `${running} / ${total}` : '0'}
                    percent={total ? (running / total) * 100 : 0}
                    icon={<BoxIcon className="size-5" />}
                />
                <StatCard
                    title={t('container.overview.images')}
                    value={String(status?.imageCount ?? 0)}
                    icon={<ImageIcon className="size-5" />}
                />
                <StatCard
                    title={t('container.overview.networks')}
                    value={String(status?.networkCount ?? 0)}
                    icon={<ServerIcon className="size-5" />}
                />
                <StatCard
                    title={t('container.overview.volumes')}
                    value={String(status?.volumeCount ?? 0)}
                    icon={<LayersIcon className="size-5" />}
                />
            </div>

            <Card className="container-overview-card">
                <CardHeader>
                    <CardTitle>{t('container.overview.diskUsage')}</CardTitle>
                    <CardAction>
                        <Button variant="outline" size="sm" onClick={handleLoadItemStats}>
                            <RefreshCwIcon data-icon="inline-start" />
                            {t('container.overview.loadDetail')}
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    {(() => {
                        const usage = itemStats ?? status;
                        if (!usage) {
                            return (
                                <Empty>
                                    <EmptyHeader>
                                        <EmptyDescription>{t('container.overview.loadDetailHint')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            );
                        }
                        const rows: Array<{ label: string; used: number; reclaimable: number }> = [
                            {
                                label: t('container.overview.containerUsage'),
                                used: usage.containerUsage ?? 0,
                                reclaimable: usage.containerReclaimable ?? 0,
                            },
                            {
                                label: t('container.overview.imageUsage'),
                                used: usage.imageUsage ?? 0,
                                reclaimable: usage.imageReclaimable ?? 0,
                            },
                            {
                                label: t('container.overview.volumeUsage'),
                                used: usage.volumeUsage ?? 0,
                                reclaimable: usage.volumeReclaimable ?? 0,
                            },
                            {
                                label: t('container.overview.buildCacheUsage'),
                                used: usage.buildCacheUsage ?? 0,
                                reclaimable: usage.buildCacheReclaimable ?? 0,
                            },
                        ];
                        const maxUsage = Math.max(1, ...rows.map((r) => r.used));
                        return (
                            <div className="flex flex-col gap-3.5">
                                {rows.map((r) => (
                                    <div key={r.label}>
                                        <div className="mb-1 flex justify-between gap-4">
                                            <span className="text-sm">{r.label}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {formatBytes(r.used)} · {t('container.overview.reclaimable')}{' '}
                                                {formatBytes(r.reclaimable)}
                                            </span>
                                        </div>
                                        <Progress value={(r.used / maxUsage) * 100} aria-label={r.label} />
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </CardContent>
            </Card>

            <Card className="container-overview-card">
                <CardHeader>
                    <CardTitle>
                        <span className="inline-flex items-center gap-2">
                            <ZapIcon />
                            <span>{t('container.overview.gpu')}</span>
                            {acceleratorType && <Badge variant="secondary">{acceleratorType}</Badge>}
                        </span>
                    </CardTitle>
                    <CardAction>
                        <Button variant="outline" size="sm" onClick={() => gpuQuery.refetch()}>
                            <RefreshCwIcon data-icon="inline-start" />
                            {t('home.refresh')}
                        </Button>
                    </CardAction>
                </CardHeader>
                <CardContent>
                    {gpuQuery.isError ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('container.overview.gpuUnavailable')}</EmptyTitle>
                                <EmptyDescription>{t('container.overview.gpuUnavailableDesc')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : devices.length === 0 ? (
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('container.overview.noGpu')}</EmptyTitle>
                                <EmptyDescription>{t('container.overview.noGpuDesc')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <Descriptions
                                column={4}
                                data={[
                                    { key: t('container.overview.gpuType'), value: acceleratorType || '—' },
                                    {
                                        key: t('container.overview.gpuDriver'),
                                        value: gpuQuery.data?.driverVersion || gpuQuery.data?.xpuDriverVersion || '—',
                                    },
                                    { key: t('container.overview.gpuCuda'), value: gpuQuery.data?.cudaVersion || '—' },
                                    { key: t('container.overview.gpuCount'), value: String(devices.length) },
                                ]}
                            />
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[50px]">#</TableHead>
                                        <TableHead>{t('container.overview.gpuProduct')}</TableHead>
                                        <TableHead>{t('container.overview.gpuUtil')}</TableHead>
                                        <TableHead className="min-w-[180px]">{t('container.overview.gpuMemory')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {devices.map((row: GpuDevice) => {
                                        const pct = metricPercent(row.memUsed, row.memTotal);
                                        return (
                                            <TableRow key={`${row.type}-${row.index}-${row.uuid}`}>
                                                <TableCell>{row.index}</TableCell>
                                                <TableCell>{row.productName || row.type || '—'}</TableCell>
                                                <TableCell>{row.gpuUtil || '—'}</TableCell>
                                                <TableCell>
                                                    <div className="flex min-w-[140px] flex-col gap-1.5">
                                                        <span className="text-sm">
                                                            {row.memUsed || '—'} / {row.memTotal || '—'}
                                                        </span>
                                                        <Progress value={pct} aria-label={t('container.overview.gpuMemory')} />
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            <span className="block text-xs text-muted-foreground">
                                <ActivityIcon className="mr-1 inline size-3.5 align-text-bottom" />
                                {t('container.overview.gpuBindingNote')}
                            </span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
