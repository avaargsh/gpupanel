import { useMemo, useState } from 'react';
import { Card, Empty, Select, Space, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { allAccelerators, useGetGpuInfoQuery, type GpuDevice } from '@/api/gpuApi';
import { useGetGpuOptionsQuery, useLoadGpuMonitorQuery, type GpuMonitorData } from '@/api/aiApi';
import EChart from '@/components/EChart';
import type { EChartsOption, LineSeriesOption } from 'echarts';

const { Text } = Typography;

const RANGES = [
    { key: '1h', hours: 1 },
    { key: '6h', hours: 6 },
    { key: '24h', hours: 24 },
];

function DeviceCard({ device }: { device: GpuDevice }) {
    const { t } = useTranslation();
    const processes = device.processes ?? [];
    const columns = [
        { title: 'PID', dataIndex: 'pid', key: 'pid', width: 100 },
        { title: t('ai.gpu.processName'), dataIndex: 'processName', key: 'processName', render: (v: string) => v || '-' },
        { title: t('ai.gpu.usedMemory'), dataIndex: 'usedMemory', key: 'usedMemory', width: 140, render: (v: string) => v || '-' },
    ];

    return (
        <Card
            title={`${device.productName || 'GPU'} #${device.index}`}
            headerExtraContent={<Tag size="small">{device.type || 'gpu'}</Tag>}
            style={{ marginBottom: 12 }}
        >
            <Space wrap style={{ marginBottom: 12 }}>
                <Metric label={t('ai.gpu.utilization')} value={device.gpuUtil ? `${device.gpuUtil}%` : '-'} />
                <Metric label={t('ai.gpu.memory')} value={device.memUsed && device.memTotal ? `${device.memUsed} / ${device.memTotal}` : '-'} />
                <Metric label={t('ai.gpu.temperature')} value={device.temperature ? `${device.temperature}°C` : '-'} />
                <Metric label={t('ai.gpu.power')} value={device.powerDraw ? `${device.powerDraw}W` : '-'} />
            </Space>
            {processes.length > 0 ? (
                <Table rowKey="pid" columns={columns} dataSource={processes} pagination={false} size="small" />
            ) : (
                <Text type="tertiary" size="small">{t('ai.gpu.noProcess')}</Text>
            )}
        </Card>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ minWidth: 120 }}>
            <Text size="small" type="tertiary" style={{ display: 'block' }}>{label}</Text>
            <Text strong>{value}</Text>
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
        series: series.map(
            (s): LineSeriesOption => ({
                name: s.name,
                type: 'line',
                smooth: true,
                showSymbol: false,
                connectNulls: true,
                data: s.values ?? [],
            }),
        ),
    };
}

function History() {
    const { t } = useTranslation();
    const { data: options } = useGetGpuOptionsQuery();
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
    const { data, isLoading } = useLoadGpuMonitorQuery(
        { productName: product, startTime, endTime, aggregation },
        { skip: !enabled },
    );
    const option = monitorOption(data);

    if (options && !options.supported) {
        return <Text type="tertiary">{t('ai.gpu.noHistory')}</Text>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Select
                    value={product || undefined}
                    onChange={(v) => setProductName(String(v))}
                    style={{ width: 200 }}
                    placeholder={t('ai.gpu.device')}
                    optionList={products.map((p) => ({ label: p, value: p }))}
                />
                <Select
                    value={rangeKey}
                    onChange={(v) => setRangeKey(String(v))}
                    style={{ width: 160 }}
                    optionList={RANGES.map((r) => ({ label: t(`ai.gpu.last${r.key}` as never), value: r.key }))}
                />
                <Select
                    value={aggregation}
                    onChange={(v) => setAggregation(v as 'avg' | 'max')}
                    style={{ width: 120 }}
                    optionList={[
                        { label: t('ai.gpu.avg'), value: 'avg' },
                        { label: t('ai.gpu.max'), value: 'max' },
                    ]}
                />
            </Space>
            {isLoading ? (
                <Text type="tertiary">{t('common.loading')}</Text>
            ) : option ? (
                <EChart option={option} height={320} />
            ) : (
                <Empty description={t('ai.gpu.noData')} />
            )}
        </div>
    );
}

export default function GpuTab() {
    const { t } = useTranslation();
    const { data, isLoading } = useGetGpuInfoQuery();
    const devices = allAccelerators(data);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={t('ai.gpu.current')} loading={isLoading}>
                {devices.length === 0 ? (
                    <Empty description={t('ai.gpu.empty')} />
                ) : (
                    devices.map((d, i) => <DeviceCard key={`${d.type}-${d.uuid || d.index}-${i}`} device={d} />)
                )}
            </Card>
            <Card title={t('ai.gpu.history')}>
                <History />
            </Card>
        </div>
    );
}
