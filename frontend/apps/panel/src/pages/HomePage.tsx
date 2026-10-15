import { useMemo } from 'react';
import { Banner, Button, Card } from '@douyinfe/semi-ui';
import { IconComponent, IconHistogram, IconPulse, IconRefresh, IconServer } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useGetBaseInfoQuery, useGetOsInfoQuery } from '@/api/dashboardApi';
import EChart from '@/components/EChart';
import FirstRun from '@/components/FirstRun';
import StatCard from '@/components/StatCard';
import { getTokens } from '@/theme';
import { useResolvedMode } from '@/utils/useResolvedMode';
import { useAppSelector } from '@/store/hooks';

export default function HomePage() {
    const { t } = useTranslation();
    const resolvedMode = useResolvedMode(useAppSelector((s) => s.ui.themeMode));
    const tokens = getTokens(resolvedMode);
    const { data: osInfo, error: osError, isLoading: osLoading } = useGetOsInfoQuery();
    const { data: baseInfo, error: baseError, isLoading: baseLoading, refetch } = useGetBaseInfoQuery({ ioOption: 'all', netOption: 'all' });

    const backendDown = Boolean(osError) || Boolean(baseError);
    const loading = osLoading || baseLoading;

    const fmtPercent = (v?: number) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '--');

    const chartOption = useMemo(() => {
        const cpu = baseInfo?.cpuUsedPercent;
        // One observed value is not a historical series. Never synthesize load samples.
        const points = typeof cpu === 'number' && Number.isFinite(cpu) ? [cpu] : [];
        const color = tokens.primary;
        return {
            tooltip: { trigger: 'axis' as const },
            grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: false },
            xAxis: { type: 'category' as const, boundaryGap: false, show: false },
            yAxis: { type: 'value' as const, min: 0, max: 100, show: false },
            series: [
                {
                    name: 'CPU %',
                    type: 'line' as const,
                    smooth: true,
                    symbol: 'none',
                    data: points,
                    lineStyle: { width: 2.5, color },
                    areaStyle: {
                        color: {
                            type: 'linear' as const,
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: `${color}55` },
                                { offset: 1, color: `${color}05` },
                            ],
                        },
                    },
                },
            ],
        };
    }, [baseInfo?.cpuUsedPercent, tokens.primary]);

    const loadText = baseInfo ? `${(baseInfo.load1 ?? 0).toFixed(2)} / ${(baseInfo.load5 ?? 0).toFixed(2)} / ${(baseInfo.load15 ?? 0).toFixed(2)}` : '--';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1 style={{ fontSize: 24, fontWeight: 650, letterSpacing: -0.4, margin: 0 }}>{t('home.title')}</h1>
                <div style={{ flexGrow: 1 }} />
                <Button size="small" icon={<IconRefresh />} onClick={() => refetch()}>
                    {t('home.refresh')}
                </Button>
            </div>

            <FirstRun />

            {backendDown && <Banner type="warning" description={t('home.noData')} closeIcon={null} />}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <StatCard
                    title={t('home.cpu')}
                    value={fmtPercent(baseInfo?.cpuUsedPercent)}
                    percent={baseInfo?.cpuUsedPercent}
                    icon={<IconHistogram size="large" />}
                    color="var(--semi-color-primary)"
                />
                <StatCard
                    title={t('home.memory')}
                    value={fmtPercent(baseInfo?.memoryUsedPercent)}
                    percent={baseInfo?.memoryUsedPercent}
                    icon={<IconComponent size="large" />}
                    color="var(--semi-color-info)"
                />
                <StatCard
                    title={t('home.disk')}
                    value={fmtPercent(baseInfo?.diskUsedPercent)}
                    percent={baseInfo?.diskUsedPercent}
                    icon={<IconServer size="large" />}
                    color="var(--semi-color-success)"
                />
                <StatCard title={t('home.load')} value={loadText} icon={<IconPulse size="large" />} color="var(--semi-color-warning)" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: 16 }}>
                <Card bodyStyle={{ padding: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('home.liveLoad')}</div>
                    <EChart option={chartOption} height={240} themeKey={resolvedMode} />
                </Card>
                <Card style={{ height: '100%' }} bodyStyle={{ padding: 20 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>{t('home.system')}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <InfoRow label={t('home.hostname')} value={osInfo?.hostname ?? '--'} />
                        <InfoRow label={t('home.system')} value={osInfo?.os ?? '--'} />
                        <InfoRow label={t('home.arch')} value={osInfo?.arch ?? '--'} />
                        <InfoRow label={t('home.kernel')} value={osInfo?.kernelVersion ?? osInfo?.kernel ?? '--'} />
                        <InfoRow label={t('home.uptime')} value={baseInfo?.timeSinceUptime ?? '--'} />
                    </div>
                </Card>
            </div>

            {loading && <span style={{ fontSize: 12, color: 'var(--semi-color-text-2)' }}>{t('common.loading')}</span>}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--semi-color-text-2)' }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
        </div>
    );
}
