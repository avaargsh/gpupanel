import { useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateSnapshotMutation,
    useDeleteSnapshotsMutation,
    useListBackupOptionsQuery,
    useLoadSnapshotDataQuery,
    useRecoverSnapshotMutation,
    useRollbackSnapshotMutation,
    useSearchSnapshotsQuery,
    useUpdateSnapshotDescriptionMutation,
    type SnapshotInfo,
} from '@/api/settingsApi';
import { formatBytes } from '@/utils/format';
import { useDebouncedValue } from '@/pages/database/shared';
import { Field, errText } from './shared';

const { Text } = Typography;

const statusColor = (status: string): 'green' | 'red' | 'blue' | 'grey' => {
    const s = (status || '').toLowerCase();
    if (s.includes('success') || s.includes('done')) return 'green';
    if (s.includes('fail') || s.includes('error')) return 'red';
    if (s.includes('running') || s.includes('doing')) return 'blue';
    return 'grey';
};

interface CreateForm {
    description: string;
    sourceAccountIDs: number[];
    downloadAccountID: number | null;
    secret: string;
    timeout: number;
    withDockerConf: boolean;
    withMonitorData: boolean;
    withLoginLog: boolean;
    withOperationLog: boolean;
    withSystemLog: boolean;
    withTaskLog: boolean;
}

function SnapshotCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data: options } = useListBackupOptionsQuery();
    const { data: snapshotData } = useLoadSnapshotDataQuery();
    const [create, { isLoading }] = useCreateSnapshotMutation();

    const [form, setForm] = useState<CreateForm>({
        description: '',
        sourceAccountIDs: [],
        downloadAccountID: null,
        secret: '',
        timeout: 3600,
        withDockerConf: snapshotData?.withDockerConf ?? true,
        withMonitorData: snapshotData?.withMonitorData ?? false,
        withLoginLog: snapshotData?.withLoginLog ?? false,
        withOperationLog: snapshotData?.withOperationLog ?? false,
        withSystemLog: snapshotData?.withSystemLog ?? false,
        withTaskLog: snapshotData?.withTaskLog ?? false,
    });

    const accounts = options ?? [];
    const sourceOptions = accounts.filter((a) => a.type !== 'LOCAL');
    const downloadOptions = accounts.filter((a) => a.type === 'LOCAL' || form.sourceAccountIDs.includes(a.id));

    const save = async () => {
        if (form.sourceAccountIDs.length === 0) {
            Toast.error(t('settings.snapshot.sourceRequired'));
            return;
        }
        if (!form.downloadAccountID) {
            Toast.error(t('settings.snapshot.downloadRequired'));
            return;
        }
        try {
            await create({
                sourceAccountIDs: form.sourceAccountIDs.join(','),
                downloadAccountID: form.downloadAccountID,
                description: form.description,
                secret: form.secret,
                timeout: form.timeout,
                appData: snapshotData?.appData ?? [],
                panelData: snapshotData?.panelData ?? [],
                backupData: snapshotData?.backupData ?? [],
                withDockerConf: form.withDockerConf,
                withMonitorData: form.withMonitorData,
                withLoginLog: form.withLoginLog,
                withOperationLog: form.withOperationLog,
                withSystemLog: form.withSystemLog,
                withTaskLog: form.withTaskLog,
            }).unwrap();
            Toast.success(t('settings.snapshot.created'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('settings.snapshot.create')}
            visible
            confirmLoading={isLoading}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
            width={560}
        >
            <Field label={t('settings.snapshot.description')}>
                <Input value={form.description} onChange={(v) => setForm((f) => ({ ...f, description: v }))} maxLength={256} showClear />
            </Field>
            <Field label={t('settings.snapshot.source')} help={t('settings.snapshot.sourceHelper')}>
                <Select
                    multiple
                    value={form.sourceAccountIDs}
                    style={{ width: '100%' }}
                    optionList={sourceOptions.map((a) => ({ value: a.id, label: a.name }))}
                    onChange={(v) =>
                        setForm((f) => {
                            const ids = (v as number[]) ?? [];
                            const download = f.downloadAccountID && downloadOptions.some((a) => a.id === f.downloadAccountID) ? f.downloadAccountID : (ids[0] ?? null);
                            return { ...f, sourceAccountIDs: ids, downloadAccountID: download };
                        })
                    }
                />
            </Field>
            <Field label={t('settings.snapshot.download')} help={t('settings.snapshot.downloadHelper')}>
                <Select
                    value={form.downloadAccountID ?? undefined}
                    style={{ width: '100%' }}
                    optionList={downloadOptions.map((a) => ({ value: a.id, label: a.name }))}
                    onChange={(v) => setForm((f) => ({ ...f, downloadAccountID: Number(v) }))}
                />
            </Field>
            <Field label={t('settings.snapshot.secret')} help={t('settings.snapshot.secretHelper')}>
                <Input mode="password" value={form.secret} onChange={(v) => setForm((f) => ({ ...f, secret: v }))} />
            </Field>
            <Field label={t('settings.snapshot.timeout')}>
                <InputNumber value={form.timeout} min={60} step={60} onChange={(v) => setForm((f) => ({ ...f, timeout: Number(v ?? 3600) }))} />
            </Field>
            <Field label={t('settings.snapshot.data')}>
                <Space vertical align="start" style={{ gap: 8 }}>
                    <Checkbox checked={form.withDockerConf} onChange={(e) => setForm((f) => ({ ...f, withDockerConf: !!e.target.checked }))}>
                        {t('settings.snapshot.withDockerConf')}
                    </Checkbox>
                    <Checkbox checked={form.withMonitorData} onChange={(e) => setForm((f) => ({ ...f, withMonitorData: !!e.target.checked }))}>
                        {t('settings.snapshot.withMonitorData')}
                    </Checkbox>
                    <Checkbox checked={form.withLoginLog} onChange={(e) => setForm((f) => ({ ...f, withLoginLog: !!e.target.checked }))}>
                        {t('settings.snapshot.withLoginLog')}
                    </Checkbox>
                    <Checkbox checked={form.withOperationLog} onChange={(e) => setForm((f) => ({ ...f, withOperationLog: !!e.target.checked }))}>
                        {t('settings.snapshot.withOperationLog')}
                    </Checkbox>
                </Space>
            </Field>
        </Modal>
    );
}

export default function SnapshotSettingsTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);

    const { data, isFetching, refetch } = useSearchSnapshotsQuery({ page, pageSize, info });
    const [deleteSnapshots, { isLoading: deleting }] = useDeleteSnapshotsMutation();
    const [updateDesc] = useUpdateSnapshotDescriptionMutation();
    const [recoverSnapshot, { isLoading: recovering }] = useRecoverSnapshotMutation();
    const [rollbackSnapshot] = useRollbackSnapshotMutation();

    const [createOpen, setCreateOpen] = useState(false);
    const [descTarget, setDescTarget] = useState<SnapshotInfo | null>(null);
    const [descDraft, setDescDraft] = useState('');
    const [recoverTarget, setRecoverTarget] = useState<SnapshotInfo | null>(null);
    const [recoverSecret, setRecoverSecret] = useState('');
    const [reDownload, setReDownload] = useState(false);
    const [deleteRows, setDeleteRows] = useState<SnapshotInfo[] | null>(null);
    const [deleteWithFile, setDeleteWithFile] = useState(false);

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteSnapshots({ ids: deleteRows.map((r) => r.id), deleteWithFile }).unwrap();
            Toast.success(t('settings.snapshot.deleted'));
            setDeleteRows(null);
            setSelected([]);
            setDeleteWithFile(false);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const submitDesc = async () => {
        if (!descTarget) return;
        try {
            await updateDesc({ id: descTarget.id, description: descDraft }).unwrap();
            Toast.success(t('settings.snapshot.saved'));
            setDescTarget(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const submitRecover = async () => {
        if (!recoverTarget) return;
        try {
            await recoverSnapshot({
                id: recoverTarget.id,
                taskID: recoverTarget.taskID,
                isNew: false,
                reDownload,
                secret: recoverSecret,
            }).unwrap();
            Toast.success(t('settings.snapshot.recoverStarted'));
            setRecoverTarget(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onRollback = (row: SnapshotInfo) => {
        Modal.confirm({
            title: t('settings.snapshot.rollback'),
            content: t('settings.snapshot.rollbackConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await rollbackSnapshot({ id: row.id, taskID: row.taskRollbackID, isNew: false, reDownload: false, secret: '' }).unwrap();
                    Toast.success(t('settings.snapshot.rollbackStarted'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('settings.snapshot.name'), dataIndex: 'name', key: 'name' },
        { title: t('settings.snapshot.version'), dataIndex: 'version', key: 'version', width: 100 },
        {
            title: t('settings.snapshot.source'),
            key: 'source',
            render: (_: unknown, row: SnapshotInfo) => (row.sourceAccounts ?? []).join('、') || '-',
        },
        {
            title: t('settings.snapshot.size'),
            dataIndex: 'size',
            key: 'size',
            width: 110,
            render: (v: number) => formatBytes(Number(v)),
        },
        {
            title: t('settings.snapshot.status'),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (v: string) => (
                <Tag size="small" color={statusColor(v)}>
                    {v || '-'}
                </Tag>
            ),
        },
        {
            title: t('settings.snapshot.description'),
            dataIndex: 'description',
            key: 'description',
            render: (v: string) => <Text type="tertiary">{v || '-'}</Text>,
        },
        { title: t('settings.snapshot.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 180 },
        {
            title: '',
            key: 'op',
            width: 240,
            render: (_: unknown, row: SnapshotInfo) => (
                <Space>
                    <Button
                        size="small"
                        theme="borderless"
                        onClick={() => {
                            setDescDraft(row.description ?? '');
                            setDescTarget(row);
                        }}
                    >
                        {t('settings.snapshot.editDesc')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => { setRecoverSecret(''); setReDownload(false); setRecoverTarget(row); }}>
                        {t('settings.snapshot.recover')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => onRollback(row)}>
                        {t('settings.snapshot.rollback')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRows([row])}>
                        {t('common.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('settings.snapshot.searchPlaceholder')}
                    value={searchInput}
                    onChange={(v) => {
                        setSearchInput(v);
                        setPage(1);
                    }}
                    style={{ width: 220 }}
                    showClear
                />
                <Button icon={<IconPlus />} theme="solid" type="primary" onClick={() => setCreateOpen(true)}>
                    {t('settings.snapshot.create')}
                </Button>
                <Button icon={<IconRefresh />} onClick={() => refetch()}>
                    {t('common.refresh')}
                </Button>
                <Button
                    theme="borderless"
                    type="danger"
                    disabled={selected.length === 0}
                    onClick={() => setDeleteRows((data?.items ?? []).filter((r) => selected.includes(r.id)))}
                >
                    {t('common.delete')}
                </Button>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={data?.items ?? []}
                loading={isFetching}
                rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected((keys ?? []).map(Number)) }}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (s: number) => {
                        setPageSize(s);
                        setPage(1);
                    },
                }}
                empty={<Text type="tertiary">{t('settings.snapshot.empty')}</Text>}
            />

            {createOpen && (
                <SnapshotCreateModal
                    onClose={() => setCreateOpen(false)}
                    onSaved={() => {
                        setCreateOpen(false);
                        refetch();
                    }}
                />
            )}

            <Modal
                title={t('settings.snapshot.editDesc')}
                visible={descTarget !== null}
                onOk={submitDesc}
                onCancel={() => setDescTarget(null)}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
            >
                <Field label={t('settings.snapshot.description')}>
                    <TextArea value={descDraft} onChange={setDescDraft} autosize={{ minRows: 3 }} maxCount={256} />
                </Field>
            </Modal>

            <Modal
                title={t('settings.snapshot.recover')}
                visible={recoverTarget !== null}
                confirmLoading={recovering}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                onOk={submitRecover}
                onCancel={() => setRecoverTarget(null)}
            >
                <Text>{t('settings.snapshot.recoverHelper', { name: recoverTarget?.name ?? '' })}</Text>
                <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Switch size="small" checked={reDownload} onChange={setReDownload} />
                        {t('settings.snapshot.reDownload')}
                    </label>
                </div>
                <Field label={t('settings.snapshot.secret')} help={t('settings.snapshot.secretHelper')}>
                    <Input mode="password" value={recoverSecret} onChange={setRecoverSecret} />
                </Field>
            </Modal>

            {deleteRows && (
                <Modal
                    title={t('common.delete')}
                    visible
                    confirmLoading={deleting}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    onOk={doDelete}
                    onCancel={() => setDeleteRows(null)}
                >
                    <Text>{t('settings.snapshot.deleteConfirm', { name: deleteRows.map((r) => r.name).join('、') })}</Text>
                    <div style={{ marginTop: 12 }}>
                        <Checkbox checked={deleteWithFile} onChange={(e) => setDeleteWithFile(!!e.target.checked)}>
                            {t('settings.snapshot.deleteWithFile')}
                        </Checkbox>
                    </div>
                </Modal>
            )}
        </div>
    );
}
