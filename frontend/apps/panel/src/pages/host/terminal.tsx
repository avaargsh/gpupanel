import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Table,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconTerminal, IconWrench } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import Terminal from '@/components/Terminal';
import { useAppSelector } from '@/store/hooks';
import {
    useCreateHostMutation,
    useDeleteHostMutation,
    useSearchHostsQuery,
    useTestHostByIDMutation,
    useUpdateHostMutation,
    type Host,
    type HostOperate,
} from '@/api/hostApi';

const { Text } = Typography;

type TerminalTarget = { kind: 'local' } | { kind: 'ssh'; id: number; title: string };

const emptyOperate: HostOperate = {
    isLocal: false,
    id: 0,
    name: '',
    groupID: 0,
    addr: '',
    port: 22,
    user: 'root',
    authMode: 'password',
    password: '',
    privateKey: '',
    passPhrase: '',
    rememberPassword: true,
    description: '',
};

/**
 * 终端页签：已保存 SSH 主机列表（增删改查）+ xterm 终端（本地 / 已保存主机）。
 */
export default function HostTerminal() {
    const { t } = useTranslation();
    const currentNode = useAppSelector((state) => state.ui.currentNode) || 'local';

    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    const listQuery = useSearchHostsQuery({ page: 1, pageSize: 100, info: debouncedSearch });

    const hosts = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

    const [createHost] = useCreateHostMutation();
    const [updateHost] = useUpdateHostMutation();
    const [deleteHost, { isLoading: deleting }] = useDeleteHostMutation();
    const [testHostByID, { isLoading: testing }] = useTestHostByIDMutation();

    // ---------- 添加/编辑弹窗 ----------
    const [modalOpen, setModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<Host | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const openCreate = () => {
        setEditingHost(null);
        setModalOpen(true);
    };
    const openEdit = (row: Host) => {
        setEditingHost(row);
        setModalOpen(true);
    };

    const handleSubmit = async (values: Record<string, unknown>) => {
        const authModeRaw = String(values.authMode ?? 'password');
        const authMode = authModeRaw === 'key' ? ('key' as const) : ('password' as const);
        const payload: HostOperate = {
            isLocal: false,
            id: editingHost?.id ?? 0,
            name: String(values.name ?? ''),
            groupID: 0,
            addr: String(values.addr ?? ''),
            port: Number(values.port ?? 22),
            user: String(values.user ?? ''),
            authMode,
            password: String(values.password ?? ''),
            privateKey: String(values.privateKey ?? ''),
            passPhrase: String(values.passPhrase ?? ''),
            rememberPassword: Boolean(values.rememberPassword),
            description: String(values.description ?? ''),
        };
        setSubmitting(true);
        try {
            if (editingHost) {
                await updateHost(payload).unwrap();
                Toast.success(t('host.terminal.updateSuccess'));
            } else {
                await createHost(payload).unwrap();
                Toast.success(t('host.terminal.addSuccess'));
            }
            setModalOpen(false);
        } catch (e) {
            const msg = (e as { data?: { message?: string } }).data?.message ?? String(e);
            Toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = (row: Host) => {
        Modal.confirm({
            title: t('host.terminal.deleteTitle'),
            content: t('host.terminal.deleteContent', { name: row.name }),
            confirmLoading: deleting,
            onOk: async () => {
                try {
                    await deleteHost([row.id]).unwrap();
                    Toast.success(t('host.terminal.deleteSuccess'));
                } catch (e) {
                    const msg = (e as { data?: { message?: string } }).data?.message ?? String(e);
                    Toast.error(msg);
                }
            },
        });
    };

    const handleTest = async (row: Host) => {
        try {
            await testHostByID(row.id).unwrap();
            Toast.success(t('host.terminal.testSuccess'));
        } catch (e) {
            const msg = (e as { data?: { message?: string } }).data?.message ?? String(e);
            Toast.error(`${t('host.terminal.testError')}: ${msg}`);
        }
    };

    // ---------- 终端目标 ----------
    const [target, setTarget] = useState<TerminalTarget>({ kind: 'local' });
    const targetKey = target.kind === 'local' ? 'local' : `ssh-${target.id}`;
    const endpoint = target.kind === 'local' ? '/api/v1/hosts/terminal/local' : '/api/v1/hosts/terminal/ssh';
    const queryParams = target.kind === 'ssh' ? { id: target.id } : undefined;
    const targetLabel =
        target.kind === 'local'
            ? t('host.terminal.local')
            : `${target.title} (${t('host.terminal.remote')})`;

    const columns = [
        {
            title: t('host.terminal.name'),
            dataIndex: 'name',
            render: (_: unknown, row: Host) => <Text strong>{row.name}</Text>,
        },
        { title: t('host.terminal.addr'), dataIndex: 'addr', render: (_: unknown, row: Host) => `${row.addr}:${row.port}` },
        { title: t('host.terminal.user'), dataIndex: 'user' },
        {
            title: t('host.terminal.authMode'),
            dataIndex: 'authMode',
            render: (value: unknown) =>
                value === 'key' ? t('host.terminal.keyMode') : t('host.terminal.passwordMode'),
        },
        {
            title: t('host.terminal.actions'),
            dataIndex: 'id',
            width: 260,
            render: (_: unknown, row: Host) => (
                <Space spacing="tight">
                    <Button size="small" type="primary" icon={<IconTerminal />} onClick={() => setTarget({ kind: 'ssh', id: row.id, title: row.name })}>
                        {t('host.terminal.connect')}
                    </Button>
                    <Button size="small" loading={testing} icon={<IconWrench />} onClick={() => handleTest(row)}>
                        {t('host.terminal.test')}
                    </Button>
                    <Button size="small" onClick={() => openEdit(row)}>
                        {t('host.terminal.edit')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => handleDelete(row)}>
                        {t('host.terminal.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    const initValues: Record<string, unknown> = editingHost
        ? {
              name: editingHost.name,
              addr: editingHost.addr,
              port: editingHost.port,
              user: editingHost.user,
              authMode: editingHost.authMode || 'password',
              password: editingHost.password || '',
              privateKey: editingHost.privateKey || '',
              passPhrase: editingHost.passPhrase || '',
              rememberPassword: editingHost.rememberPassword ?? true,
              description: editingHost.description ?? '',
          }
        : { ...emptyOperate };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {listQuery.isError ? (
                <Card>
                    <Empty
                        title={t('host.overview.noData')}
                        description={t('host.terminal.backendOffline')}
                        style={{ padding: '24px 0' }}
                    />
                </Card>
            ) : (
                <Card
                    title={t('host.terminal.hosts')}
                    headerExtraContent={
                        <Space>
                            <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>
                                {t('home.refresh')}
                            </Button>
                            <Button type="primary" icon={<IconPlus />} onClick={openCreate}>
                                {t('host.terminal.add')}
                            </Button>
                        </Space>
                    }
                >
                    <Input
                        placeholder={t('host.terminal.search')}
                        value={searchInput}
                        onChange={(v: string) => setSearchInput(v)}
                        style={{ maxWidth: 280, marginBottom: 12 }}
                        showClear
                    />
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={hosts}
                        loading={listQuery.isFetching}
                        pagination={false}
                        empty={t('host.terminal.empty')}
                        size="small"
                    />
                </Card>
            )}

            <Card
                title={
                    <Space>
                        <IconTerminal />
                        <span>{t('host.terminal.title')}</span>
                        <Text type="tertiary" size="small" style={{ marginLeft: 8 }}>
                            {targetLabel}
                        </Text>
                    </Space>
                }
                headerExtraContent={
                    <Space>
                        <Button
                            size="small"
                            type={target.kind === 'local' ? 'primary' : 'tertiary'}
                            onClick={() => setTarget({ kind: 'local' })}
                        >
                            {t('host.terminal.local')}
                        </Button>
                        <Select
                            size="small"
                            placeholder={t('host.terminal.chooseHost')}
                            style={{ width: 220 }}
                            filter
                            optionList={hosts.map((h) => ({ label: `${h.name} (${h.addr})`, value: h.id }))}
                            onChange={(id) => {
                                const h = hosts.find((x) => x.id === Number(id));
                                if (h) setTarget({ kind: 'ssh', id: h.id, title: h.name });
                            }}
                        />
                    </Space>
                }
                bodyStyle={{ padding: 0 }}
            >
                <div style={{ padding: 12 }}>
                    <Terminal
                        key={targetKey}
                        endpoint={endpoint}
                        queryParams={queryParams}
                        operateNode={currentNode}
                        height="46vh"
                    />
                </div>
            </Card>

            <Modal
                title={editingHost ? t('host.terminal.edit') : t('host.terminal.add')}
                visible={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}
                maskClosable={false}
                style={{ width: 560 }}
            >
                <Form
                    key={editingHost ? `edit-${editingHost.id}` : 'new'}
                    initValues={initValues}
                    onSubmit={handleSubmit}
                    style={{ width: '100%' }}
                >
                    <Form.Input field="name" label={t('host.terminal.name')} rules={[{ required: true, message: t('host.terminal.requiredName') }]} />
                    <Form.Input
                        field="addr"
                        label={t('host.terminal.addr')}
                        rules={[{ required: true, message: t('host.terminal.requiredAddr') }]}
                        placeholder="192.168.1.100"
                    />
                    <Form.InputNumber
                        field="port"
                        label={t('host.terminal.port')}
                        rules={[{ required: true, message: t('host.terminal.requiredPort') }]}
                        min={1}
                        max={65535}
                    />
                    <Form.Input field="user" label={t('host.terminal.user')} rules={[{ required: true, message: t('host.terminal.requiredUser') }]} />
                    <Form.Select
                        field="authMode"
                        label={t('host.terminal.authMode')}
                        optionList={[
                            { label: t('host.terminal.passwordMode'), value: 'password' },
                            { label: t('host.terminal.keyMode'), value: 'key' },
                        ]}
                    />
                    <Form.Input
                        field="password"
                        label={t('host.terminal.password')}
                        type="password"
                        mode="password"
                        placeholder={editingHost ? t('host.terminal.keepSecretPlaceholder') : undefined}
                    />
                    <Form.TextArea
                        field="privateKey"
                        label={t('host.terminal.privateKey')}
                        style={{ height: 96, minHeight: 96 }}
                        placeholder={editingHost ? t('host.terminal.keepSecretPlaceholder') : undefined}
                    />
                    <Form.Input
                        field="passPhrase"
                        label={t('host.terminal.passPhrase')}
                        type="password"
                        mode="password"
                        placeholder={editingHost ? t('host.terminal.keepSecretPlaceholder') : undefined}
                    />
                    <Form.Switch field="rememberPassword" label={t('host.terminal.rememberPassword')} />
                    <Form.TextArea field="description" label={t('host.terminal.description')} style={{ height: 60, minHeight: 60 }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                        <Button onClick={() => setModalOpen(false)}>{t('host.terminal.cancel')}</Button>
                        <Button htmlType="submit" type="primary" loading={submitting}>
                            {t('host.terminal.save')}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}