import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { allAccelerators, useGetGpuInfoQuery, type GpuDevice } from '@/api/gpuApi';
import { useGetGpuOptionsQuery, useLoadGpuMonitorQuery, type GpuMonitorData } from '@/api/aiApi';
import EChart from '@/components/EChart';
import type { EChartsOption, LineSeriesOption } from 'echarts';
const RANGES = [
    { key: '1h', hours: 1 },
    { key: '6h', hours: 6 },
    { key: '24h', hours: 24 },
];
function DeviceCard({ device }: { device: GpuDevice }) {
    const { t } = useTranslation();
    const processes = device.processes ?? [];
    return (
        <Card style={{ marginBottom: 12 }}>
            <CardHeader>
                <CardTitle>{`${device.productName || 'GPU'} #${device.index}`}</CardTitle>
                <CardAction>{<Badge variant={'secondary'}>{device.type || 'gpu'}</Badge>}</CardAction>
            </CardHeader>
            <CardContent>
                <div className="flex flex-row flex-wrap gap-3 items-center" style={{ marginBottom: 12 }}>
                    <Metric label={t('ai.gpu.utilization')} value={device.gpuUtil ? `${device.gpuUtil}%` : '-'} />
                    <Metric
                        label={t('ai.gpu.memory')}
                        value={device.memUsed && device.memTotal ? `${device.memUsed} / ${device.memTotal}` : '-'}
                    />
                    <Metric label={t('ai.gpu.temperature')} value={device.temperature ? `${device.temperature}°C` : '-'} />
                    <Metric label={t('ai.gpu.power')} value={device.powerDraw ? `${device.powerDraw}W` : '-'} />
                </div>
                {processes.length > 0 ? (
                    <div className="flex flex-col gap-3" aria-busy={false}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead style={{ width: 100 }}>{'PID'}</TableHead>
                                    <TableHead>{t('ai.gpu.processName')}</TableHead>
                                    <TableHead style={{ width: 140 }}>{t('ai.gpu.usedMemory')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {processes.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={3}>{'—'}</TableCell>
                                    </TableRow>
                                ) : (
                                    processes.map((row, rowIndex) => (
                                        <TableRow key={row['pid'] ?? rowIndex}>
                                            <TableCell>{row['pid']}</TableCell>
                                            <TableCell>{row['processName'] || '-'}</TableCell>
                                            <TableCell>{row['usedMemory'] || '-'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <span className="text-muted-foreground text-sm">
                        {t(device.processStatus === 'unavailable' ? 'ai.gpu.processUnavailable' : 'ai.gpu.noProcess')}
                    </span>
                )}
            </CardContent>
        </Card>
    );
}
function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ minWidth: 120 }}>
            <span className="text-muted-foreground text-sm" style={{ display: 'block' }}>
                {label}
            </span>
            <strong className="text-sm">{value}</strong>
        </div>
    );
}
function monitorOption(data: GpuMonitorData | undefined): EChartsOption | null {
    if (!data || !data.date?.length) return null;
    const series = [
        { name: 'GPU %', values: data.gpuValue },
        { name: 'Memory %', values: data.memoryPercent },
        { name: 'Temperature', values: data.temperatureValue },
        { name: 'Power (W)', values: data.powerUsed },
    ];
    return {
        tooltip: { trigger: 'axis' },
        legend: { data: series.map((s) => s.name) },
        grid: { left: 40, right: 20, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: data.date, boundaryGap: false },
        yAxis: { type: 'value' },
        series: series.map((s): LineSeriesOption => ({
            name: s.name,
            type: 'line',
            smooth: true,
            showSymbol: false,
            connectNulls: true,
            data: s.values ?? [],
        })),
    };
}
function History() {
    const { t } = useTranslation();
    const optionsQuery = useGetGpuOptionsQuery();
    const options = optionsQuery.currentData;
    const products = options?.options ?? [];
    const [productName, setProductName] = useState('');
    const [rangeKey, setRangeKey] = useState('1h');
    const [aggregation, setAggregation] = useState<'avg' | 'max'>('avg');
    const product = productName || products[0] || '';
    const { startTime, endTime } = useMemo(() => {
        const hours = RANGES.find((r) => r.key === rangeKey)?.hours ?? 1;
        const end = new Date();
        const start = new Date(end.getTime() - hours * 3600 * 1000);
        return { startTime: start.toISOString(), endTime: end.toISOString() };
    }, [rangeKey]);
    const enabled = !!options?.supported && !!product;
    const { data, isLoading, isError, refetch } = useLoadGpuMonitorQuery(
        { productName: product, startTime, endTime, aggregation },
        { skip: !enabled },
    );
    const option = monitorOption(data);
    if (optionsQuery.isError || isError)
        return (
            <Alert variant="destructive">
                <AlertDescription>
                    {t('hostOps.loadError')}{' '}
                    <Button
                        variant="outline"
                        onClick={() => {
                            void optionsQuery.refetch();
                            if (enabled) void refetch();
                        }}
                    >
                        {t('common.refresh')}
                    </Button>
                </AlertDescription>
            </Alert>
        );
    if (optionsQuery.isLoading) return <Spinner role="status" aria-label={t('common.loading')} />;
    if (options && !options.supported) {
        return <span className="text-muted-foreground text-sm">{t('ai.gpu.noHistory')}</span>;
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex flex-row flex-wrap gap-3 items-center">
                <NativeSelect
                    aria-label={t('ai.gpu.device')}
                    value={product || undefined}
                    style={{ width: 200 }}
                    onChange={(event) =>
                        setProductName(
                            String(
                                products.map((p) => ({ label: p, value: p })).find((option) => String(option.value) === event.target.value)
                                    ?.value ?? event.target.value,
                            ),
                        )
                    }
                >
                    <NativeSelectOption value="" disabled>
                        {t('ai.gpu.device')}
                    </NativeSelectOption>
                    {products
                        .map((p) => ({ label: p, value: p }))
                        .map((option) => (
                            <NativeSelectOption key={String(option.value)} value={option.value}>
                                {option.label}
                            </NativeSelectOption>
                        ))}
                </NativeSelect>
                <NativeSelect
                    aria-label={t('ai.gpu.history')}
                    value={rangeKey}
                    style={{ width: 160 }}
                    onChange={(event) =>
                        setRangeKey(
                            String(
                                RANGES.map((r) => ({ label: t(`ai.gpu.last${r.key}` as never), value: r.key })).find(
                                    (option) => String(option.value) === event.target.value,
                                )?.value ?? event.target.value,
                            ),
                        )
                    }
                >
                    <NativeSelectOption value="" disabled>
                        {'—'}
                    </NativeSelectOption>
                    {RANGES.map((r) => ({ label: t(`ai.gpu.last${r.key}` as never), value: r.key })).map((option) => (
                        <NativeSelectOption key={String(option.value)} value={option.value}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <NativeSelect
                    aria-label={t('ai.gpu.avg')}
                    value={aggregation}
                    style={{ width: 120 }}
                    onChange={(event) => setAggregation(event.target.value === 'max' ? 'max' : 'avg')}
                >
                    <NativeSelectOption value="" disabled>
                        {'—'}
                    </NativeSelectOption>
                    {[
                        { label: t('ai.gpu.avg'), value: 'avg' },
                        { label: t('ai.gpu.max'), value: 'max' },
                    ].map((option) => (
                        <NativeSelectOption key={String(option.value)} value={option.value}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </div>
            {isLoading ? (
                <span className="text-muted-foreground text-sm">{t('common.loading')}</span>
            ) : option ? (
                <EChart option={option} height={320} />
            ) : (
                <Empty>
                    <EmptyHeader>
                        <EmptyDescription>{t('ai.gpu.noData')}</EmptyDescription>
                    </EmptyHeader>
                </Empty>
            )}
        </div>
    );
}
export default function GpuTab() {
    const { t } = useTranslation();
    const { currentData: data, isLoading, isError, refetch } = useGetGpuInfoQuery();
    const devices = allAccelerators(data);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data?.warnings?.map((warning) => (
                <span className="text-muted-foreground text-sm" key={warning}>
                    {warning}
                </span>
            ))}
            <Card>
                <CardHeader>
                    <CardTitle>{t('ai.gpu.current')}</CardTitle>
                </CardHeader>
                <CardContent>
                    {isError ? (
                        <Alert variant="destructive">
                            <AlertDescription>
                                {t('hostOps.loadError')}{' '}
                                <Button variant="outline" onClick={() => void refetch()}>
                                    {t('common.refresh')}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : isLoading ? (
                        <Spinner role="status" aria-label="Loading" />
                    ) : (
                        <>
                            {devices.length === 0 ? (
                                <Empty>
                                    <EmptyHeader>
                                        <EmptyDescription>{t('ai.gpu.empty')}</EmptyDescription>
                                    </EmptyHeader>
                                </Empty>
                            ) : (
                                devices.map((d, i) => <DeviceCard key={`${d.type}-${d.uuid || d.index}-${i}`} device={d} />)
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle>{t('ai.gpu.history')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <History />
                </CardContent>
            </Card>
        </div>
    );
}
