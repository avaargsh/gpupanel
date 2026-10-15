import { useMemo, useState } from 'react';
import { Button, Card, Empty, RadioGroup, Radio, Select, Skeleton, Space } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import EChart from '@/components/EChart';
import {
    useGetIOOptionsQuery,
    useGetNetworkOptionsQuery,
    useMonitorSearchQuery,
    type MonitorSeries,
} from '@/api/hostApi';
import { getTokens } from '@/theme';
import { useAppSelector } from '@/store/hooks';
import { useResolvedMode } from '@/utils/useResolvedMode';

const RANGES = [
    { key: '1h', ms: 60 * 60 * 1000 },
    { key: '6h', ms: 6 * 60 * 60 * 1000 },
    { key: '12h', ms: 12 * 60 * 60 * 1000 },
    { key: '1d', ms: 24 * 60 * 60 * 1000 },
    { key: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
] as const;

const fmtTime = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const seriesOf = (data: MonitorSeries[] | undefined, param: string): MonitorSeries | undefined =>
    data?.find((s) => s.param === param);

function lineOption(opts: {
    xData: string[];
    series: Array<{ name: string; data: Array<number | string>; yAxisIndex?: number }>;
    yAxis: Array<{ name?: string; axisLabel?: Record<string, boolean | number>; splitNumber?: number }>;
    colors: string[];
}): EChartsOption {
    return {
        animation: false,
        grid: { left: 44, right: 24, top: 34, bottom: 28 },
        legend: { top: 4, left: 0, itemWidth: 14, itemHeight: 9, textStyle: { fontSize: 12 } },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', boundaryGap: false, data: opts.xData, axisLabel: { fontSize: 11 } },
        yAxis: opts.yAxis.map((y) => ({
            type: 'value',
            name: y.name,
            nameTextStyle: { fontSize: 11 },
            splitLine: { lineStyle: { opacity: 0.3 } },
            axisLabel: { fontSize: 11, ...(y.axisLabel ?? {}) },
            ...(y.splitNumber ? { splitNumber: y.splitNumber } : {}),
        })),
        series: opts.series.map((s, i) => ({
            name: s.name,
            type: 'line',
            smooth: true,
            showSymbol: false,
            symbol: 'circle',
            symbolSize: 4,
            lineStyle: { width: 2 },
            yAxisIndex: s.yAxisIndex ?? 0,
            data: s.data,
            itemStyle: { color: opts.colors[i] },
        })),
    };
}

/** 监控页签：负载 / CPU / 内存 / 网络 / 磁盘 I/O 时序图 */
export default function HostMonitor() {
    const { t } = useTranslation();
    const mode = useAppSelector((s) => s.ui.themeMode);
    const resolvedMode = useResolvedMode(mode);
    const tokens = getTokens(resolvedMode);

    const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]['key']>('1h');
    const [network, setNetwork] = useState('all');
    const [io, setIo] = useState('all');

    const netOptions = useGetNetworkOptionsQuery();
    const ioOptions = useGetIOOptionsQuery();

    const rangeMs = RANGES.find((r) => r.key === rangeKey)!.ms;
    const endTime = useMemo(() => new Date(), [rangeKey]);
    const monitor = useMonitorSearchQuery(
        {
            param: 'all',
            io,
            network,
            startTime: new Date(endTime.getTime() - rangeMs).toISOString(),
            endTime: endTime.toISOString(),
        },
        { skip: netOptions.isError || ioOptions.isError },
    );

    const selectNetwork = netOptions.data?.length ? netOptions.data : ['all'];
    const selectIo = ioOptions.data?.length ? ioOptions.data : ['all'];
    const effectiveNetwork = network && selectNetwork.includes(network) ? network : selectNetwork[0];
    const effectiveIo = io && selectIo.includes(io) ? io : selectIo[0];

    const base = seriesOf(monitor.data, 'base');
    const netSeries = seriesOf(monitor.data, 'network');
    const ioSeries = seriesOf(monitor.data, 'io');

    const loadOption = useMemo(() => {
        const dates = (base?.date ?? []).map(fmtTime);
        return lineOption({
            xData: dates,
            yAxis: [{ name: t('host.monitor.load') }, { name: '%' }],
            colors: [tokens.primary, tokens.warning, tokens.error, tokens.info],
            series: [
                { name: '1m', data: (base?.value ?? []).map((v) => v.cpuLoad1?.toFixed(2) ?? 0) },
                { name: '5m', data: (base?.value ?? []).map((v) => v.cpuLoad5?.toFixed(2) ?? 0) },
                { name: '15m', data: (base?.value ?? []).map((v) => v.cpuLoad15?.toFixed(2) ?? 0) },
                { name: t('host.monitor.loadUsage'), yAxisIndex: 1, data: (base?.value ?? []).map((v) => v.loadUsage ?? 0) },
            ],
        });
    }, [base, tokens, t]);

    const cpuOption = useMemo(() => {
        return lineOption({
            xData: (base?.date ?? []).map(fmtTime),
            yAxis: [{ name: '%' }],
            colors: [tokens.primary],
            series: [{ name: t('host.monitor.cpu'), data: (base?.value ?? []).map((v) => v.cpu?.toFixed(2) ?? 0) }],
        });
    }, [base, tokens, t]);

    const memoryOption = useMemo(() => {
        return lineOption({
            xData: (base?.date ?? []).map(fmtTime),
            yAxis: [{ name: '%' }],
            colors: [tokens.success],
            series: [{ name: t('host.monitor.memory'), data: (base?.value ?? []).map((v) => v.memory?.toFixed(2) ?? 0) }],
        });
    }, [base, tokens, t]);

    const networkOption = useMemo(() => {
        return lineOption({
            xData: (netSeries?.date ?? []).map(fmtTime),
            yAxis: [{ name: 'KB/s' }],
            colors: [tokens.success, tokens.primary],
            series: [
                { name: t('host.monitor.up'), data: (netSeries?.value ?? []).map((v) => Number((v.up ?? 0).toFixed(2))) },
                { name: t('host.monitor.down'), data: (netSeries?.value ?? []).map((v) => Number((v.down ?? 0).toFixed(2))) },
            ],
        });
    }, [netSeries, tokens, t]);

    const ioOption = useMemo(() => {
        return lineOption({
            xData: (ioSeries?.date ?? []).map(fmtTime),
            yAxis: [
                { name: 'KB/s' },
                { name: t('host.monitor.time'), axisLabel: { show: false }, splitNumber: 2 },
            ],
            colors: [tokens.primary, tokens.warning, tokens.info],
            series: [
                { name: t('host.monitor.read'), data: (ioSeries?.value ?? []).map((v) => Number((v.read / 1024).toFixed(2))) },
                { name: t('host.monitor.write'), data: (ioSeries?.value ?? []).map((v) => Number((v.write / 1024).toFixed(2))) },
                { name: t('host.monitor.time'), yAxisIndex: 1, data: (ioSeries?.value ?? []).map((v) => v.time ?? 0) },
            ],
        });
    }, [ioSeries, tokens, t]);

    const offline = netOptions.isError || ioOptions.isError;
    const loading = netOptions.isLoading || ioOptions.isLoading || (monitor.isFetching && !monitor.data);

    const chartCards = [
        { title: t('host.monitor.load'), option: loadOption },
        { title: t('host.monitor.cpu'), option: cpuOption },
        { title: t('host.monitor.memory'), option: memoryOption },
        { title: t('host.monitor.network'), option: networkOption },
        { title: t('host.monitor.diskIO'), option: ioOption },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card bodyStyle={{ padding: '12px 16px' }}>
                <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap spacing="loose">
                        <RadioGroup
                            type="button"
                            value={rangeKey}
                            onChange={(e) => {
                                const evt = e as { detail?: { value?: unknown }; target?: { value?: unknown } };
                                const v = evt.detail?.value ?? evt.target?.value;
                                setRangeKey(String(v) as typeof rangeKey);
                            }}
                        >
                            {RANGES.map((r) => (
                                <Radio key={r.key} value={r.key}>
                                    {r.key}
                                </Radio>
                            ))}
                        </RadioGroup>
                        <span style={{ fontSize: 13, color: 'var(--semi-color-text-2)' }}>{t('host.monitor.network')}</span>
                        <Select
                            value={effectiveNetwork}
                            onChange={(v) => setNetwork(String(v))}
                            style={{ width: 120 }}
                            optionList={selectNetwork.map((o) => ({ label: o, value: o }))}
                        />
                        <span style={{ fontSize: 13, color: 'var(--semi-color-text-2)' }}>{t('host.monitor.disk')}</span>
                        <Select
                            value={effectiveIo}
                            onChange={(v) => setIo(String(v))}
                            style={{ width: 120 }}
                            optionList={selectIo.map((o) => ({ label: o, value: o }))}
                        />
                    </Space>
                    <Button icon={<IconRefresh />} onClick={() => monitor.refetch()}>
                        {t('home.refresh')}
                    </Button>
                </Space>
            </Card>

            {offline ? (
                <Card>
                    <Empty title={t('host.overview.noData')} style={{ padding: '24px 0' }} />
                </Card>
            ) : loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                    {chartCards.map((c) => (
                        <Card key={c.title} bodyStyle={{ padding: 12 }}>
                            <Skeleton.Title style={{ width: 120, marginBottom: 12 }} />
                            <Skeleton.Paragraph rows={5} />
                        </Card>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                    {chartCards.map((c) => (
                        <Card key={c.title} title={c.title} bodyStyle={{ padding: 12 }}>
                            <EChart option={c.option} height={230} themeKey={resolvedMode} />
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}