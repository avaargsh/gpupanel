import { useEffect, useState } from 'react';
import { Button, Empty, Select, SideSheet, Space, Table, Tag, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
    useLazyReadTaskLogQuery,
    useSearchTasksQuery,
    type TaskInfo,
} from '@/api/logsApi';
import { formatDateTime } from './shared';

const { Text } = Typography;

const STATUS_OPTIONS = [
    { labelKey: 'logs.status.all', value: '' },
    { labelKey: 'logs.status.success', value: 'Success' },
    { labelKey: 'logs.status.failed', value: 'Failed' },
    { labelKey: 'logs.task.running', value: 'Executing' },
];

function statusColor(status: string): 'green' | 'red' | 'blue' {
    if (status === 'Success') return 'green';
    if (status === 'Failed') return 'red';
    return 'blue';
}

function statusText(t: TFunction, status: string): string {
    if (status === 'Success') return t('logs.status.success');
    if (status === 'Failed') return t('logs.status.failed');
    if (status === 'Executing') return t('logs.task.running');
    return status || '-';
}

export default function TaskLogTab() {
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState('');
    const [target, setTarget] = useState<TaskInfo | null>(null);

    const { data, isFetching, refetch } = useSearchTasksQuery({ page, pageSize, type: '', status });
    const [loadLog, { data: logData, isFetching: logLoading }] = useLazyReadTaskLogQuery();

    const rows = data?.items ?? [];
    const running = rows.some((r) => r.status === 'Executing');

    // 存在执行中的任务时，每 5 秒自动刷新列表。
    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => refetch(), 5000);
        return () => window.clearInterval(timer);
    }, [running, refetch]);

    const openLog = (row: TaskInfo) => {
        setTarget(row);
        loadLog({ taskID: row.id, page: 1, pageSize: 200 });
    };

    const columns = [
        {
            title: t('logs.task.name'),
            dataIndex: 'name',
            key: 'name',
            render: (v: string) => v || '-',
        },
        {
            title: t('logs.task.status'),
            key: 'status',
            width: 140,
            render: (_: unknown, row: TaskInfo) => (
                <Tag color={statusColor(row.status)}>{statusText(t, row.status)}</Tag>
            ),
        },
        {
            title: t('logs.task.log'),
            key: 'log',
            width: 100,
            render: (_: unknown, row: TaskInfo) => (
                <Button size="small" theme="borderless" onClick={() => openLog(row)}>
                    {t('logs.task.view')}
                </Button>
            ),
        },
        {
            title: t('logs.task.date'),
            key: 'createdAt',
            width: 180,
            render: (_: unknown, row: TaskInfo) => formatDateTime(row.createdAt),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Select
                    value={status}
                    placeholder={t('logs.task.status')}
                    style={{ width: 160 }}
                    optionList={STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value }))}
                    onChange={(v) => {
                        setStatus(String(v));
                        setPage(1);
                    }}
                />
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                empty={<Text type="tertiary">{t('logs.task.empty')}</Text>}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (size: number) => {
                        setPageSize(size);
                        setPage(1);
                    },
                }}
            />

            <SideSheet title={t('logs.task.logTitle')} visible={Boolean(target)} onCancel={() => setTarget(null)} width={720}>
                {logLoading ? (
                    <Text type="tertiary">{t('common.loading')}</Text>
                ) : logData && logData.lines.length > 0 ? (
                    <pre
                        style={{
                            margin: 0,
                            maxHeight: '70vh',
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
                        {logData.lines.join('\n')}
                    </pre>
                ) : (
                    <Empty description={t('logs.task.logEmpty')} />
                )}
            </SideSheet>
        </div>
    );
}
