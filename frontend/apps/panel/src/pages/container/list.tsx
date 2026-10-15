import { useEffect, useMemo, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    Dropdown,
    Empty,
    Form,
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
import {
    IconEdit,
    IconFile,
    IconMore,
    IconPlus,
    IconRefresh,
    IconTerminal,
} from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateContainerMutation,
    useGetContainerInfoQuery,
    useGetContainerStatsQuery,
    useGetContainerStatusQuery,
    useGetContainerListStatsQuery,
    useInspectContainerMutation,
    useListAllImagesQuery,
    useOperateContainerMutation,
    usePruneContainersMutation,
    useRenameContainerMutation,
    useSearchContainersQuery,
    type ContainerInfo,
    type ContainerOperation,
    type ContainerOperate,
    type ContainerPortHelper,
    type ContainerState,
    type ContainerVolumeHelper,
} from '@/api/containerApi';
import { formatPercent } from '@/utils/format';

const { Text } = Typography;

interface ContainerListProps {
    onOpenLogs: (container: ContainerInfo) => void;
    onOpenExec: (container: ContainerInfo) => void;
}

const STATE_COLOR: Record<string, 'green' | 'grey' | 'orange' | 'red' | 'blue'> = {
    running: 'green',
    created: 'blue',
    paused: 'orange',
    restarting: 'orange',
    removing: 'orange',
    exited: 'grey',
    dead: 'red',
};

/** 解析端口文本，每行 "hostPort:containerPort[/proto]" 或 "containerPort" */
function parsePorts(text: string): ContainerPortHelper[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const [portsPart, protoRaw] = line.split('/');
            const protocol = protoRaw?.trim() || 'tcp';
            const [a, b] = portsPart.split(':');
            if (b !== undefined) {
                return { hostIP: '', hostPort: a.trim(), containerPort: b.trim(), protocol };
            }
            return { hostIP: '', hostPort: '', containerPort: a.trim(), protocol };
        });
}

/** 解析环境变量文本，每行 KEY=VALUE */
function parseEnv(text: string): string[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('='));
}

/** 解析挂载文本，每行 "host:container[:ro|rw]" */
function parseVolumes(text: string): ContainerVolumeHelper[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split(':');
            const sourceDir = parts[0] ?? '';
            const containerDir = parts[1] ?? '';
            const modeRaw = parts[2];
            const mode = modeRaw === 'ro' ? 'ro' : 'rw';
            const isVolume = sourceDir && !sourceDir.startsWith('/') && !sourceDir.startsWith('~');
            return { type: isVolume ? 'volume' : 'bind', sourceDir, containerDir, mode };
        })
        .filter((v) => v.sourceDir && v.containerDir);
}

/**
 * 容器列表：状态筛选、搜索、批量操作、创建、运行/停止/重启/删除，
 * 以及跳转到日志 / 终端页签。CPU / 内存占用由 /containers/list/stats 合并。
 */
export default function ContainerList({ onOpenLogs, onOpenExec }: ContainerListProps) {
    const { t } = useTranslation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const [name, setName] = useState('');
    const [state, setState] = useState<ContainerState>('all');
    const [orderBy, setOrderBy] = useState<'name' | 'createdAt' | 'state'>('createdAt');
    const [order, setOrder] = useState<'ascending' | 'descending'>('descending');
    const [selected, setSelected] = useState<string[]>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setName(nameInput);
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [nameInput]);

    const listQuery = useSearchContainersQuery({ page, pageSize, name, state, orderBy, order });
    const statusQuery = useGetContainerStatusQuery();
    const statsQuery = useGetContainerListStatsQuery(undefined, { pollingInterval: 5000 });

    const rows = useMemo(() => {
        const items = listQuery.data?.items ?? [];
        const map = new Map((statsQuery.data ?? []).map((s) => [s.containerID, s]));
        return items.map((c) => {
            const s = map.get(c.containerID);
            if (!s) return c;
            return {
                ...c,
                hasLoad: true,
                cpuPercent: s.cpuPercent,
                memoryPercent: s.memoryPercent,
                memoryUsage: s.memoryUsage,
                memoryLimit: s.memoryLimit,
            };
        });
    }, [listQuery.data, statsQuery.data]);

    const total = listQuery.data?.total ?? 0;
    const nameMap = useMemo(() => new Map(rows.map((r) => [r.containerID, r.name])), [rows]);

    const [operate] = useOperateContainerMutation();
    const [prune, { isLoading: pruning }] = usePruneContainersMutation();

    const runOperate = async (operation: ContainerOperation, names: string[]) => {
        try {
            await operate({ names, operation }).unwrap();
            Toast.success(t(`container.actions.${operation}Success`));
            setSelected([]);
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    const confirmRemove = (names: string[]) => {
        Modal.confirm({
            title: t('container.actions.removeTitle'),
            content: t('container.actions.removeContent', { names: names.join(', ') }),
            okButtonProps: { type: 'danger' },
            onOk: () => runOperate('remove', names),
        });
    };

    // ---------- 状态筛选 chips ----------
    const statusChips = useMemo(() => {
        const s = statusQuery.data;
        if (!s) return [];
        return [
            { key: 'all' as ContainerState, count: s.containerCount },
            { key: 'running' as ContainerState, count: s.running },
            { key: 'exited' as ContainerState, count: s.exited },
            { key: 'created' as ContainerState, count: s.created },
            { key: 'paused' as ContainerState, count: s.paused },
            { key: 'restarting' as ContainerState, count: s.restarting },
            { key: 'dead' as ContainerState, count: s.dead },
        ].filter((c) => c.count > 0 || c.key === 'all');
    }, [statusQuery.data]);

    // ---------- 创建弹窗 ----------
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createContainer] = useCreateContainerMutation();
    const imagesQuery = useListAllImagesQuery(undefined, { skip: !createOpen });

    const imageOptions = useMemo(
        () => (imagesQuery.data ?? []).flatMap((img) => (img.tags?.length ? img.tags : [img.id])).map((v) => ({ label: v, value: v })),
        [imagesQuery.data],
    );

    const handleCreate = async (values: Record<string, unknown>) => {
        const payload: ContainerOperate = {
            name: String(values.name ?? ''),
            image: String(values.image ?? ''),
            networks: [{ network: String(values.network ?? 'bridge'), ipv4: '', ipv6: '', macAddr: '' }],
            exposedPorts: parsePorts(String(values.ports ?? '')),
            env: parseEnv(String(values.env ?? '')),
            volumes: parseVolumes(String(values.volumes ?? '')),
            cmd: String(values.cmd ?? '')
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            hostname: String(values.hostname ?? ''),
            restartPolicy: String(values.restartPolicy ?? 'no'),
            publishAllPorts: Boolean(values.publishAllPorts),
            privileged: Boolean(values.privileged),
            autoRemove: Boolean(values.autoRemove),
            tty: true,
            openStdin: true,
            nanoCPUs: values.cpus ? Number(values.cpus) : 0,
            memory: values.memory ? Number(values.memory) : 0,
        };
        setCreating(true);
        try {
            await createContainer(payload).unwrap();
            Toast.success(t('container.create.success'));
            setCreateOpen(false);
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        } finally {
            setCreating(false);
        }
    };

    // ---------- 重命名 ----------
    const [renameTarget, setRenameTarget] = useState<ContainerInfo | null>(null);
    const [renameContainer, { isLoading: renaming }] = useRenameContainerMutation();
    const handleRename = async (newName: string) => {
        if (!renameTarget) return;
        try {
            await renameContainer({ name: renameTarget.name, newName }).unwrap();
            Toast.success(t('container.rename.success'));
            setRenameTarget(null);
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    // ---------- 清理 ----------
    const [pruneOpen, setPruneOpen] = useState(false);
    const handlePrune = async (pruneType: string, withTagAll: boolean) => {
        try {
            const res = await prune({ pruneType: pruneType as never, withTagAll }).unwrap();
            Toast.success(t('container.prune.success', { count: res.deletedNumber, size: res.spaceReclaimed }));
            setPruneOpen(false);
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    // ---------- 详情 ----------
    const [detail, setDetail] = useState<ContainerInfo | null>(null);
    const infoQuery = useGetContainerInfoQuery(detail?.name ?? '', { skip: !detail });
    const statsQuery2 = useGetContainerStatsQuery(detail?.containerID ?? '', { skip: !detail, pollingInterval: 5000 });
    const [inspectContainer] = useInspectContainerMutation();
    const [inspectText, setInspectText] = useState('');
    const openInspect = async () => {
        if (!detail) return;
        try {
            const res = await inspectContainer({ id: detail.containerID, type: 'container' }).unwrap();
            setInspectText(typeof res === 'string' ? res : JSON.stringify(res, null, 2));
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    const columns = [
        {
            title: t('container.table.name'),
            dataIndex: 'name',
            render: (_: unknown, row: ContainerInfo) => (
                <Space spacing={4} wrap>
                    <Text strong style={{ cursor: 'pointer' }} onClick={() => setDetail(row)}>
                        {row.name}
                    </Text>
                    {row.isFromApp && <Tag size="small" color="blue">{t('container.table.fromApp')}</Tag>}
                    {row.isFromCompose && <Tag size="small" color="violet">{t('container.table.fromCompose')}</Tag>}
                </Space>
            ),
        },
        {
            title: t('container.table.state'),
            dataIndex: 'state',
            width: 110,
            render: (value: string) => <Tag color={STATE_COLOR[value] ?? 'grey'}>{t(`container.state.${value}`) || value}</Tag>,
        },
        {
            title: t('container.table.image'),
            dataIndex: 'imageName',
            ellipsis: true,
            render: (value: string) => <Text size="small">{value}</Text>,
        },
        {
            title: t('container.table.cpu'),
            dataIndex: 'cpuPercent',
            width: 110,
            render: (value: number | undefined, row: ContainerInfo) =>
                row.hasLoad ? <Text size="small">{formatPercent(value)}</Text> : <Text type="tertiary">—</Text>,
        },
        {
            title: t('container.table.memory'),
            dataIndex: 'memoryPercent',
            width: 110,
            render: (value: number | undefined, row: ContainerInfo) =>
                row.hasLoad ? <Text size="small">{formatPercent(value)}</Text> : <Text type="tertiary">—</Text>,
        },
        {
            title: t('container.table.ports'),
            dataIndex: 'ports',
            width: 140,
            render: (ports: string[]) => (ports?.length ? <Text size="small">{ports.length} {t('container.table.items')}</Text> : <Text type="tertiary">—</Text>),
        },
        { title: t('container.table.created'), dataIndex: 'createTime', width: 190 },
        {
            title: t('container.table.actions'),
            dataIndex: 'containerID',
            width: 240,
            render: (_: unknown, row: ContainerInfo) => {
                const isRunning = row.state === 'running';
                const isPaused = row.state === 'paused';
                return (
                    <Space spacing="tight">
                        {isRunning && (
                            <Button size="small" onClick={() => runOperate('stop', [row.name])}>
                                {t('container.actions.stop')}
                            </Button>
                        )}
                        {(row.state === 'exited' || row.state === 'created' || row.state === 'dead') && (
                            <Button size="small" type="primary" onClick={() => runOperate('start', [row.name])}>
                                {t('container.actions.start')}
                            </Button>
                        )}
                        {isPaused && (
                            <Button size="small" type="primary" onClick={() => runOperate('unpause', [row.name])}>
                                {t('container.actions.unpause')}
                            </Button>
                        )}
                        <Button size="small" icon={<IconFile />} theme="borderless" onClick={() => onOpenLogs(row)}>
                            {t('container.actions.logs')}
                        </Button>
                        <Button size="small" icon={<IconTerminal />} theme="borderless" disabled={!isRunning} onClick={() => onOpenExec(row)}>
                            {t('container.actions.exec')}
                        </Button>
                        <Dropdown
                            trigger="click"
                            render={
                                <Dropdown.Menu>
                                    <Dropdown.Item onClick={() => setDetail(row)}>{t('container.actions.detail')}</Dropdown.Item>
                                    {isRunning && <Dropdown.Item onClick={() => runOperate('restart', [row.name])}>{t('container.actions.restart')}</Dropdown.Item>}
                                    {isRunning && <Dropdown.Item onClick={() => runOperate('pause', [row.name])}>{t('container.actions.pause')}</Dropdown.Item>}
                                    {isRunning && <Dropdown.Item onClick={() => runOperate('kill', [row.name])}>{t('container.actions.kill')}</Dropdown.Item>}
                                    <Dropdown.Item onClick={() => setRenameTarget(row)}>{t('container.actions.rename')}</Dropdown.Item>
                                    <Dropdown.Item type="danger" onClick={() => confirmRemove([row.name])}>
                                        {t('container.actions.remove')}
                                    </Dropdown.Item>
                                </Dropdown.Menu>
                            }
                        >
                            <Button size="small" icon={<IconMore />} theme="borderless" />
                        </Dropdown>
                    </Space>
                );
            },
        },
    ];

    const selectedNames = selected.map((id) => nameMap.get(id)).filter((n): n is string => Boolean(n));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {listQuery.isError ? (
                <Card>
                    <Empty title={t('container.overview.noData')} description={t('container.overview.backendOffline')} style={{ padding: '24px 0' }} />
                </Card>
            ) : (
                <Card
                    title={t('container.list.title')}
                    headerExtraContent={
                        <Space>
                            <Button icon={<IconRefresh />} onClick={() => { listQuery.refetch(); statusQuery.refetch(); }}>
                                {t('home.refresh')}
                            </Button>
                            <Button onClick={() => setPruneOpen(true)}>{t('container.prune.title')}</Button>
                            <Button type="primary" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                                {t('container.create.title')}
                            </Button>
                        </Space>
                    }
                >
                    <Space spacing={8} wrap style={{ marginBottom: 12 }}>
                        {statusChips.map((chip) => (
                            <Button
                                key={chip.key}
                                size="small"
                                type={state === chip.key ? 'primary' : 'tertiary'}
                                theme={state === chip.key ? 'solid' : 'light'}
                                onClick={() => {
                                    setState(chip.key);
                                    setPage(1);
                                }}
                            >
                                {chip.key === 'all' ? t('container.state.all') : t(`container.state.${chip.key}`)} * {chip.count}
                            </Button>
                        ))}
                    </Space>

                    <Space spacing={8} style={{ marginBottom: 12 }} wrap>
                        <Input
                            placeholder={t('container.list.search')}
                            value={nameInput}
                            onChange={(v: string) => setNameInput(v)}
                            style={{ width: 240 }}
                            showClear
                        />
                        <Select
                            value={orderBy}
                            style={{ width: 150 }}
                            optionList={[
                                { label: t('container.list.orderByCreated'), value: 'createdAt' },
                                { label: t('container.list.orderByName'), value: 'name' },
                                { label: t('container.list.orderByState'), value: 'state' },
                            ]}
                            onChange={(v) => setOrderBy(v as typeof orderBy)}
                        />
                        <Button onClick={() => setOrder((o) => (o === 'ascending' ? 'descending' : 'ascending'))}>
                            {order === 'ascending' ? t('container.list.ascending') : t('container.list.descending')}
                        </Button>
                        {selected.length > 0 && (
                            <>
                                <Text type="tertiary">{t('container.list.selected', { count: selected.length })}</Text>
                                <Button size="small" onClick={() => runOperate('start', selectedNames)}>{t('container.actions.start')}</Button>
                                <Button size="small" onClick={() => runOperate('stop', selectedNames)}>{t('container.actions.stop')}</Button>
                                <Button size="small" onClick={() => runOperate('restart', selectedNames)}>{t('container.actions.restart')}</Button>
                                <Button size="small" type="danger" theme="borderless" onClick={() => confirmRemove(selectedNames)}>
                                    {t('container.actions.remove')}
                                </Button>
                            </>
                        )}
                    </Space>

                    <Table
                        rowKey="containerID"
                        columns={columns}
                        dataSource={rows}
                        loading={listQuery.isFetching}
                        empty={t('container.list.empty')}
                        size="small"
                        rowSelection={{
                            selectedRowKeys: selected,
                            onChange: (keys) => setSelected((keys ?? []) as string[]),
                        }}
                        pagination={{
                            currentPage: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            pageSizeOpts: [10, 20, 50, 100],
                            onPageSizeChange: (size) => setPageSize(size),
                            onChange: (p) => setPage(p),
                        }}
                    />
                </Card>
            )}

            {/* 创建容器 */}
            <Modal title={t('container.create.title')} visible={createOpen} onCancel={() => setCreateOpen(false)} footer={null} width={640} maskClosable={false}>
                <Form
                    initValues={{ network: 'bridge', restartPolicy: 'no', tty: true, openStdin: true }}
                    onSubmit={handleCreate}
                >
                    <Form.Input field="name" label={t('container.create.name')} rules={[{ required: true, message: t('container.create.nameRequired') }]} />
                    <Form.AutoComplete
                        field="image"
                        label={t('container.create.image')}
                        rules={[{ required: true, message: t('container.create.imageRequired') }]}
                        data={imageOptions}
                    />
                    <Form.Select
                        field="network"
                        label={t('container.create.network')}
                        optionList={[
                            { label: 'bridge', value: 'bridge' },
                            { label: 'host', value: 'host' },
                            { label: 'none', value: 'none' },
                        ]}
                    />
                    <Form.TextArea field="ports" label={t('container.create.ports')} placeholder="8080:80/tcp" style={{ height: 60, minHeight: 60 }} />
                    <Form.TextArea field="env" label={t('container.create.env')} placeholder="KEY=VALUE" style={{ height: 60, minHeight: 60 }} />
                    <Form.TextArea field="volumes" label={t('container.create.volumes')} placeholder="/host/path:/container/path:rw" style={{ height: 60, minHeight: 60 }} />
                    <Form.TextArea field="cmd" label={t('container.create.cmd')} style={{ height: 60, minHeight: 60 }} />
                    <Form.Input field="hostname" label={t('container.create.hostname')} />
                    <Form.InputNumber field="cpus" label={t('container.create.cpus')} min={0} step={0.1} />
                    <Form.InputNumber field="memory" label={t('container.create.memory')} min={0} />
                    <Form.Select
                        field="restartPolicy"
                        label={t('container.create.restartPolicy')}
                        optionList={[
                            { label: 'no', value: 'no' },
                            { label: 'always', value: 'always' },
                            { label: 'unless-stopped', value: 'unless-stopped' },
                            { label: 'on-failure', value: 'on-failure' },
                        ]}
                    />
                    <Form.Switch field="publishAllPorts" label={t('container.create.publishAllPorts')} />
                    <Form.Switch field="privileged" label={t('container.create.privileged')} />
                    <Form.Switch field="autoRemove" label={t('container.create.autoRemove')} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                        <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
                        <Button htmlType="submit" type="primary" loading={creating}>{t('common.confirm')}</Button>
                    </div>
                </Form>
            </Modal>

            {/* 重命名 */}
            <Modal title={t('container.rename.title')} visible={Boolean(renameTarget)} onCancel={() => setRenameTarget(null)} footer={null} maskClosable={false}>
                {renameTarget && (
                    <Form initValues={{ newName: renameTarget.name }} onSubmit={(v) => handleRename(String(v.newName ?? ''))}>
                        <Form.Input field="newName" label={t('container.rename.newName')} rules={[{ required: true, message: t('container.rename.newNameRequired') }]} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                            <Button onClick={() => setRenameTarget(null)}>{t('common.cancel')}</Button>
                            <Button htmlType="submit" type="primary" loading={renaming}>{t('common.confirm')}</Button>
                        </div>
                    </Form>
                )}
            </Modal>

            {/* 清理 */}
            <Modal title={t('container.prune.title')} visible={pruneOpen} onCancel={() => setPruneOpen(false)} footer={null} maskClosable={false}>
                <Form initValues={{ pruneType: 'container', withTagAll: false }} onSubmit={(v) => handlePrune(String(v.pruneType), Boolean(v.withTagAll))}>
                    <Form.Select
                        field="pruneType"
                        label={t('container.prune.type')}
                        optionList={[
                            { label: t('container.prune.container'), value: 'container' },
                            { label: t('container.prune.image'), value: 'image' },
                            { label: t('container.prune.volume'), value: 'volume' },
                            { label: t('container.prune.network'), value: 'network' },
                            { label: t('container.prune.buildcache'), value: 'buildcache' },
                        ]}
                    />
                    <Form.Switch field="withTagAll" label={t('container.prune.withTagAll')} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                        <Button onClick={() => setPruneOpen(false)}>{t('common.cancel')}</Button>
                        <Button htmlType="submit" type="danger" loading={pruning}>{t('common.confirm')}</Button>
                    </div>
                </Form>
            </Modal>

            {/* 详情 */}
            <SideSheet
                title={detail ? `${t('container.detail.title')} - ${detail.name}` : ''}
                visible={Boolean(detail)}
                onCancel={() => { setDetail(null); setInspectText(''); }}
                width={560}
            >
                {detail && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <Descriptions
                            row
                            size="small"
                            data={[
                                { key: 'ID', value: detail.containerID.slice(0, 12) },
                                { key: t('container.table.image'), value: detail.imageName },
                                { key: t('container.table.state'), value: detail.state },
                                { key: t('container.table.created'), value: detail.createTime },
                                { key: t('container.detail.runTime'), value: detail.runTime || '—' },
                                { key: t('container.detail.ports'), value: detail.ports?.join(', ') || '—' },
                            ]}
                        />
                        <Card title={t('container.detail.liveStats')} bodyStyle={{ padding: 12 }}>
                            {statsQuery2.data ? (
                                <Descriptions
                                    row
                                    size="small"
                                    data={[
                                        { key: t('container.table.cpu'), value: formatPercent(statsQuery2.data.cpuPercent) },
                                        { key: t('container.table.memory'), value: `${(statsQuery2.data.memory ?? 0).toFixed(1)} MB` },
                                        { key: t('container.detail.networkRX'), value: `${(statsQuery2.data.networkRX ?? 0).toFixed(2)}` },
                                        { key: t('container.detail.networkTX'), value: `${(statsQuery2.data.networkTX ?? 0).toFixed(2)}` },
                                        { key: t('container.detail.ioRead'), value: `${(statsQuery2.data.ioRead ?? 0).toFixed(2)}` },
                                        { key: t('container.detail.ioWrite'), value: `${(statsQuery2.data.ioWrite ?? 0).toFixed(2)}` },
                                    ]}
                                />
                            ) : (
                                <Text type="tertiary">{t('container.detail.noStats')}</Text>
                            )}
                        </Card>
                        {infoQuery.data && (
                            <Card title={t('container.detail.config')} bodyStyle={{ padding: 12 }}>
                                <Descriptions
                                    row
                                    size="small"
                                    data={[
                                        { key: t('container.detail.hostname'), value: String(infoQuery.data.hostname ?? '—') },
                                        { key: t('container.detail.workingDir'), value: String(infoQuery.data.workingDir ?? '—') },
                                        { key: t('container.detail.restartPolicy'), value: String(infoQuery.data.restartPolicy ?? '—') },
                                        { key: t('container.detail.user'), value: String(infoQuery.data.user ?? '—') },
                                    ]}
                                />
                            </Card>
                        )}
                        <div>
                            <Space>
                                <Button size="small" icon={<IconEdit />} onClick={openInspect}>{t('container.detail.inspect')}</Button>
                            </Space>
                            {inspectText && (
                                <pre
                                    style={{
                                        marginTop: 10,
                                        maxHeight: 320,
                                        overflow: 'auto',
                                        fontSize: 12,
                                        padding: 10,
                                        background: 'var(--semi-color-fill-0)',
                                        borderRadius: 6,
                                    }}
                                >
                                    {inspectText}
                                </pre>
                            )}
                        </div>
                    </div>
                )}
            </SideSheet>
        </div>
    );
}
