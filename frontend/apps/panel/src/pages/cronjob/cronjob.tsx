import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Select, Space, Switch, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useDeleteCronjobsMutation,
    useHandleCronjobMutation,
    useListCronjobGroupsQuery,
    useSearchCronjobsQuery,
    useUpdateCronjobStatusMutation,
    type CronjobInfo,
} from '@/api/cronjobApi';
import { useDebouncedValue } from '@/pages/database/shared';
import { specToText } from './helper';
import CronjobOperate from './operate';
import CronjobRecords from './records';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export default function CronjobTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [groupID, setGroupID] = useState<number | undefined>(undefined);
    const [selected, setSelected] = useState<number[]>([]);
    const [sheetTarget, setSheetTarget] = useState<CronjobInfo | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [recordsTarget, setRecordsTarget] = useState<CronjobInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<CronjobInfo[] | null>(null);
    const [cleanData, setCleanData] = useState(false);
    const [cleanRemoteData, setCleanRemoteData] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [info, groupID]);

    const { data: groups = [] } = useListCronjobGroupsQuery('cronjob');
    const { data, isFetching, refetch } = useSearchCronjobsQuery({
        page,
        pageSize,
        info,
        groupIDs: groupID ? [groupID] : [],
        orderBy: 'createdAt',
        order: 'descending',
    });
    const [deleteCronjobs, { isLoading: deleting }] = useDeleteCronjobsMutation();
    const [updateStatus] = useUpdateCronjobStatusMutation();
    const [handle] = useHandleCronjobMutation();

    const groupName = useMemo(() => {
        const map = new Map(groups.map((g) => [g.id, g.name]));
        return (id: number) => {
            const name = map.get(id);
            if (!name) return '-';
            return name === 'Default' ? t('cronjob.operate.default') : name;
        };
    }, [groups, t]);

    if (recordsTarget) {
        return <CronjobRecords target={recordsTarget} onBack={() => setRecordsTarget(null)} />;
    }

    const rows = data?.items ?? [];

    const toggleStatus = async (row: CronjobInfo) => {
        try {
            await updateStatus({ id: row.id, status: row.status === 'Enable' ? 'Disable' : 'Enable' }).unwrap();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onHandle = (row: CronjobInfo) => {
        Modal.confirm({
            title: t('cronjob.actions.handle'),
            content: t('cronjob.handleConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await handle(row.id).unwrap();
                    Toast.success(t('cronjob.saveSuccess'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const batchStatus = async (status: string) => {
        try {
            await Promise.all(selected.map((id) => updateStatus({ id, status }).unwrap()));
            setSelected([]);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteCronjobs({ ids: deleteRows.map((r) => r.id), cleanData, cleanRemoteData }).unwrap();
            Toast.success(t('cronjob.delete.success'));
            setDeleteRows(null);
            setSelected([]);
            setCleanData(false);
            setCleanRemoteData(false);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('cronjob.columns.name'), dataIndex: 'name', key: 'name' },
        { title: t('cronjob.columns.group'), key: 'group', width: 120, render: (_: unknown, row: CronjobInfo) => groupName(row.groupID) },
        {
            title: t('cronjob.columns.status'),
            key: 'status',
            width: 100,
            render: (_: unknown, row: CronjobInfo) => <Switch size="small" checked={row.status === 'Enable'} onChange={() => toggleStatus(row)} />,
        },
        { title: t('cronjob.columns.spec'), key: 'spec', render: (_: unknown, row: CronjobInfo) => <Text size="small">{specToText(t, row.spec)}</Text> },
        { title: t('cronjob.columns.retainCopies'), dataIndex: 'retainCopies', key: 'retainCopies', width: 100 },
        { title: t('cronjob.columns.lastTime'), dataIndex: 'lastRecordTime', key: 'lastRecordTime', width: 170 },
        {
            title: t('cronjob.columns.lastStatus'),
            dataIndex: 'lastRecordStatus',
            key: 'lastRecordStatus',
            width: 100,
            render: (v: string) =>
                v ? (
                    <Tag size="small" color={v === 'Success' ? 'green' : v === 'Failed' ? 'red' : 'blue'}>
                        {t('cronjob.status.' + v, v)}
                    </Tag>
                ) : (
                    <Text type="tertiary">-</Text>
                ),
        },
        {
            title: t('cronjob.columns.operate'),
            key: 'operate',
            width: 280,
            render: (_: unknown, row: CronjobInfo) => (
                <Space>
                    <Button size="small" theme="borderless" onClick={() => onHandle(row)}>
                        {t('cronjob.actions.handle')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => setRecordsTarget(row)}>
                        {t('cronjob.actions.records')}
                    </Button>
                    <Button
                        size="small"
                        theme="borderless"
                        onClick={() => {
                            setSheetTarget(row);
                            setSheetOpen(true);
                        }}
                    >
                        {t('cronjob.actions.edit')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRows([row])}>
                        {t('cronjob.actions.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input prefix={<IconSearch />} placeholder={t('cronjob.searchPlaceholder')} value={searchInput} onChange={setSearchInput} style={{ width: 220 }} showClear />
                <Select
                    value={groupID}
                    onChange={(v) => setGroupID(v ? Number(v) : undefined)}
                    placeholder={t('cronjob.groupFilter')}
                    style={{ width: 160 }}
                    showClear
                    optionList={groups.map((g) => ({ label: g.name === 'Default' ? t('cronjob.operate.default') : g.name, value: g.id }))}
                />
                <Button
                    icon={<IconPlus />}
                    theme="solid"
                    type="primary"
                    onClick={() => {
                        setSheetTarget(null);
                        setSheetOpen(true);
                    }}
                >
                    {t('cronjob.create')}
                </Button>
                <Button icon={<IconRefresh />} loading={isFetching} onClick={() => refetch()}>
                    {t('cronjob.actions.refresh')}
                </Button>
            </Space>

            {selected.length > 0 && (
                <Space style={{ alignItems: 'center' }}>
                    <Text size="small" type="tertiary">
                        {t('cronjob.selected', { count: selected.length })}
                    </Text>
                    <Button size="small" theme="borderless" onClick={() => batchStatus('Enable')}>
                        {t('cronjob.batchEnable')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => batchStatus('Disable')}>
                        {t('cronjob.batchDisable')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRows(rows.filter((r) => selected.includes(r.id)))}>
                        {t('cronjob.batchDelete')}
                    </Button>
                </Space>
            )}

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected((keys ?? []).map(Number)) }}
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
                empty={<Text type="tertiary">{t('cronjob.empty')}</Text>}
            />

            {sheetOpen && <CronjobOperate target={sheetTarget} groups={groups} onClose={() => setSheetOpen(false)} />}

            {deleteRows && (
                <Modal
                    title={t('cronjob.delete.title')}
                    visible
                    confirmLoading={deleting}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    onOk={doDelete}
                    onCancel={() => setDeleteRows(null)}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Text>{t('cronjob.delete.content', { name: deleteRows.map((r) => r.name).join('、') })}</Text>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Switch checked={cleanData} onChange={setCleanData} size="small" />
                            <Text size="small">{t('cronjob.delete.cleanData')}</Text>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Switch checked={cleanRemoteData} onChange={setCleanRemoteData} size="small" />
                            <Text size="small">{t('cronjob.delete.cleanRemoteData')}</Text>
                        </label>
                    </div>
                </Modal>
            )}
        </div>
    );
}
