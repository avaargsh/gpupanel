import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, DatePicker, Empty, Input, Select, SideSheet, Space, Switch, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/pages/database/shared';
import {
    useGetSystemLogStatusQuery,
    useListRunningServicesQuery,
    useReadSystemLogQuery,
    type SystemLogItem,
} from '@/api/logsApi';
import { LOG_PRIORITIES, priorityColor, priorityLabel, startOfToday } from './shared';

const { Text } = Typography;

const PAGE_SIZES = [20, 50, 100, 200, 500];

export default function SystemLogTab() {
    const { t } = useTranslation();

    const [pageSize, setPageSize] = useState(100);
    const [searchInput, setSearchInput] = useState('');
    const keyword = useDebouncedValue(searchInput);
    const [priority, setPriority] = useState('');
    const [service, setService] = useState('');
    const [range, setRange] = useState<[Date, Date]>([startOfToday(), new Date()]);
    const [watching, setWatching] = useState(false);
    const [stack, setStack] = useState<string[]>(['']);
    const [idx, setIdx] = useState(0);
    const [selected, setSelected] = useState<SystemLogItem | null>(null);

    const cursor = stack[idx] ?? '';

    const { data: status } = useGetSystemLogStatusQuery();
    const { data: services = [] } = useListRunningServicesQuery();

    const { data, isFetching, refetch } = useReadSystemLogQuery({
        pageSize,
        cursor,
        startTime: range[0].toISOString(),
        endTime: range[1].toISOString(),
        keyword,
        priority,
        service,
    });

    // 记录游标历史：每页结果里的 nextCursor 存入下一页槽位。
    useEffect(() => {
        if (!data) return;
        setStack((prev) => {
            if (prev[idx + 1] === data.nextCursor) return prev;
            const next = prev.slice(0, idx + 1);
            next[idx + 1] = data.nextCursor;
            return next;
        });
    }, [data, idx]);

    // 过滤条件变化时回到第一页。
    useEffect(() => {
        setStack(['']);
        setIdx(0);
    }, [keyword, priority, service, pageSize, range]);

    // 「追踪」：每 3 秒自动刷新当前页。
    useEffect(() => {
        if (!watching) return;
        const timer = window.setInterval(() => refetch(), 3000);
        return () => window.clearInterval(timer);
    }, [watching, refetch]);

    const rows = data?.items ?? [];
    const hasMore = Boolean(data?.hasMore);

    const isFirst = idx === 0;
    const isLast = !hasMore;

    const keywordDisabled = Boolean(status && !status.keywordFilterSupported);

    const columns = useMemo(
        () => [
            {
                title: t('logs.system.date'),
                dataIndex: 'time',
                key: 'time',
                width: 200,
                render: (v: string) => v || '-',
            },
            {
                title: t('logs.system.priority'),
                key: 'priority',
                width: 130,
                render: (_: unknown, row: SystemLogItem) => (
                    <Tag color={priorityColor(row.priority)} size="small">
                        {priorityLabel(t, row.priority)}
                    </Tag>
                ),
            },
            {
                title: t('logs.system.service'),
                key: 'service',
                width: 180,
                ellipsis: true,
                render: (_: unknown, row: SystemLogItem) => row.service || '-',
            },
            {
                title: t('logs.system.message'),
                dataIndex: 'message',
                key: 'message',
                ellipsis: true,
            },
        ],
        [t],
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {status ? (
                <Card>
                    <Space wrap>
                        <Tag color="green" size="large">
                            {status.source}
                        </Tag>
                        {status.version ? (
                            <Text type="tertiary">
                                {t('logs.system.version')}: {status.version}
                            </Text>
                        ) : null}
                    </Space>
                </Card>
            ) : null}

            {keywordDisabled && status?.message ? (
                <Banner type="info" description={status.message} closeIcon={null} />
            ) : null}

            <Space wrap>
                <Select
                    value={priority}
                    placeholder={t('logs.system.priority')}
                    style={{ width: 180 }}
                    showClear
                    optionList={LOG_PRIORITIES.map((p) => ({ label: priorityLabel(t, p), value: p }))}
                    onChange={(v) => setPriority(v ? String(v) : '')}
                />
                <Select
                    value={service}
                    placeholder={t('logs.system.service')}
                    style={{ width: 180 }}
                    showClear
                    filter
                    allowCreate
                    optionList={services.map((s) => ({ label: s, value: s }))}
                    onChange={(v) => setService(v ? String(v) : '')}
                />
                <DatePicker
                    type="dateTimeRange"
                    value={range}
                    format="yyyy-MM-dd HH:mm:ss"
                    onChange={(value) => {
                        if (Array.isArray(value) && value[0] && value[1]) {
                            setRange([value[0] as Date, value[1] as Date]);
                        }
                    }}
                />
                <Input
                    prefix={<IconSearch />}
                    value={searchInput}
                    disabled={keywordDisabled}
                    placeholder={t('logs.system.filter')}
                    onChange={setSearchInput}
                    style={{ width: 200 }}
                    showClear
                />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Switch checked={watching} onChange={setWatching} size="small" />
                    <Text size="small">{t('logs.system.watch')}</Text>
                </label>
                <Button icon={<IconRefresh />} onClick={() => refetch()}>
                    {t('logs.system.refresh')}
                </Button>
            </Space>

            <Table
                rowKey={(row) => `${row?.time ?? ''}-${row?.priority ?? ''}-${row?.service ?? ''}-${row?.message ?? ''}`}
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                pagination={false}
                onRow={(row) => ({
                    onClick: () => setSelected(row as SystemLogItem),
                    style: { cursor: 'pointer' },
                })}
                empty={<Text type="tertiary">{t('logs.system.empty')}</Text>}
            />

            <Space>
                <Select
                    value={String(pageSize)}
                    style={{ width: 100 }}
                    optionList={PAGE_SIZES.map((s) => ({ label: String(s), value: String(s) }))}
                    onChange={(v) => setPageSize(Number(v))}
                />
                <Button disabled={isFirst || isFetching} onClick={() => setIdx((i) => Math.max(0, i - 1))}>
                    {t('logs.system.previous')}
                </Button>
                <Button disabled={isLast || isFetching} onClick={() => setIdx((i) => i + 1)}>
                    {t('logs.system.next')}
                </Button>
            </Space>

            <SideSheet
                title={t('logs.system.detail')}
                visible={Boolean(selected)}
                onCancel={() => setSelected(null)}
                width={720}
            >
                {selected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Text>
                            <strong>{t('logs.system.date')}：</strong>
                            {selected.time || '-'}
                        </Text>
                        <Text>
                            <strong>{t('logs.system.priority')}：</strong>
                            {priorityLabel(t, selected.priority)}
                        </Text>
                        <Text>
                            <strong>{t('logs.system.service')}：</strong>
                            {selected.service || '-'}
                        </Text>
                        <Text>
                            <strong>{t('logs.system.message')}：</strong>
                            {selected.message}
                        </Text>
                        <pre
                            style={{
                                margin: 0,
                                maxHeight: '60vh',
                                overflow: 'auto',
                                padding: 12,
                                fontSize: 12,
                                lineHeight: 1.6,
                                color: '#e8eaf0',
                                background: '#14151a',
                                borderRadius: 8,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                            }}
                        >
                            {selected.raw}
                        </pre>
                    </div>
                ) : (
                    <Empty />
                )}
            </SideSheet>
        </div>
    );
}
