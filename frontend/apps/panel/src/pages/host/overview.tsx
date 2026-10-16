import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Server, Layers, Archive, Activity } from 'lucide-react';
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
            <Card>
                <CardHeader>
                    <CardTitle>{t('host.overview.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Empty style={{ padding: '32px 0' }}>
                        <EmptyHeader>
                            <EmptyTitle>{t('host.overview.noData')}</EmptyTitle>
                            <EmptyDescription>{t('host.overview.noDataDesc')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                    <Button
                        variant="outline"
                        onClick={() => {
                            void os.refetch();
                            void base.refetch();
                        }}
                    >
                        {t('common.refresh')}
                    </Button>
                </CardContent>
            </Card>
        );
    }
    if (loading || !os.data || !base.data) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('host.overview.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                            <Skeleton className="h-6 w-full" style={{ width: '100%', height: 72 }} />
                            <Skeleton className="h-6 w-full" style={{ width: '100%', height: 72 }} />
                            <Skeleton className="h-6 w-full" style={{ width: '100%', height: 72 }} />
                            <Skeleton className="h-6 w-full" style={{ width: '100%', height: 72 }} />
                        </div>
                    }
                    <Skeleton className="h-24 w-full" style={{ marginTop: 20 }} />
                </CardContent>
            </Card>
        );
    }
    const b = base.data;
    const infoItems = [
        { key: t('home.hostname'), value: b.hostname },
        { key: t('home.system'), value: `${os.data.os} ${os.data.arch}` },
        { key: t('home.arch'), value: os.data.arch },
        { key: t('home.kernel'), value: os.data.kernelVersion },
        { key: t('home.uptime'), value: b.timeSinceUptime },
    ];
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
                <CardHeader>
                    <CardTitle>{t('host.overview.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {infoItems.map((item, index) => (
                            <div key={index}>
                                <dt className="text-sm text-muted-foreground">{item.key}</dt>
                                <dd className="text-sm break-all">{item.value}</dd>
                            </div>
                        ))}
                    </dl>
                </CardContent>
            </Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <StatCard
                    title={t('home.cpu')}
                    value={`${(b.cpuUsedPercent ?? 0).toFixed(1)} %`}
                    percent={b.cpuUsedPercent}
                    icon={<Server />}
                />
                <StatCard
                    title={t('home.memory')}
                    value={`${(b.memoryUsedPercent ?? 0).toFixed(1)} %`}
                    percent={b.memoryUsedPercent}
                    icon={<Layers />}
                    color="var(--primary)"
                />
                <StatCard
                    title={t('home.disk')}
                    value={`${(b.diskUsedPercent ?? 0).toFixed(1)} %`}
                    percent={b.diskUsedPercent}
                    icon={<Archive />}
                    color="var(--primary)"
                />
                <StatCard title={t('home.load')} value={`${(b.load1 ?? 0).toFixed(2)}`} icon={<Activity />} color="var(--primary)" />
            </div>
        </div>
    );
}
