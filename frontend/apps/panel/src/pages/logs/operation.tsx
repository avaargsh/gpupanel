import { useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/store/hooks';
import { useDebouncedValue } from '@/pages/database/shared';
import { useCleanLogsMutation, useSearchOperationLogsQuery, type OperationLog } from '@/api/logsApi';
import { LOG_SOURCES, formatDateTime, localizeOperationDetail, sourceLabel } from './shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const STATUS_OPTIONS = [
    { labelKey: 'logs.status.all', value: '' },
    { labelKey: 'logs.status.success', value: 'Success' },
    { labelKey: 'logs.status.failed', value: 'Failed' },
];

export default function OperationLogTab() {
    const { t } = useTranslation();
    const language = useAppSelector((s) => s.ui.language);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const operation = useDebouncedValue(searchInput);
    const [status, setStatus] = useState('');
    const [source, setSource] = useState('');

    const { data, isFetching } = useSearchOperationLogsQuery({ page, pageSize, operation, status, source });
    const [cleanLogs, { isLoading: cleaning }] = useCleanLogsMutation();

    const rows = data?.items ?? [];

    const sourceOptions = useMemo(
        () => [
            { label: t('logs.status.all'), value: '' },
            ...LOG_SOURCES.map((item) => ({ label: t(`logs.source.${item.key}`), value: item.value })),
        ],
        [t],
    );

    const onClean = () => {
        Modal.confirm({
            title: t('logs.operation.clean'),
            content: t('logs.operation.cleanConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await cleanLogs({ logType: 'operation' }).unwrap();
                    Toast.success(t('logs.operation.cleaned'));
                    setPage(1);
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        {
            title: t('logs.operation.resource'),
            key: 'source',
            width: 140,
            render: (_: unknown, row: OperationLog) => sourceLabel(t, row.source),
        },
        {
            title: t('logs.operation.user'),
            key: 'user',
            width: 180,
            render: (_: unknown, row: OperationLog) => (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span>{row.user || '-'}</span>
                    {row.authMethod === 'api_key' && row.apiKeyID ? (
                        <Text type="tertiary" size="small">
                            API Key · {row.apiKeyName || row.apiKeyID}
                        </Text>
                    ) : null}
                </div>
            ),
        },
        {
            title: t('logs.operation.detail'),
            key: 'detail',
            render: (_: unknown, row: OperationLog) => {
                const raw = language === 'en' ? row.detailEN : row.detailZH;
                return localizeOperationDetail(t, raw || '') || row.message || '-';
            },
        },
        {
            title: t('logs.operation.status'),
            key: 'status',
            width: 100,
            render: (_: unknown, row: OperationLog) => (
                <Tag color={row.status === 'Success' ? 'green' : 'red'}>
                    {row.status === 'Success' ? t('logs.status.success') : t('logs.status.failed')}
                </Tag>
            ),
        },
        {
            title: t('logs.operation.date'),
            key: 'createdAt',
            width: 180,
            render: (_: unknown, row: OperationLog) => formatDateTime(row.createdAt),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('logs.operation.searchPlaceholder')}
                    value={searchInput}
                    onChange={setSearchInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Select
                    value={source}
                    placeholder={t('logs.operation.resource')}
                    style={{ width: 180 }}
                    optionList={sourceOptions}
                    onChange={(v) => {
                        setSource(String(v));
                        setPage(1);
                    }}
                />
                <Select
                    value={status}
                    placeholder={t('logs.operation.status')}
                    style={{ width: 140 }}
                    optionList={STATUS_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value }))}
                    onChange={(v) => {
                        setStatus(String(v));
                        setPage(1);
                    }}
                />
                <Button type="danger" theme="light" icon={<IconDelete />} loading={cleaning} onClick={onClean}>
                    {t('logs.operation.clean')}
                </Button>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                empty={<Text type="tertiary">{t('logs.operation.empty')}</Text>}
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
