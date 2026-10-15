import { useState } from 'react';
import { Banner, Button, Input, Modal, Select, Space, Table, Tag, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/pages/database/shared';
import { useCleanSSHLogsMutation, useSearchSSHLogsQuery, type SSHHistory } from '@/api/logsApi';
import { authModeLabel, formatDateTime } from './shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const STATUS_OPTIONS = [
    { labelKey: 'logs.status.all', value: 'All' },
    { labelKey: 'logs.status.success', value: 'Success' },
    { labelKey: 'logs.status.failed', value: 'Failed' },
];

export default function SSHLogTab() {
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [status, setStatus] = useState('All');

    const { data, isFetching } = useSearchSSHLogsQuery({ page, pageSize, info, status });
    const [cleanSSHLogs, { isLoading: cleaning }] = useCleanSSHLogsMutation();

    const rows = data?.items ?? [];

    const onClean = () => {
        Modal.confirm({
            title: t('logs.ssh.clean'),
            content: t('logs.ssh.cleanConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await cleanSSHLogs().unwrap();
                    Toast.success(t('logs.ssh.cleaned'));
                    setPage(1);
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('logs.ssh.ip'), dataIndex: 'address', key: 'address', width: 160, render: (v: string) => v || '-' },
        { title: t('logs.ssh.area'), dataIndex: 'area', key: 'area', width: 140, render: (v: string) => v || '-' },
        { title: t('logs.ssh.port'), dataIndex: 'port', key: 'port', width: 90, render: (v: string) => v || '-' },
        {
            title: t('logs.ssh.authMode'),
            key: 'authMode',
            width: 120,
            render: (_: unknown, row: SSHHistory) => authModeLabel(t, row.authMode),
        },
        { title: t('logs.ssh.user'), dataIndex: 'user', key: 'user', width: 120, render: (v: string) => v || '-' },
        {
            title: t('logs.ssh.status'),
            key: 'status',
            width: 120,
            render: (_: unknown, row: SSHHistory) =>
                row.status === 'Success' ? (
                    <Tag color="green">{t('logs.status.success')}</Tag>
                ) : (
                    <Tooltip content={row.message || ''}>
                        <Tag color="red">{t('logs.status.failed')}</Tag>
                    </Tooltip>
                ),
        },
        {
            title: t('logs.ssh.date'),
            key: 'date',
            width: 180,
            render: (_: unknown, row: SSHHistory) => formatDateTime(row.date || row.dateStr),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Banner type="info" description={t('logs.ssh.alert')} closeIcon={null} />
            <Banner type="info" description={t('logs.ssh.alert2')} closeIcon={null} />

            <Space wrap>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('logs.ssh.searchPlaceholder')}
                    value={searchInput}
                    onChange={setSearchInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Select
                    value={status}
                    placeholder={t('logs.ssh.status')}
                    style={{ width: 140 }}
                    optionList={STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value }))}
                    onChange={(v) => {
                        setStatus(String(v));
                        setPage(1);
                    }}
                />
                <Button type="danger" theme="light" icon={<IconDelete />} loading={cleaning} onClick={onClean}>
                    {t('logs.ssh.clean')}
                </Button>
            </Space>

            <Table
                rowKey={(row) => `${row?.date ?? ''}-${row?.address ?? ''}-${row?.user ?? ''}-${row?.status ?? ''}`}
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                empty={<Text type="tertiary">{t('logs.ssh.empty')}</Text>}
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
