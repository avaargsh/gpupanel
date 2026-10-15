import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    Button,
    Card,
    Checkbox,
    Descriptions,
    Divider,
    Empty,
    Input,
    Modal,
    Select,
    SideSheet,
    Space,
    Table,
    Tag,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useAddMysqlMutation,
    useChangeMysqlPasswordMutation,
    useChangeMysqlUserPasswordMutation,
    useCreateMysqlUserMutation,
    useDeleteCheckMysqlMutation,
    useDeleteMysqlMutation,
    useDeleteMysqlUserMutation,
    useLoadDBBaseInfoQuery,
    useLoadMysqlFormatOptionsQuery,
    useMysqlGrantSummaryQuery,
    useSearchMysqlQuery,
    useSearchMysqlUsersQuery,
    useUpdateMysqlDescriptionMutation,
    type DatabaseOption,
    type FormatCollationOption,
    type MysqlDBInfo,
    type MysqlUser,
} from '@/api/databaseApi';
import InstanceSelect from './InstanceSelect';
import { DescriptionCell, useDebouncedValue } from './shared';

const { Text } = Typography;

/** 后端不可用时的兜底字符集选项 */
const FALLBACK_FORMATS: FormatCollationOption[] = [
    { format: 'utf8mb4', collations: [] },
    { format: 'utf8mb3', collations: [] },
    { format: 'gbk', collations: [] },
    { format: 'big5', collations: [] },
];

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Text size="small" type="tertiary">
                {label}
            </Text>
            {children}
        </div>
    );
}

/** 主机授权模式选择：所有主机（%）或指定 IP 列表 */
function HostModeField({ mode, hosts, onMode, onHosts }: { mode: '%' | 'ip'; hosts: string; onMode: (m: '%' | 'ip') => void; onHosts: (v: string) => void }) {
    const { t } = useTranslation();
    return (
        <>
            <Field label={t('database.mysql.host.label')}>
                <Select
                    value={mode}
                    onChange={(v) => onMode(v as '%' | 'ip')}
                    optionList={[
                        { label: t('database.mysql.host.all'), value: '%' },
                        { label: t('database.mysql.host.specific'), value: 'ip' },
                    ]}
                    style={{ width: '100%' }}
                />
            </Field>
            {mode === 'ip' && (
                <Field label={t('database.mysql.host.placeholder')}>
                    <Input value={hosts} onChange={onHosts} placeholder="192.168.1.1,10.0.0.%" />
                </Field>
            )}
        </>
    );
}

function MysqlCreateModal({ visible, database, from, onClose, onCreated }: { visible: boolean; database: string; from: string; onClose: () => void; onCreated: () => void }) {
    const { t } = useTranslation();
    const [addMysql, { isLoading }] = useAddMysqlMutation();
    const formatQuery = useLoadMysqlFormatOptionsQuery({ database }, { skip: !visible || !database });
    const formatOptions = formatQuery.data && formatQuery.data.length ? formatQuery.data : FALLBACK_FORMATS;

    const [name, setName] = useState('');
    const [format, setFormat] = useState('utf8mb4');
    const [collation, setCollation] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [hostMode, setHostMode] = useState<'%' | 'ip'>('%');
    const [hosts, setHosts] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (visible) {
            setName('');
            setFormat('utf8mb4');
            setCollation('');
            setUsername('');
            setPassword('');
            setHostMode('%');
            setHosts('');
            setDescription('');
        }
    }, [visible]);

    const collations = formatOptions.find((f) => f.format === format)?.collations ?? [];

    const submit = async () => {
        if (!name.trim()) return Toast.error(t('database.mysql.create.nameRequired'));
        if (!password) return Toast.error(t('database.mysql.create.passwordRequired'));
        const permission = hostMode === '%' ? '%' : hosts.trim();
        if (!permission) return Toast.error(t('database.mysql.host.required'));
        try {
            await addMysql({
                name: name.trim(),
                from: from || 'local',
                database,
                format,
                collation,
                username: username.trim() || name.trim(),
                password,
                permission,
                description: description.trim(),
            }).unwrap();
            Toast.success(t('database.mysql.create.success'));
            onCreated();
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('database.mysql.create.title')}
            visible={visible}
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={480}
            maskClosable={false}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label={t('database.mysql.create.name')}>
                    <Input value={name} onChange={setName} placeholder={t('database.mysql.create.namePlaceholder')} />
                </Field>
                <Field label={t('database.mysql.create.format')}>
                    <Select
                        value={format}
                        onChange={(v) => {
                            setFormat(v as string);
                            setCollation('');
                        }}
                        optionList={formatOptions.map((f) => ({ label: f.format, value: f.format }))}
                        style={{ width: '100%' }}
                    />
                </Field>
                <Field label={t('database.mysql.create.collation')}>
                    <Select
                        value={collation || undefined}
                        onChange={(v) => setCollation(v as string)}
                        optionList={collations.map((c) => ({ label: c, value: c }))}
                        placeholder={t('database.mysql.create.collationPlaceholder')}
                        showClear
                        style={{ width: '100%' }}
                    />
                </Field>
                <Field label={t('database.mysql.create.username')}>
                    <Input value={username} onChange={setUsername} placeholder={name || t('database.mysql.create.usernamePlaceholder')} />
                </Field>
                <Field label={t('database.mysql.create.password')}>
                    <Input mode="password" value={password} onChange={setPassword} />
                </Field>
                <HostModeField mode={hostMode} hosts={hosts} onMode={setHostMode} onHosts={setHosts} />
                <Field label={t('database.common.description')}>
                    <Input value={description} onChange={setDescription} />
                </Field>
            </div>
        </Modal>
    );
}

function MysqlDeleteModal({ target, database, type, onClose }: { target: MysqlDBInfo; database: string; type: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [check] = useDeleteCheckMysqlMutation();
    const [del, { isLoading: deleting }] = useDeleteMysqlMutation();
    const [resources, setResources] = useState<string[]>([]);
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);

    useEffect(() => {
        let active = true;
        check({ id: target.id, type, database })
            .unwrap()
            .then((res) => active && setResources(res ?? []))
            .catch(() => {
                if (active) setResources([]);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target.id]);

    const submit = async () => {
        try {
            await del({ id: target.id, type, database, forceDelete, deleteBackup }).unwrap();
            Toast.success(t('database.mysql.delete.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('database.mysql.delete.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={deleting}
            okButtonProps={{ type: 'danger' }}
            width={460}
        >
            <Text>{t('database.mysql.delete.content', { name: target.name })}</Text>
            {resources.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Text type="warning" size="small">
                        {t('database.mysql.delete.resourceHint')}
                    </Text>
                    <Space spacing={4} wrap>
                        {resources.map((r) => (
                            <Tag key={r} color="orange">
                                {r}
                            </Tag>
                        ))}
                    </Space>
                    <Checkbox checked={forceDelete} onChange={(e) => setForceDelete(!!e.target.checked)}>
                        {t('database.mysql.delete.force')}
                    </Checkbox>
                    <Checkbox checked={deleteBackup} onChange={(e) => setDeleteBackup(!!e.target.checked)}>
                        {t('database.mysql.delete.deleteBackup')}
                    </Checkbox>
                </div>
            )}
        </Modal>
    );
}

function MysqlUsersDrawer({ visible, database, onClose }: { visible: boolean; database: string; onClose: () => void }) {
    const { t } = useTranslation();
    const usersQuery = useSearchMysqlUsersQuery({ database }, { skip: !visible || !database });
    const users = usersQuery.data ?? [];

    const [createUser, { isLoading: creating }] = useCreateMysqlUserMutation();
    const [deleteUser] = useDeleteMysqlUserMutation();
    const [changePassword, { isLoading: changing }] = useChangeMysqlUserPasswordMutation();

    const [addOpen, setAddOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [hostMode, setHostMode] = useState<'%' | 'ip'>('%');
    const [hosts, setHosts] = useState('');
    const [pwdUser, setPwdUser] = useState<MysqlUser | null>(null);
    const [pwdValue, setPwdValue] = useState('');

    const openAdd = () => {
        setNewName('');
        setNewPassword('');
        setHostMode('%');
        setHosts('');
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!newName.trim()) return Toast.error(t('database.mysql.users.nameRequired'));
        if (!newPassword) return Toast.error(t('database.mysql.create.passwordRequired'));
        const host = hostMode === '%' ? '%' : hosts.trim();
        if (!host) return Toast.error(t('database.mysql.host.required'));
        try {
            await createUser({ database, username: newName.trim(), password: newPassword, host, description: '' }).unwrap();
            Toast.success(t('database.mysql.users.addSuccess'));
            setAddOpen(false);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const submitPassword = async () => {
        if (!pwdUser || !pwdValue) return;
        try {
            await changePassword({ database, username: pwdUser.username, host: pwdUser.host, password: pwdValue }).unwrap();
            Toast.success(t('database.mysql.users.passwordSuccess'));
            setPwdUser(null);
            setPwdValue('');
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const confirmDelete = (user: MysqlUser) => {
        Modal.confirm({
            title: t('database.mysql.users.deleteTitle'),
            content: t('database.mysql.users.deleteContent', { name: `${user.username}@${user.host}` }),
            okButtonProps: { type: 'danger' },
            onOk: async () => {
                try {
                    await deleteUser({ database, username: user.username, host: user.host }).unwrap();
                    Toast.success(t('database.mysql.users.deleteSuccess'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    return (
        <SideSheet title={t('database.mysql.users.title')} visible={visible} onCancel={onClose} width={560}>
            <Space style={{ marginBottom: 12 }}>
                <Button icon={<IconRefresh />} onClick={() => usersQuery.refetch()}>
                    {t('home.refresh')}
                </Button>
                <Button type="primary" icon={<IconPlus />} onClick={openAdd}>
                    {t('database.mysql.users.add')}
                </Button>
            </Space>
            <Table
                rowKey={(u) => (u ? `${u.username}@${u.host}` : '')}
                dataSource={users}
                pagination={false}
                loading={usersQuery.isLoading}
                columns={[
                    { title: t('database.mysql.users.username'), dataIndex: 'username', key: 'username' },
                    { title: t('database.mysql.users.host'), dataIndex: 'host', key: 'host' },
                    {
                        title: t('database.mysql.users.auth'),
                        key: 'auth',
                        render: (_: unknown, u: MysqlUser) => (u.host === '%' ? <Tag color="green">{t('database.mysql.users.allHosts')}</Tag> : <Tag>{u.host}</Tag>),
                    },
                    {
                        title: t('database.common.actions'),
                        key: 'actions',
                        width: 190,
                        render: (_: unknown, u: MysqlUser) => (
                            <Space>
                                <Button size="small" theme="borderless" onClick={() => setPwdUser(u)}>
                                    {t('database.mysql.users.changePassword')}
                                </Button>
                                <Button size="small" type="danger" theme="borderless" onClick={() => confirmDelete(u)}>
                                    {t('database.common.delete')}
                                </Button>
                            </Space>
                        ),
                    },
                ]}
                empty={<Empty title={t('database.common.empty')} />}
            />

            <Modal title={t('database.mysql.users.add')} visible={addOpen} onCancel={() => setAddOpen(false)} onOk={submitAdd} confirmLoading={creating} okText={t('common.confirm')} cancelText={t('common.cancel')} width={440}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Field label={t('database.mysql.users.username')}>
                        <Input value={newName} onChange={setNewName} />
                    </Field>
                    <Field label={t('database.mysql.create.password')}>
                        <Input mode="password" value={newPassword} onChange={setNewPassword} />
                    </Field>
                    <HostModeField mode={hostMode} hosts={hosts} onMode={setHostMode} onHosts={setHosts} />
                </div>
            </Modal>

            <Modal title={t('database.mysql.users.changePassword')} visible={!!pwdUser} onCancel={() => setPwdUser(null)} onOk={submitPassword} confirmLoading={changing} okText={t('common.confirm')} cancelText={t('common.cancel')} width={400}>
                <Field label={t('database.mysql.users.newPassword')}>
                    <Input mode="password" value={pwdValue} onChange={setPwdValue} />
                </Field>
            </Modal>
        </SideSheet>
    );
}

function MysqlConnectModal({ visible, instance, onClose }: { visible: boolean; instance: DatabaseOption; onClose: () => void }) {
    const { t } = useTranslation();
    const infoQuery = useLoadDBBaseInfoQuery({ type: instance.type, database: instance.database }, { skip: !visible });
    const [changePassword, { isLoading }] = useChangeMysqlPasswordMutation();
    const [pwd, setPwd] = useState('');
    const info = infoQuery.data;

    const submit = async () => {
        if (!pwd) return;
        try {
            await changePassword({ id: 0, from: instance.from, type: instance.type, database: instance.database, value: pwd }).unwrap();
            Toast.success(t('database.mysql.connect.passwordSuccess'));
            setPwd('');
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal title={t('database.mysql.connect.title')} visible={visible} onCancel={onClose} footer={null} width={480}>
            <Descriptions
                data={[
                    { key: t('database.mysql.connect.name'), value: info?.name ?? '-' },
                    { key: t('database.mysql.connect.container'), value: info?.containerName ?? '-' },
                    { key: t('database.mysql.connect.port'), value: String(info?.port ?? '-') },
                ]}
            />
            <Divider margin={16} />
            <Field label={t('database.mysql.connect.rootPassword')}>
                <Input mode="password" value={pwd} onChange={setPwd} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <Button type="primary" loading={isLoading} disabled={!pwd} onClick={submit}>
                    {t('database.mysql.connect.change')}
                </Button>
            </div>
        </Modal>
    );
}

export default function DatabaseMysql() {
    const { t } = useTranslation();
    const [instance, setInstance] = useState<DatabaseOption>();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [orderBy] = useState<'name' | 'createdAt'>('createdAt');
    const [order] = useState<'ascending' | 'descending' | 'null'>('null');

    const [createOpen, setCreateOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);
    const [connectOpen, setConnectOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MysqlDBInfo | null>(null);

    const database = instance?.database ?? '';
    const engineType = instance?.type ?? 'mysql';

    useEffect(() => {
        setPage(1);
    }, [instance?.database, info]);

    const listQuery = useSearchMysqlQuery({ database, page, pageSize, info, orderBy, order }, { skip: !instance });
    const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
    const rowNames = useMemo(() => rows.map((r) => r.name), [rows]);

    const summaryQuery = useMysqlGrantSummaryQuery({ database, dbs: rowNames }, { skip: !instance || rowNames.length === 0 });
    const summary = summaryQuery.data ?? {};

    const [updateDescription] = useUpdateMysqlDescriptionMutation();

    const columns = [
        { title: t('database.mysql.table.name'), dataIndex: 'name', key: 'name' },
        {
            title: t('database.common.from'),
            dataIndex: 'from',
            key: 'from',
            width: 100,
            render: (v: string) => <Tag color={v === 'local' ? 'green' : 'blue'}>{v === 'local' ? t('database.common.local') : t('database.common.remote')}</Tag>,
        },
        { title: t('database.mysql.table.format'), dataIndex: 'format', key: 'format', width: 110, render: (v: string) => v || '-' },
        {
            title: t('database.mysql.table.authorized'),
            key: 'authorized',
            width: 220,
            render: (_: unknown, row: MysqlDBInfo) => {
                const users: MysqlUser[] = summary[row.name] ?? [];
                if (!users.length) return <Text size="small" type="tertiary">-</Text>;
                return (
                    <Space spacing={4} wrap>
                        {users.map((u) => (
                            <Tag key={`${u.username}@${u.host}`}>{`${u.username}@${u.host}`}</Tag>
                        ))}
                    </Space>
                );
            },
        },
        {
            title: t('database.common.description'),
            key: 'description',
            width: 180,
            render: (_: unknown, row: MysqlDBInfo) => (
                <DescriptionCell
                    value={row.description}
                    onSave={async (next) => {
                        try {
                            await updateDescription({ id: row.id, description: next }).unwrap();
                            Toast.success(t('database.common.descriptionSaved'));
                        } catch (e) {
                            Toast.error(errText(e));
                        }
                    }}
                />
            ),
        },
        { title: t('database.common.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 200 },
        {
            title: t('database.common.actions'),
            key: 'actions',
            width: 90,
            render: (_: unknown, row: MysqlDBInfo) => (
                <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteTarget(row)}>
                    {t('database.common.delete')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space wrap>
                <InstanceSelect types="mysql,mariadb,mysql-cluster" engineType="mysql" value={instance?.database} onChange={setInstance} />
                <Input placeholder={t('database.common.search')} value={searchInput} onChange={setSearchInput} style={{ width: 240 }} showClear />
                <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>
                    {t('home.refresh')}
                </Button>
            </Space>

            {!instance ? (
                <Card>
                    <Empty title={t('database.common.noInstance')} description={t('database.common.noInstanceDesc')} style={{ padding: '24px 0' }} />
                </Card>
            ) : listQuery.isError ? (
                <Card>
                    <Empty title={t('database.common.empty')} description={t('database.overview.backendOffline')} style={{ padding: '24px 0' }} />
                </Card>
            ) : (
                <Card
                    title={t('database.mysql.title')}
                    headerExtraContent={
                        <Space>
                            <Button onClick={() => setUsersOpen(true)}>{t('database.mysql.users.title')}</Button>
                            <Button onClick={() => setConnectOpen(true)}>{t('database.mysql.connect.title')}</Button>
                            <Button type="primary" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                                {t('database.mysql.create.title')}
                            </Button>
                        </Space>
                    }
                >
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={rows}
                        pagination={{
                            currentPage: page,
                            pageSize,
                            total: listQuery.data?.total ?? 0,
                            onPageChange: setPage,
                            onPageSizeChange: setPageSize,
                            pageSizeOpts: [10, 20, 50, 100],
                        }}
                        empty={<Empty title={t('database.common.empty')} />}
                    />
                </Card>
            )}

            {instance && createOpen && (
                <MysqlCreateModal visible database={instance.database} from={instance.from} onClose={() => setCreateOpen(false)} onCreated={() => listQuery.refetch()} />
            )}
            {instance && usersOpen && <MysqlUsersDrawer visible database={instance.database} onClose={() => setUsersOpen(false)} />}
            {instance && connectOpen && <MysqlConnectModal visible instance={instance} onClose={() => setConnectOpen(false)} />}
            {instance && deleteTarget && (
                <MysqlDeleteModal target={deleteTarget} database={instance.database} type={engineType} onClose={() => setDeleteTarget(null)} />
            )}
        </div>
    );
}
