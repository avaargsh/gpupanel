import { useState } from 'react';
import { Button, Input, Modal, Select, SideSheet, Space, Switch, Table, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateFtpMutation,
    useDeleteFtpMutation,
    useGetFtpBaseQuery,
    useOperateFtpMutation,
    useSearchFtpLogQuery,
    useSearchFtpQuery,
    useSyncFtpMutation,
    useUpdateFtpMutation,
    type FtpInfo,
} from '@/api/toolboxApi';
import { formatBytes } from '@/utils/format';
import { useDebouncedValue } from '@/pages/database/shared';
import { Field, errText } from './shared';

const { Text } = Typography;

const randomPassword = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);

function FtpFormModal({ target, onClose, onSaved }: { target: FtpInfo | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [user, setUser] = useState(target?.user ?? '');
    const [password, setPassword] = useState(target?.password || randomPassword());
    const [path, setPath] = useState(target?.path ?? '/');
    const [description, setDescription] = useState(target?.description ?? '');
    const [create, { isLoading: creating }] = useCreateFtpMutation();
    const [update, { isLoading: updating }] = useUpdateFtpMutation();

    const save = async () => {
        if (!isEdit && !user.trim()) {
            Toast.error(t('toolbox.ftp.userRequired'));
            return;
        }
        if (!password) {
            Toast.error(t('toolbox.ftp.noPasswdMsg'));
            return;
        }
        if (!path.trim()) {
            Toast.error(t('toolbox.ftp.pathRequired'));
            return;
        }
        try {
            if (isEdit && target) {
                await update({ id: target.id, password, path, status: target.status, description }).unwrap();
            } else {
                await create({ user, password, path, description }).unwrap();
            }
            Toast.success(t('toolbox.ftp.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={isEdit ? t('toolbox.ftp.edit') : t('toolbox.ftp.add')}
            visible
            confirmLoading={creating || updating}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label={t('toolbox.ftp.user')}>
                    <Input value={user} onChange={setUser} disabled={isEdit} />
                </Field>
                <Field label={t('toolbox.ftp.password')}>
                    <Input mode="password" value={password} onChange={setPassword} />
                </Field>
                <Field label={t('toolbox.ftp.path')} help={t('toolbox.ftp.dirHelper')}>
                    <Input value={path} onChange={setPath} placeholder="/www/wwwroot" />
                </Field>
                <Field label={t('toolbox.ftp.description')}>
                    <TextArea value={description} onChange={setDescription} autosize={{ minRows: 3 }} />
                </Field>
            </div>
        </Modal>
    );
}

function FtpLogSheet({ target, onClose }: { target: FtpInfo; onClose: () => void }) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [operation, setOperation] = useState('');
    const { data, isFetching } = useSearchFtpLogQuery({ user: target.user, operation, page, pageSize });

    const columns = [
        { title: 'IP', dataIndex: 'ip', key: 'ip' },
        {
            title: t('toolbox.ftp.status'),
            dataIndex: 'status',
            key: 'status',
            render: (v: string) => <Tag size="small" color={v === '200' ? 'green' : 'red'}>{v}</Tag>,
        },
        {
            title: t('toolbox.ftp.operationFilter'),
            key: 'operation',
            render: (_: unknown, row: { operation: string }) =>
                (row.operation || '').includes('"PUT') ? t('toolbox.ftp.upload') : t('toolbox.ftp.download'),
        },
        { title: t('toolbox.ftp.fileName'), dataIndex: 'operation', key: 'file', render: (v: string) => v.replace(/"/g, '').replace(/PUT|GET/, '').replace(target.path + '/', '') },
        { title: t('toolbox.ftp.size'), dataIndex: 'size', key: 'size', render: (v: number) => formatBytes(Number(v)) },
        { title: t('toolbox.ftp.time'), dataIndex: 'time', key: 'time' },
    ];

    return (
        <SideSheet title={`FTP - ${target.user}`} visible onCancel={onClose} width={760}>
            <Space style={{ marginBottom: 12 }}>
                <Select
                    value={operation}
                    onChange={(v) => {
                        setOperation(String(v ?? ''));
                        setPage(1);
                    }}
                    style={{ width: 160 }}
                    showClear
                    placeholder={t('toolbox.ftp.operationFilter')}
                    optionList={[
                        { label: t('toolbox.ftp.upload'), value: 'PUT' },
                        { label: t('toolbox.ftp.download'), value: 'GET' },
                    ]}
                />
            </Space>
            <Table
                rowKey="time"
                columns={columns}
                dataSource={data?.items ?? []}
                loading={isFetching}
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
                empty={<Text type="tertiary">{t('toolbox.ftp.logEmpty')}</Text>}
            />
        </SideSheet>
    );
}

export default function FtpTab() {
    const { t } = useTranslation();
    const { data: base, isFetching: baseFetching, refetch: refetchBase } = useGetFtpBaseQuery();
    const [operate] = useOperateFtpMutation();
    const [sync, { isLoading: syncing }] = useSyncFtpMutation();
    const [updateFtp] = useUpdateFtpMutation();
    const [deleteFtp, { isLoading: deleting }] = useDeleteFtpMutation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);
    const [formTarget, setFormTarget] = useState<FtpInfo | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [logTarget, setLogTarget] = useState<FtpInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<FtpInfo[] | null>(null);

    const { data, isFetching, refetch } = useSearchFtpQuery({ page, pageSize, info });

    if (!base) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{baseFetching ? t('common.loading') : t('common.empty')}</Text>
            </div>
        );
    }

    if (!base.isExist) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{t('toolbox.ftp.notInstalled')}</Text>
            </div>
        );
    }

    const onOperate = (operation: string) => {
        Modal.confirm({
            title: t('toolbox.actions.' + operation, operation),
            content: t('toolbox.ftp.operation', { op: t('toolbox.actions.' + operation, operation) }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await operate({ operation }).unwrap();
                    Toast.success(t('toolbox.ftp.saved'));
                    refetchBase();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const onSync = () => {
        Modal.confirm({
            title: t('toolbox.ftp.sync'),
            content: t('toolbox.ftp.syncConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await sync().unwrap();
                    Toast.success(t('toolbox.ftp.synced'));
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const toggleStatus = async (row: FtpInfo) => {
        try {
            await updateFtp({
                id: row.id,
                password: row.password,
                path: row.path,
                status: row.status === 'Enable' ? 'Disable' : 'Enable',
                description: row.description,
            }).unwrap();
            Toast.success(t('toolbox.ftp.statusChanged'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteFtp({ ids: deleteRows.map((r) => r.id) }).unwrap();
            Toast.success(t('toolbox.ftp.deleted'));
            setDeleteRows(null);
            setSelected([]);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('toolbox.ftp.user'), dataIndex: 'user', key: 'user' },
        { title: t('toolbox.ftp.password'), dataIndex: 'password', key: 'password', render: (v: string) => <Text type="tertiary">{v ? '••••••••' : '-'}</Text> },
        {
            title: t('toolbox.ftp.status'),
            key: 'status',
            width: 100,
            render: (_: unknown, row: FtpInfo) => (row.status === 'Deleted' ? <Tag size="small" color="grey">Deleted</Tag> : <Switch size="small" checked={row.status === 'Enable'} onChange={() => toggleStatus(row)} />),
        },
        { title: t('toolbox.ftp.path'), dataIndex: 'path', key: 'path' },
        { title: t('toolbox.ftp.description'), dataIndex: 'description', key: 'description' },
        {
            title: '',
            key: 'op',
            width: 220,
            render: (_: unknown, row: FtpInfo) => (
                <Space>
                    <Button size="small" theme="borderless" onClick={() => { setFormTarget(row); setFormOpen(true); }}>
                        {t('toolbox.actions.edit')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => setLogTarget(row)}>
                        {t('toolbox.actions.log')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRows([row])}>
                        {t('toolbox.actions.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Tag color="green" size="large">
                    FTP
                </Tag>
                <Tag color={base.isActive ? 'green' : 'grey'}>{base.isActive ? t('toolbox.actions.enable') : t('toolbox.actions.disable')}</Tag>
                <Button theme="borderless" type="primary" onClick={() => onOperate(base.isActive ? 'stop' : 'start')}>
                    {base.isActive ? t('toolbox.actions.stop') : t('toolbox.actions.start')}
                </Button>
                <Button theme="borderless" type="primary" onClick={() => onOperate('restart')}>
                    {t('toolbox.actions.restart')}
                </Button>
                <Button icon={<IconRefresh />} theme="borderless" loading={baseFetching} onClick={() => refetchBase()}>
                    {t('toolbox.actions.refresh')}
                </Button>
            </div>

            <Space wrap>
                <Input prefix={<IconSearch />} placeholder={t('toolbox.ftp.searchPlaceholder')} value={searchInput} onChange={(v) => { setSearchInput(v); setPage(1); }} style={{ width: 220 }} showClear />
                <Button icon={<IconPlus />} theme="solid" type="primary" onClick={() => { setFormTarget(null); setFormOpen(true); }}>
                    {t('toolbox.ftp.add')}
                </Button>
                <Button loading={syncing} onClick={onSync}>
                    {t('toolbox.ftp.sync')}
                </Button>
                <Button theme="borderless" type="danger" disabled={selected.length === 0} onClick={() => setDeleteRows((data?.items ?? []).filter((r) => selected.includes(r.id)))}>
                    {t('toolbox.actions.delete')}
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
                empty={<Text type="tertiary">{t('toolbox.ftp.empty')}</Text>}
            />

            {formOpen && (
                <FtpFormModal
                    target={formTarget}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        refetch();
                    }}
                />
            )}
            {logTarget && <FtpLogSheet target={logTarget} onClose={() => setLogTarget(null)} />}

            {deleteRows && (
                <Modal
                    title={t('toolbox.actions.delete')}
                    visible
                    confirmLoading={deleting}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    onOk={doDelete}
                    onCancel={() => setDeleteRows(null)}
                >
                    <Text>{t('toolbox.ftp.deleteConfirm', { name: deleteRows.map((r) => r.user).join('、') })}</Text>
                </Modal>
            )}
        </div>
    );
}
