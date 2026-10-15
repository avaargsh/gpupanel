import { useState } from 'react';
import { Button, Modal, Select, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconArrowLeft, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCleanRecordsMutation,
    useHandleCronjobMutation,
    useLoadRecordLogQuery,
    useSearchRecordsQuery,
    useStopCronjobMutation,
    useUpdateCronjobStatusMutation,
    type CronjobInfo,
    type CronjobRecord,
} from '@/api/cronjobApi';

const { Text, Title } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const statusColor = (status: string) => {
    switch (status) {
        case 'Success':
            return 'green';
        case 'Failed':
            return 'red';
        case 'Running':
            return 'blue';
        case 'Waiting':
            return 'orange';
        default:
            return 'grey';
    }
};

interface Props {
    target: CronjobInfo;
    onBack: () => void;
}

export default function CronjobRecords({ target, onBack }: Props) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState('');
    const [current, setCurrent] = useState<CronjobRecord | null>(null);

    const { data, isFetching, refetch } = useSearchRecordsQuery({ page, pageSize, cronjobID: target.id, status });
    const { data: log, isFetching: logLoading } = useLoadRecordLogQuery(current?.id as number, { skip: !current });
    const [handle] = useHandleCronjobMutation();
    const [stop] = useStopCronjobMutation();
    const [updateStatus] = useUpdateCronjobStatusMutation();
    const [clean] = useCleanRecordsMutation();

    const rows = data?.items ?? [];

    const onHandle = () =>
        Modal.confirm({
            title: t('cronjob.actions.handle'),
            content: t('cronjob.handleConfirm', { name: target.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await handle(target.id).unwrap();
                    Toast.success(t('cronjob.saveSuccess'));
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });

    const onClean = () =>
        Modal.confirm({
            title: t('cronjob.actions.clean'),
            content: t('cronjob.records.cleanConfirm', { name: target.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await clean({ cronjobID: target.id, cleanData: false, cleanRemoteData: false }).unwrap();
                    Toast.success(t('cronjob.records.cleanSuccess'));
                    setCurrent(null);
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });

    const onStop = async (row: CronjobRecord) => {
        try {
            await stop(row.cronjobID ?? target.id).unwrap();
            Toast.success(t('cronjob.saveSuccess'));
            refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('cronjob.records.startTime'), dataIndex: 'startTime', key: 'startTime', width: 170 },
        {
            title: t('cronjob.records.status'),
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (v: string) => (
                <Tag size="small" color={statusColor(v)}>
                    {t('cronjob.status.' + v, v)}
                </Tag>
            ),
        },
        { title: t('cronjob.records.interval'), dataIndex: 'interval', key: 'interval', width: 90, render: (v: number) => `${v ?? 0}s` },
        {
            title: t('cronjob.columns.operate'),
            key: 'operate',
            width: 100,
            render: (_: unknown, row: CronjobRecord) =>
                ['Running', 'Waiting'].includes(row.status) ? (
                    <Button size="small" theme="borderless" onClick={() => onStop(row)}>
                        {t('cronjob.actions.stop')}
                    </Button>
                ) : null,
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap style={{ alignItems: 'center' }}>
                <Button icon={<IconArrowLeft />} theme="borderless" onClick={onBack}>
                    {t('cronjob.actions.back')}
                </Button>
                <Title heading={6} style={{ margin: 0 }}>
                    {target.name}
                </Title>
                <Tag color={target.status === 'Enable' ? 'green' : 'grey'}>{t('cronjob.status.' + target.status, target.status)}</Tag>
                <Button size="small" theme="borderless" onClick={onHandle}>
                    {t('cronjob.actions.handle')}
                </Button>
                <Button size="small" theme="borderless" onClick={() => updateStatus({ id: target.id, status: target.status === 'Enable' ? 'Disable' : 'Enable' })}>
                    {target.status === 'Enable' ? t('cronjob.actions.disable') : t('cronjob.actions.enable')}
                </Button>
                <Button size="small" type="danger" theme="borderless" onClick={onClean}>
                    {t('cronjob.actions.clean')}
                </Button>
            </Space>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 60%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Space>
                        <Select
                            value={status || undefined}
                            onChange={(v) => {
                                setStatus(v ? String(v) : '');
                                setPage(1);
                            }}
                            placeholder={t('cronjob.records.statusFilter')}
                            style={{ width: 160 }}
                            showClear
                            optionList={['Success', 'Failed', 'Running', 'Waiting'].map((s) => ({ label: t('cronjob.status.' + s), value: s }))}
                        />
                        <Button icon={<IconRefresh />} loading={isFetching} onClick={() => refetch()}>
                            {t('cronjob.actions.refresh')}
                        </Button>
                    </Space>
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={rows}
                        loading={isFetching}
                        pagination={{ currentPage: page, pageSize, total: data?.total ?? 0, onPageChange: setPage, onPageSizeChange: setPageSize }}
                        onRow={(row) => ({ onClick: () => setCurrent(row as CronjobRecord) })}
                        empty={<Text type="tertiary">{t('cronjob.records.empty')}</Text>}
                    />
                </div>

                <div style={{ flex: '1 1 40%', minWidth: 0, border: '1px solid var(--semi-color-border)', borderRadius: 6, padding: 12 }}>
                    {!current ? (
                        <Text type="tertiary">{t('cronjob.records.selectHint')}</Text>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Text strong>{t('cronjob.records.detail')}</Text>
                            <Text size="small">{`${t('cronjob.records.startTime')}: ${current.startTime}`}</Text>
                            <Text size="small">{`${t('cronjob.records.status')}: ${t('cronjob.status.' + current.status, current.status)}`}</Text>
                            <Text size="small">{`${t('cronjob.records.interval')}: ${current.interval ?? 0}s`}</Text>
                            {current.targetPath && <Text size="small">{`${t('cronjob.records.targetPath')}: ${current.targetPath}`}</Text>}
                            <Text size="small">{`${t('cronjob.records.message')}: ${current.message || '-'}`}</Text>
                            <Text strong>{t('cronjob.records.log')}</Text>
                            {logLoading ? (
                                <Text type="tertiary">{t('common.loading')}</Text>
                            ) : (
                                <pre
                                    style={{
                                        margin: 0,
                                        maxHeight: 360,
                                        overflow: 'auto',
                                        background: 'var(--semi-color-fill-0)',
                                        padding: 8,
                                        borderRadius: 4,
                                        fontSize: 12,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {log || t('cronjob.records.logEmpty')}
                                </pre>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
