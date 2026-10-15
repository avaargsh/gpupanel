import { useState } from 'react';
import { Button, Card, Input, Modal, Select, Space, Table, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCheckBackupConnMutation,
    useCreateBackupMutation,
    useDeleteBackupMutation,
    useRefreshBackupTokenMutation,
    useSearchBackupsQuery,
    useUpdateBackupMutation,
    type BackupInfo,
    type BackupOperate,
} from '@/api/settingsApi';
import { useDebouncedValue } from '@/pages/database/shared';
import { Field, errText } from './shared';

const { Text } = Typography;

const BACKUP_TYPES = ['LOCAL', 'S3', 'MINIO', 'OSS', 'COS', 'KODO', 'WebDAV', 'SFTP'];

function BackupFormModal({
    target,
    onClose,
    onSaved,
}: {
    target: BackupInfo | null;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [form, setForm] = useState<BackupOperate>({
        id: target?.id,
        name: target?.name ?? '',
        type: target?.type ?? 'S3',
        isPublic: target?.isPublic ?? false,
        bucket: target?.bucket ?? '',
        accessKey: target?.accessKey ?? '',
        credential: target?.credential ?? '',
        backupPath: target?.backupPath ?? '',
        vars: target?.vars || '{}',
        rememberAuth: target?.rememberAuth ?? false,
    });
    const [create, { isLoading: creating }] = useCreateBackupMutation();
    const [update, { isLoading: updating }] = useUpdateBackupMutation();
    const [check, { isLoading: checking }] = useCheckBackupConnMutation();

    const onCheck = async () => {
        try {
            const res = await check({ ...form }).unwrap();
            if (res.isOk) Toast.success(t('settings.backup.checkOk'));
            else Toast.error(res.msg || t('settings.backup.checkFailed'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const save = async () => {
        if (!form.name.trim()) {
            Toast.error(t('settings.backup.nameRequired'));
            return;
        }
        try {
            const body: BackupOperate = { ...form, vars: form.vars?.trim() ? form.vars : '{}' };
            if (isEdit) await update(body).unwrap();
            else await create(body).unwrap();
            Toast.success(t('settings.backup.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={isEdit ? t('settings.backup.edit') : t('settings.backup.add')}
            visible
            confirmLoading={creating || updating}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
            width={560}
        >
            <Field label={t('settings.backup.name')}>
                <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} showClear />
            </Field>
            <Field label={t('settings.backup.type')}>
                <Select
                    value={form.type}
                    style={{ width: '100%' }}
                    disabled={isEdit}
                    optionList={BACKUP_TYPES.map((v) => ({ value: v, label: v }))}
                    onChange={(v) => setForm((f) => ({ ...f, type: String(v) }))}
                />
            </Field>
            {form.type === 'LOCAL' ? (
                <Field label={t('settings.backup.backupPath')} help={t('settings.backup.backupPathHelper')}>
                    <Input value={form.backupPath} onChange={(v) => setForm((f) => ({ ...f, backupPath: v }))} placeholder="/opt/gpupanel/backup" showClear />
                </Field>
            ) : (
                <>
                    <Field label={t('settings.backup.bucket')}>
                        <Input value={form.bucket} onChange={(v) => setForm((f) => ({ ...f, bucket: v }))} showClear />
                    </Field>
                    <Field label={t('settings.backup.accessKey')}>
                        <Input value={form.accessKey} onChange={(v) => setForm((f) => ({ ...f, accessKey: v }))} showClear />
                    </Field>
                    <Field label={t('settings.backup.credential')}>
                        <Input mode="password" value={form.credential} onChange={(v) => setForm((f) => ({ ...f, credential: v }))} />
                    </Field>
                    <Field label={t('settings.backup.vars')} help={t('settings.backup.varsHelper')}>
                        <TextArea value={form.vars} onChange={(v) => setForm((f) => ({ ...f, vars: v }))} autosize={{ minRows: 3 }} />
                    </Field>
                </>
            )}
            <Button loading={checking} onClick={onCheck}>
                {t('settings.backup.checkConnection')}
            </Button>
        </Modal>
    );
}

export default function BackupAccountSettingsTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);

    const { data, isFetching, refetch } = useSearchBackupsQuery({ page, pageSize, info });
    const [deleteBackup, { isLoading: deleting }] = useDeleteBackupMutation();
    const [refreshToken] = useRefreshBackupTokenMutation();

    const [formOpen, setFormOpen] = useState(false);
    const [formTarget, setFormTarget] = useState<BackupInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<BackupInfo[] | null>(null);

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            for (const row of deleteRows) {
                await deleteBackup({ id: row.id }).unwrap();
            }
            Toast.success(t('settings.backup.deleted'));
            setDeleteRows(null);
            setSelected([]);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onRefreshToken = async (row: BackupInfo) => {
        try {
            await refreshToken({ id: row.id }).unwrap();
            Toast.success(t('settings.backup.tokenRefreshed'));
            refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('settings.backup.name'), dataIndex: 'name', key: 'name' },
        {
            title: t('settings.backup.type'),
            dataIndex: 'type',
            key: 'type',
            width: 120,
            render: (v: string) => <Tag size="small">{v}</Tag>,
        },
        { title: t('settings.backup.bucket'), dataIndex: 'bucket', key: 'bucket', render: (v: string) => v || '-' },
        { title: t('settings.backup.backupPath'), dataIndex: 'backupPath', key: 'backupPath', render: (v: string) => v || '-' },
        { title: t('settings.backup.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 180 },
        {
            title: '',
            key: 'op',
            width: 240,
            render: (_: unknown, row: BackupInfo) => (
                <Space>
                    <Button size="small" theme="borderless" onClick={() => { setFormTarget(row); setFormOpen(true); }}>
                        {t('settings.backup.edit')}
                    </Button>
                    {row.isPublic ? (
                        <Button size="small" theme="borderless" onClick={() => onRefreshToken(row)}>
                            {t('settings.backup.refreshToken')}
                        </Button>
                    ) : null}
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRows([row])}>
                        {t('common.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title={t('settings.backup.title')} bodyStyle={{ padding: 12 }}>
                <Space wrap style={{ marginBottom: 12 }}>
                    <Input
                        prefix={<IconSearch />}
                        placeholder={t('settings.backup.searchPlaceholder')}
                        value={searchInput}
                        onChange={(v) => {
                            setSearchInput(v);
                            setPage(1);
                        }}
                        style={{ width: 220 }}
                        showClear
                    />
                    <Button icon={<IconPlus />} theme="solid" type="primary" onClick={() => { setFormTarget(null); setFormOpen(true); }}>
                        {t('settings.backup.add')}
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
                    empty={<Text type="tertiary">{t('settings.backup.empty')}</Text>}
                />
            </Card>

            {formOpen && (
                <BackupFormModal
                    target={formTarget}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        refetch();
                    }}
                />
            )}

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
                    <Text>{t('settings.backup.deleteConfirm', { name: deleteRows.map((r) => r.name).join('、') })}</Text>
                </Modal>
            )}
        </div>
    );
}
