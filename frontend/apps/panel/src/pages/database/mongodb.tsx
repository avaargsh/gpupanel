import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Checkbox, Empty, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useAddMongodbMutation,
    useChangeMongodbRootPasswordMutation,
    useDeleteCheckMongodbMutation,
    useDeleteMongodbMutation,
    useSearchMongodbQuery,
    useUpdateMongodbDescriptionMutation,
    type DatabaseOption,
    type DBResource,
    type MongodbDBInfo,
} from '@/api/databaseApi';
import InstanceSelect from './InstanceSelect';
import { DescriptionCell, useDebouncedValue } from './shared';

const { Text } = Typography;

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const PERMISSIONS = ['dbOwner', 'read', 'readWrite', 'userAdmin'] as const;

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

function MongoCreateModal({ visible, database, from, onClose, onCreated }: { visible: boolean; database: string; from: string; onClose: () => void; onCreated: () => void }) {
    const { t } = useTranslation();
    const [addMongo, { isLoading }] = useAddMongodbMutation();
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [permission, setPermission] = useState<(typeof PERMISSIONS)[number]>('dbOwner');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (visible) {
            setName('');
            setUsername('');
            setPassword('');
            setPermission('dbOwner');
            setDescription('');
        }
    }, [visible]);

    const submit = async () => {
        if (!name.trim()) return Toast.error(t('database.mongo.create.nameRequired'));
        if (!username.trim()) return Toast.error(t('database.mongo.create.usernameRequired'));
        if (!password) return Toast.error(t('database.mongo.create.passwordRequired'));
        try {
            await addMongo({
                name: name.trim(),
                from: from || 'local',
                database,
                username: username.trim(),
                password,
                permission,
                description: description.trim(),
            }).unwrap();
            Toast.success(t('database.mongo.create.success'));
            onCreated();
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal title={t('database.mongo.create.title')} visible={visible} onCancel={onClose} onOk={submit} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={isLoading} width={460} maskClosable={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label={t('database.mongo.create.name')}>
                    <Input value={name} onChange={setName} placeholder={t('database.mongo.create.namePlaceholder')} />
                </Field>
                <Field label={t('database.mongo.create.username')}>
                    <Input value={username} onChange={setUsername} placeholder={name || t('database.mongo.create.usernamePlaceholder')} />
                </Field>
                <Field label={t('database.mongo.create.password')}>
                    <Input mode="password" value={password} onChange={setPassword} />
                </Field>
                <Field label={t('database.mongo.create.permission')}>
                    <Select value={permission} onChange={(v) => setPermission(v as (typeof PERMISSIONS)[number])} optionList={PERMISSIONS.map((p) => ({ label: p, value: p }))} style={{ width: '100%' }} />
                </Field>
                <Field label={t('database.common.description')}>
                    <Input value={description} onChange={setDescription} />
                </Field>
            </div>
        </Modal>
    );
}

function MongoDeleteModal({ target, database, type, onClose }: { target: MongodbDBInfo; database: string; type: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [check] = useDeleteCheckMongodbMutation();
    const [del, { isLoading }] = useDeleteMongodbMutation();
    const [resources, setResources] = useState<DBResource[]>([]);
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);

    useEffect(() => {
        let active = true;
        setResources([]);
        setForceDelete(false);
        setDeleteBackup(false);
        check({ id: target.id, type, database })
            .unwrap()
            .then((res) => active && setResources(res ?? []))
            .catch(() => active && setResources([]));
        return () => {
            active = false;
        };
    }, [target.id]);

    const submit = async () => {
        try {
            await del({ id: target.id, type, database, forceDelete, deleteBackup }).unwrap();
            Toast.success(t('database.mongo.delete.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal title={t('database.mongo.delete.title')} visible onCancel={onClose} onOk={submit} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={isLoading} okButtonProps={{ type: 'danger' }} width={460}>
            <Text>{t('database.mongo.delete.content', { name: target.name })}</Text>
            {resources.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Text type="warning" size="small">
                        {t('database.mongo.delete.resourceHint')}
                    </Text>
                    <Space spacing={4} wrap>
                        {resources.map((r) => (
                            <Tag key={`${r.type}:${r.name}`} color="orange">
                                {r.name}
                            </Tag>
                        ))}
                    </Space>
                    <Checkbox checked={forceDelete} onChange={(e) => setForceDelete(!!e.target.checked)}>
                        {t('database.mongo.delete.force')}
                    </Checkbox>
                    <Checkbox checked={deleteBackup} onChange={(e) => setDeleteBackup(!!e.target.checked)}>
                        {t('database.mongo.delete.deleteBackup')}
                    </Checkbox>
                </div>
            )}
        </Modal>
    );
}

function MongoRootPasswordModal({ instance, onClose }: { instance: DatabaseOption; onClose: () => void }) {
    const { t } = useTranslation();
    const [change, { isLoading }] = useChangeMongodbRootPasswordMutation();
    const [pwd, setPwd] = useState('');

    const submit = async () => {
        if (!pwd) return;
        try {
            await change({ id: 0, from: instance.from, type: instance.type, database: instance.database, value: pwd }).unwrap();
            Toast.success(t('database.mongo.passwordSuccess'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal title={t('database.mongo.passwordTitle')} visible onCancel={onClose} onOk={submit} okText={t('common.confirm')} cancelText={t('common.cancel')} confirmLoading={isLoading} width={420}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Text type="tertiary" size="small">
                    {t('database.mongo.passwordHint')}
                </Text>
                <Field label={t('database.mongo.password')}>
                    <Input mode="password" value={pwd} onChange={setPwd} />
                </Field>
            </div>
        </Modal>
    );
}

export default function DatabaseMongodb() {
    const { t } = useTranslation();
    const [instance, setInstance] = useState<DatabaseOption>();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MongodbDBInfo | null>(null);
    const [pwdOpen, setPwdOpen] = useState(false);

    const database = instance?.database ?? '';
    const engineType = instance?.type ?? 'mongodb';

    useEffect(() => {
        setPage(1);
    }, [instance?.database, info]);

    const listQuery = useSearchMongodbQuery({ database, page, pageSize, info, orderBy: 'createdAt', order: 'null' }, { skip: !instance });
    const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
    const [updateDescription] = useUpdateMongodbDescriptionMutation();

    const columns = [
        { title: t('database.mongo.table.name'), dataIndex: 'name', key: 'name' },
        {
            title: t('database.common.from'),
            dataIndex: 'from',
            key: 'from',
            width: 100,
            render: (v: string) => <Tag color={v === 'local' ? 'green' : 'blue'}>{v === 'local' ? t('database.common.local') : t('database.common.remote')}</Tag>,
        },
        { title: t('database.mongo.table.username'), dataIndex: 'username', key: 'username', width: 160 },
        {
            title: t('database.common.description'),
            key: 'description',
            width: 180,
            render: (_: unknown, row: MongodbDBInfo) => (
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
            render: (_: unknown, row: MongodbDBInfo) => (
                <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteTarget(row)}>
                    {t('database.common.delete')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space wrap>
                <InstanceSelect types="mongodb" engineType="mongodb" value={instance?.database} onChange={setInstance} />
                <Input placeholder={t('database.common.search')} value={searchInput} onChange={setSearchInput} style={{ width: 240 }} showClear />
                <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>
                    {t('home.refresh')}
                </Button>
            </Space>

            {!instance ? (
                <Card>
                    <Empty title={t('database.common.noInstance')} description={t('database.common.noInstanceDesc')} style={{ padding: '24px 0' }} />
                </Card>
            ) : (
                <Card
                    title={t('database.mongo.title')}
                    headerExtraContent={
                        <Space>
                            <Button onClick={() => setPwdOpen(true)}>{t('database.mongo.passwordTitle')}</Button>
                            <Button type="primary" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                                {t('database.mongo.create.title')}
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
                <MongoCreateModal visible database={instance.database} from={instance.from} onClose={() => setCreateOpen(false)} onCreated={() => listQuery.refetch()} />
            )}
            {instance && deleteTarget && (
                <MongoDeleteModal target={deleteTarget} database={instance.database} type={engineType} onClose={() => setDeleteTarget(null)} />
            )}
            {instance && pwdOpen && <MongoRootPasswordModal instance={instance} onClose={() => setPwdOpen(false)} />}
        </div>
    );
}
