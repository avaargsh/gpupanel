import { useEffect, useState } from 'react';
import { Button, Descriptions, Input, Modal, Space, Switch, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useDeleteAgentMutation,
    useDeleteCheckAgentMutation,
    useGetAgentOverviewMutation,
    useResetAgentTokenMutation,
    useSearchAgentsQuery,
    useUpdateAgentRemarkMutation,
    useBindAgentWebsiteMutation,
    useUnbindAgentWebsiteMutation,
    type AgentItem,
} from '@/api/aiApi';
import { useInstalledOpMutation } from '@/api/appApi';
import { useDebouncedValue } from '@/pages/database/shared';
import AgentConfigModal from './agentSettings';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function statusColor(status: string) {
    switch ((status || '').toLowerCase()) {
        case 'running':
            return 'green';
        case 'error':
            return 'red';
        case 'stopped':
            return 'grey';
        default:
            return 'blue';
    }
}

function OverviewModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [load, { isLoading }] = useGetAgentOverviewMutation();
    const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        load({ agentId: row.id })
            .unwrap()
            .then((res) => setSnapshot((res?.snapshot as Record<string, unknown>) ?? {}))
            .catch(() => setSnapshot({}));
    }, [row.id, load]);

    const items: Array<[string, unknown]> = snapshot
        ? [
              [t('ai.agents.containerStatus'), snapshot.containerStatus],
              [t('ai.agents.appVersion'), snapshot.appVersion],
              [t('ai.agents.defaultModel'), snapshot.defaultModel],
              [t('ai.agents.channelCount'), snapshot.channelCount],
              [t('ai.agents.skillCount'), snapshot.skillCount],
              [t('ai.agents.jobCount'), snapshot.jobCount],
              [t('ai.agents.sessionCount'), snapshot.sessionCount],
          ]
        : [];

    return (
        <Modal title={`${t('ai.agents.overviewTitle')} · ${row.name}`} visible onCancel={onClose} footer={null} width={480}>
            {isLoading || !snapshot ? (
                <Text type="tertiary">{t('common.loading')}</Text>
            ) : (
                <Descriptions
                    row
                    data={items.map(([key, value]) => ({ key, value: value === undefined || value === null || value === '' ? '-' : String(value) }))}
                />
            )}
        </Modal>
    );
}

function RemarkModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [update, { isLoading }] = useUpdateAgentRemarkMutation();
    const [remark, setRemark] = useState(row.remark || '');

    const submit = async () => {
        try {
            await update({ id: row.id, remark }).unwrap();
            Toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('ai.table.remark')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={420}
        >
            <Input value={remark} onChange={setRemark} />
        </Modal>
    );
}

function BindModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [bind, { isLoading }] = useBindAgentWebsiteMutation();
    const [websiteId, setWebsiteId] = useState('');

    const submit = async () => {
        const id = Number(websiteId);
        if (!id) return Toast.warning(t('ai.agents.bindRequired'));
        try {
            await bind({ agentId: row.id, websiteId: id }).unwrap();
            Toast.success(t('ai.agents.bindDone'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('ai.agents.bindTitle')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={420}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text size="small" type="tertiary">{t('ai.agents.bindWebsiteId')}</Text>
                <Input type="number" value={websiteId} onChange={setWebsiteId} />
            </div>
        </Modal>
    );
}

function DeleteModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [check, { isLoading: checking }] = useDeleteCheckAgentMutation();
    const [remove, { isLoading: deleting }] = useDeleteAgentMutation();
    const [resources, setResources] = useState<Array<{ type: string; name: string }>>([]);
    const [force, setForce] = useState(false);

    useEffect(() => {
        check({ id: row.id })
            .unwrap()
            .then((res) => setResources(Array.isArray(res) ? res : []))
            .catch(() => setResources([]));
    }, [row.id, check]);

    const submit = async () => {
        try {
            await remove({ id: row.id, taskID: uuid(), forceDelete: force }).unwrap();
            Toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('ai.actions.delete')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            okButtonProps={{ type: 'danger' }}
            confirmLoading={checking || deleting}
            width={460}
        >
            <Text>{t('ai.agents.deleteConfirm', { name: row.name })}</Text>
            {resources.length > 0 && (
                <div style={{ marginTop: 10 }}>
                    <Text size="small" type="tertiary">{t('ai.table.remark')}</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {resources.map((r) => <Tag key={`${r.type}-${r.name}`} color="orange">{r.type}: {r.name}</Tag>)}
                    </div>
                </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                <Switch checked={force} onChange={setForce} size="small" />
                <Text size="small">{t('ai.actions.delete')} (force)</Text>
            </label>
        </Modal>
    );
}

export default function AgentsTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);

    const [overviewRow, setOverviewRow] = useState<AgentItem | null>(null);
    const [remarkRow, setRemarkRow] = useState<AgentItem | null>(null);
    const [bindRow, setBindRow] = useState<AgentItem | null>(null);
    const [deleteRow, setDeleteRow] = useState<AgentItem | null>(null);
    const [configRow, setConfigRow] = useState<AgentItem | null>(null);

    useEffect(() => {
        setPage(1);
    }, [name]);

    const listQuery = useSearchAgentsQuery({ page, pageSize, name });
    const rows = listQuery.data?.items ?? [];
    const [resetToken] = useResetAgentTokenMutation();
    const [unbind] = useUnbindAgentWebsiteMutation();
    const [installedOp] = useInstalledOpMutation();

    const typeLabel = (type: string) => {
        const map: Record<string, string> = { openclaw: 'ai.agents.types.openclaw', copaw: 'ai.agents.types.copaw', 'hermes-agent': 'ai.agents.types.hermes' };
        return map[type] ? t(map[type] as never) : type || '-';
    };

    const doOperate = (row: AgentItem, op: string) => {
        Modal.confirm({
            title: t(`ai.actions.${op}` as never),
            content: t('ai.agents.operateConfirm', { name: row.name, operate: t(`ai.actions.${op}` as never) }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    // 智能体容器操作复用「应用已安装」操作接口，installId 取 agent.appInstallId。
                    await installedOp({ installId: row.appInstallId, operate: op, taskID: uuid() }).unwrap();
                    Toast.success(t('common.confirm'));
                    listQuery.refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const onResetToken = (row: AgentItem) => {
        Modal.confirm({
            title: t('ai.actions.reset'),
            content: t('ai.agents.resetConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await resetToken({ id: row.id }).unwrap();
                    Toast.success(t('ai.agents.resetDone'));
                    listQuery.refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const onUnbind = (row: AgentItem) => {
        Modal.confirm({
            title: t('ai.actions.unbind'),
            content: t('ai.agents.unbindConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await unbind({ agentId: row.id }).unwrap();
                    Toast.success(t('common.confirm'));
                    listQuery.refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('ai.table.name'), dataIndex: 'name', key: 'name' },
        { title: t('ai.table.type'), dataIndex: 'agentType', key: 'agentType', width: 110, render: (v: string) => typeLabel(v) },
        {
            title: t('ai.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (v: string) => <Tag size="small" color={statusColor(v)}>{v || '-'}</Tag>,
        },
        { title: t('ai.table.version'), dataIndex: 'appVersion', key: 'appVersion', width: 100, render: (v: string) => v || '-' },
        { title: t('ai.table.model'), dataIndex: 'model', key: 'model', render: (v: string) => v || '-' },
        { title: t('ai.table.webui'), dataIndex: 'webUIPort', key: 'webUIPort', width: 100, render: (v: number) => v || '-' },
        {
            title: t('ai.table.remark'),
            dataIndex: 'remark',
            key: 'remark',
            render: (v: string) => v || '-',
        },
        {
            title: t('ai.table.operate'),
            key: 'operate',
            width: 380,
            render: (_: unknown, row: AgentItem) => (
                <Space wrap>
                    <Button size="small" theme="borderless" onClick={() => setOverviewRow(row)}>{t('ai.agents.overview')}</Button>
                    <Button size="small" theme="borderless" onClick={() => setConfigRow(row)}>{t('ai.agents.config')}</Button>
                    <Button size="small" theme="borderless" onClick={() => doOperate(row, 'start')}>{t('ai.actions.start')}</Button>
                    <Button size="small" theme="borderless" onClick={() => doOperate(row, 'stop')}>{t('ai.actions.stop')}</Button>
                    <Button size="small" theme="borderless" onClick={() => doOperate(row, 'restart')}>{t('ai.actions.restart')}</Button>
                    <Button size="small" theme="borderless" onClick={() => setRemarkRow(row)}>{t('ai.table.remark')}</Button>
                    <Button size="small" theme="borderless" onClick={() => onResetToken(row)}>{t('ai.actions.reset')}</Button>
                    {row.websiteId ? (
                        <Button size="small" theme="borderless" onClick={() => onUnbind(row)}>{t('ai.actions.unbind')}</Button>
                    ) : (
                        <Button size="small" theme="borderless" onClick={() => setBindRow(row)}>{t('ai.actions.bind')}</Button>
                    )}
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRow(row)}>{t('ai.actions.delete')}</Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('ai.agents.searchPlaceholder')}
                    value={nameInput}
                    onChange={setNameInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>{t('ai.actions.refresh')}</Button>
                <Text type="tertiary" size="small">{t('ai.agents.deferred')}</Text>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={listQuery.isLoading}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: listQuery.data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                    pageSizeOpts: [10, 20, 50],
                }}
                empty={<Text type="tertiary">{t('ai.agents.empty')}</Text>}
            />

            {overviewRow && <OverviewModal row={overviewRow} onClose={() => setOverviewRow(null)} />}
            {configRow && <AgentConfigModal agentId={configRow.id} name={configRow.name} onClose={() => setConfigRow(null)} />}
            {remarkRow && <RemarkModal row={remarkRow} onClose={() => setRemarkRow(null)} />}
            {bindRow && <BindModal row={bindRow} onClose={() => setBindRow(null)} />}
            {deleteRow && <DeleteModal row={deleteRow} onClose={() => setDeleteRow(null)} />}
        </div>
    );
}
