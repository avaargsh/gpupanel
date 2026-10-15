import { useEffect, useState, type ReactNode } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useBindMcpDomainMutation,
    useCreateMcpServerMutation,
    useDeleteMcpServerMutation,
    useGetMcpDomainQuery,
    useOperateMcpServerMutation,
    usePageMcpServersQuery,
    useSyncMcpStatusMutation,
    useTestMcpConnectionMutation,
    useUpdateMcpDomainMutation,
    useUpdateMcpServerMutation,
    type McpServer,
} from '@/api/aiApi';
import { useDebouncedValue } from '@/pages/database/shared';

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

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text size="small" type="tertiary">{label}</Text>
            {children}
        </div>
    );
}

interface McpForm {
    id?: number;
    name: string;
    type: string;
    command: string;
    port: number;
    containerName: string;
    baseUrl: string;
    ssePath: string;
    streamableHttpPath: string;
    outputTransport: string;
    hostIP: string;
    protocolVersion: string;
    gatewayImage: string;
    gatewayArgs: string;
}

const emptyForm = (): McpForm => ({
    name: '',
    type: 'npx',
    command: '',
    port: 8000,
    containerName: '',
    baseUrl: '',
    ssePath: '',
    streamableHttpPath: '/mcp',
    outputTransport: 'streamableHttp',
    hostIP: '127.0.0.1',
    protocolVersion: '',
    gatewayImage: '',
    gatewayArgs: '',
});

function McpFormModal({ row, onClose }: { row: McpServer | null; onClose: () => void }) {
    const { t } = useTranslation();
    const [form, setForm] = useState<McpForm>(() =>
        row
            ? {
                  id: row.id,
                  name: row.name,
                  type: row.type,
                  command: row.command,
                  port: row.port,
                  containerName: row.containerName,
                  baseUrl: row.baseUrl,
                  ssePath: row.ssePath,
                  streamableHttpPath: row.streamableHttpPath,
                  outputTransport: row.outputTransport,
                  hostIP: row.hostIP,
                  protocolVersion: row.protocolVersion,
                  gatewayImage: row.gatewayImage,
                  gatewayArgs: row.gatewayArgs,
              }
            : emptyForm(),
    );
    const [create, { isLoading: creating }] = useCreateMcpServerMutation();
    const [update, { isLoading: updating }] = useUpdateMcpServerMutation();
    const set = <K extends keyof McpForm>(key: K, value: McpForm[K]) => setForm((s) => ({ ...s, [key]: value }));

    const submit = async () => {
        if (!form.name.trim()) return Toast.warning(t('ai.mcp.form.nameRequired'));
        const payload = { ...form, taskID: uuid() };
        try {
            if (form.id) {
                await update(payload).unwrap();
            } else {
                await create(payload).unwrap();
            }
            Toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={row ? t('ai.mcp.edit') : t('ai.mcp.create')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={creating || updating}
            width={560}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label={t('ai.mcp.form.name')}>
                    <Input value={form.name} disabled={!!row} onChange={(v) => set('name', v)} />
                </Field>
                <Field label={t('ai.mcp.form.type')}>
                    <Select
                        value={form.type}
                        onChange={(v) => set('type', String(v))}
                        style={{ width: '100%' }}
                        optionList={[
                            { label: 'npx', value: 'npx' },
                            { label: 'uvx', value: 'uvx' },
                        ]}
                    />
                </Field>
                <Field label={t('ai.mcp.form.command')}>
                    <Input value={form.command} onChange={(v) => set('command', v)} />
                </Field>
                <Field label={t('ai.mcp.form.port')}>
                    <Input type="number" value={String(form.port)} onChange={(v) => set('port', Number(v) || 0)} />
                </Field>
                <Field label={t('ai.mcp.form.baseUrl')}>
                    <Input value={form.baseUrl} onChange={(v) => set('baseUrl', v)} placeholder="https://example.com" />
                </Field>
                <Field label={t('ai.mcp.form.outputTransport')}>
                    <Select
                        value={form.outputTransport}
                        onChange={(v) => set('outputTransport', String(v))}
                        style={{ width: '100%' }}
                        optionList={[
                            { label: 'streamableHttp', value: 'streamableHttp' },
                            { label: 'sse', value: 'sse' },
                        ]}
                    />
                </Field>
                <Field label={t('ai.mcp.form.streamableHttpPath')}>
                    <Input value={form.streamableHttpPath} onChange={(v) => set('streamableHttpPath', v)} />
                </Field>
                <Field label={t('ai.mcp.form.ssePath')}>
                    <Input value={form.ssePath} onChange={(v) => set('ssePath', v)} />
                </Field>
                <Field label={t('ai.mcp.form.containerName')}>
                    <Input value={form.containerName} onChange={(v) => set('containerName', v)} />
                </Field>
                <Field label={t('ai.mcp.form.protocolVersion')}>
                    <Input value={form.protocolVersion} onChange={(v) => set('protocolVersion', v)} />
                </Field>
                <Field label={t('ai.mcp.form.gatewayImage')}>
                    <Input value={form.gatewayImage} onChange={(v) => set('gatewayImage', v)} />
                </Field>
                <Field label={t('ai.mcp.form.gatewayArgs')}>
                    <Input value={form.gatewayArgs} onChange={(v) => set('gatewayArgs', v)} />
                </Field>
            </div>
        </Modal>
    );
}

function DomainModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const { data, isLoading } = useGetMcpDomainQuery();
    const [bind, { isLoading: binding }] = useBindMcpDomainMutation();
    const [update, { isLoading: updating }] = useUpdateMcpDomainMutation();
    const [domain, setDomain] = useState('');
    const [sslID, setSslId] = useState(0);
    const [ipList, setIpList] = useState('');
    const bound = !!data?.websiteID;

    useEffect(() => {
        if (!data) return;
        setDomain(data.domain || '');
        setSslId(data.sslID || 0);
        setIpList((data.allowIPs || []).join(','));
    }, [data]);

    const submit = async () => {
        if (!bound && !domain.trim()) return Toast.warning(t('ai.mcp.domainRequired'));
        try {
            if (bound) {
                await update({ websiteID: data!.websiteID as number, sslID, ipList }).unwrap();
            } else {
                await bind({ domain, sslID, ipList }).unwrap();
            }
            Toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('ai.mcp.bindDomain')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={binding || updating}
            width={480}
        >
            {isLoading ? (
                <Text type="tertiary">{t('common.loading')}</Text>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {bound ? (
                        <Text size="small" type="tertiary">{t('ai.mcp.domainBound', { domain: data?.domain })}</Text>
                    ) : (
                        <Field label={t('ai.mcp.bindDomain')}>
                            <Input value={domain} onChange={setDomain} placeholder={t('ai.mcp.domainPlaceholder')} />
                        </Field>
                    )}
                    <Field label="sslID">
                        <Input type="number" value={String(sslID)} onChange={(v) => setSslId(Number(v) || 0)} />
                    </Field>
                    <Field label="IP">
                        <Input value={ipList} onChange={setIpList} placeholder="1.2.3.4,5.6.7.8" />
                    </Field>
                </div>
            )}
        </Modal>
    );
}

export default function McpTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [formRow, setFormRow] = useState<McpServer | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [showDomain, setShowDomain] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [name]);

    const listQuery = usePageMcpServersQuery({ page, pageSize, name });
    const rows = listQuery.data?.items ?? [];
    const [operate] = useOperateMcpServerMutation();
    const [remove] = useDeleteMcpServerMutation();
    const [syncStatus] = useSyncMcpStatusMutation();
    const [test] = useTestMcpConnectionMutation();

    const onRefresh = async () => {
        const ids = rows.map((r) => r.id);
        if (ids.length) {
            try {
                await syncStatus({ ids }).unwrap();
            } catch {
                /* ignore sync errors */
            }
        }
        listQuery.refetch();
    };

    const doOperate = (row: McpServer, op: string) => {
        Modal.confirm({
            title: t(`ai.actions.${op}` as never),
            content: t('ai.mcp.operateConfirm', { name: row.name, operate: t(`ai.actions.${op}` as never) }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await operate({ id: row.id, operate: op }).unwrap();
                    Toast.success(t('common.confirm'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const onTest = async (row: McpServer) => {
        try {
            const res = await test({ id: row.id }).unwrap();
            if (res?.success) Toast.success(`${t('ai.mcp.testSuccess')}${res.message ? `: ${res.message}` : ''}`);
            else Toast.error(`${t('ai.mcp.testFailed')}${res?.message ? `: ${res.message}` : ''}`);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onDelete = (row: McpServer) => {
        Modal.confirm({
            title: t('ai.actions.delete'),
            content: t('ai.mcp.deleteConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await remove({ id: row.id }).unwrap();
                    Toast.success(t('common.confirm'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('ai.table.name'), dataIndex: 'name', key: 'name' },
        {
            title: t('ai.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (v: string) => <Tag size="small" color={statusColor(v)}>{v || '-'}</Tag>,
        },
        { title: t('ai.table.type'), dataIndex: 'type', key: 'type', width: 90, render: (v: string) => v || '-' },
        { title: t('ai.table.port'), dataIndex: 'port', key: 'port', width: 90 },
        {
            title: t('ai.table.address'),
            key: 'address',
            ellipsis: true,
            render: (_: unknown, row: McpServer) => row.url || row.baseUrl || '-',
        },
        {
            title: t('ai.table.operate'),
            key: 'operate',
            width: 340,
            render: (_: unknown, row: McpServer) => (
                <Space>
                    <Button size="small" theme="borderless" onClick={() => { setFormRow(row); setShowForm(true); }}>
                        {t('ai.actions.edit')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => doOperate(row, 'start')}>{t('ai.actions.start')}</Button>
                    <Button size="small" theme="borderless" onClick={() => doOperate(row, 'stop')}>{t('ai.actions.stop')}</Button>
                    <Button size="small" theme="borderless" onClick={() => doOperate(row, 'restart')}>{t('ai.actions.restart')}</Button>
                    <Button size="small" theme="borderless" onClick={() => onTest(row)}>{t('ai.actions.test')}</Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => onDelete(row)}>{t('ai.actions.delete')}</Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('ai.mcp.searchPlaceholder')}
                    value={nameInput}
                    onChange={setNameInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Button icon={<IconPlus />} theme="solid" type="primary" onClick={() => { setFormRow(null); setShowForm(true); }}>
                    {t('ai.mcp.create')}
                </Button>
                <Button onClick={() => setShowDomain(true)}>{t('ai.mcp.bindDomain')}</Button>
                <Button icon={<IconRefresh />} onClick={onRefresh}>{t('ai.actions.refresh')}</Button>
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
                empty={<Text type="tertiary">{t('ai.mcp.empty')}</Text>}
            />

            {showForm && <McpFormModal row={formRow} onClose={() => setShowForm(false)} />}
            {showDomain && <DomainModal onClose={() => setShowDomain(false)} />}
        </div>
    );
}
