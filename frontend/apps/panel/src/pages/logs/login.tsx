import { useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/pages/database/shared';
import { useCleanLogsMutation, useSearchLoginLogsQuery, type LoginLog } from '@/api/logsApi';
import { formatDateTime } from './shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const STATUS_OPTIONS = [
    { labelKey: 'logs.status.all', value: '' },
    { labelKey: 'logs.status.success', value: 'Success' },
    { labelKey: 'logs.status.failed', value: 'Failed' },
];

export default function LoginLogTab() {
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [status, setStatus] = useState('');

    const { data, isFetching } = useSearchLoginLogsQuery({ page, pageSize, info, status });
    const [cleanLogs, { isLoading: cleaning }] = useCleanLogsMutation();

    const rows = data?.items ?? [];

    const messageText = (row: LoginLog) => {
        if (row.message === 'ErrAuth') return t('logs.login.errorAuth');
        if (row.message === 'ErrMFA') return t('logs.login.errorMfa');
        return row.message || '-';
    };

    const onClean = () => {
        Modal.confirm({
            title: t('logs.login.clean'),
            content: t('logs.login.cleanConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await cleanLogs({ logType: 'login' }).unwrap();
                    Toast.success(t('logs.login.cleaned'));
                    setPage(1);
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('logs.login.ip'), dataIndex: 'ip', key: 'ip', width: 160 },
        { title: t('logs.login.user'), dataIndex: 'user', key: 'user', width: 140, render: (v: string) => v || '-' },
        { title: t('logs.login.address'), dataIndex: 'address', key: 'address', width: 160, render: (v: string) => v || '-' },
        {
            title: t('logs.login.agent'),
            dataIndex: 'agent',
            key: 'agent',
            ellipsis: true,
            render: (v: string) => v || '-',
        },
        {
            title: t('logs.login.status'),
            key: 'status',
            width: 140,
            render: (_: unknown, row: LoginLog) => (
                <Tag color={row.status === 'Success' ? 'green' : 'red'}>{messageText(row)}</Tag>
            ),
        },
        {
            title: t('logs.login.date'),
            key: 'createdAt',
            width: 180,
            render: (_: unknown, row: LoginLog) => formatDateTime(row.createdAt),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('logs.login.searchPlaceholder')}
                    value={searchInput}
                    onChange={setSearchInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Select
                    value={status}
                    placeholder={t('logs.login.status')}
                    style={{ width: 140 }}
                    optionList={STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value }))}
                    onChange={(v) => {
                        setStatus(String(v));
                        setPage(1);
                    }}
                />
                <Button type="danger" theme="light" icon={<IconDelete />} loading={cleaning} onClick={onClean}>
                    {t('logs.login.clean')}
                </Button>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                empty={<Text type="tertiary">{t('logs.login.empty')}</Text>}
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
        </div>
    );
}
