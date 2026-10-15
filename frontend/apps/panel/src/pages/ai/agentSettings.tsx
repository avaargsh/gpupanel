import { useEffect, useState } from 'react';
import {
    Button,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Switch,
    TabPane,
    Table,
    Tabs,
    TextArea,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useGetAccountModelsQuery,
    useGetAgentConfigFileQuery,
    useGetAgentModelConfigQuery,
    useGetAgentOtherConfigQuery,
    useGetAgentSecurityConfigQuery,
    useSearchAccountsQuery,
    useUpdateAgentConfigFileMutation,
    useUpdateAgentModelConfigMutation,
    useUpdateAgentOtherConfigMutation,
    useUpdateAgentSecurityConfigMutation,
    type AgentModelMetadata,
} from '@/api/aiApi';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);
const INPUT_MODES = ['auto', 'text', 'image'];

const splitLines = (text: string) =>
    text
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);

/** 模型配置页签：账户 / 默认模型 / 备用模型 / 模型元数据。 */
function ModelTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data, isLoading } = useGetAgentModelConfigQuery(agentId);
    const { data: accountPage } = useSearchAccountsQuery({ page: 1, pageSize: 200, provider: '', apiType: '', name: '' });
    const accounts = accountPage?.items ?? [];

    const [accountId, setAccountId] = useState<number | undefined>();
    const [model, setModel] = useState('');
    const [fallbacks, setFallbacks] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<AgentModelMetadata[]>([]);

    useEffect(() => {
        if (!data) return;
        setAccountId(data.accountId || undefined);
        setModel(data.model || '');
        setFallbacks(data.fallbacks ?? []);
        setMetadata(data.metadata ?? []);
    }, [data]);

    const { data: models } = useGetAccountModelsQuery(accountId as number, { skip: !accountId });
    const modelOptions = (models ?? []).map((m) => ({ label: m.name, value: m.name }));

    const [update, { isLoading: saving }] = useUpdateAgentModelConfigMutation();

    const addMetadata = () => setMetadata((rows) => [...rows, { model: '', inputMode: 'auto', contextWindow: 0, maxTokens: 0 }]);
    const patchMetadata = (index: number, patch: Partial<AgentModelMetadata>) =>
        setMetadata((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    const removeMetadata = (index: number) => setMetadata((rows) => rows.filter((_, i) => i !== index));

    const submit = async () => {
        if (!accountId || !model) return Toast.warning(t('ai.agents.model.modelRequired'));
        try {
            await update({ agentId, accountId, model, fallbacks, metadata: metadata.filter((m) => m.model) }).unwrap();
            Toast.success(t('ai.agents.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        {
            title: t('ai.agents.model.model'),
            key: 'model',
            render: (_: unknown, row: AgentModelMetadata, index: number) => (
                <Input value={row.model} onChange={(v) => patchMetadata(index, { model: v })} placeholder="gpt-4o" />
            ),
        },
        {
            title: t('ai.agents.model.inputMode'),
            key: 'inputMode',
            width: 130,
            render: (_: unknown, row: AgentModelMetadata, index: number) => (
                <Select
                    value={row.inputMode}
                    onChange={(v) => patchMetadata(index, { inputMode: v as AgentModelMetadata['inputMode'] })}
                    style={{ width: '100%' }}
                    optionList={INPUT_MODES.map((m) => ({ label: t(`ai.agents.model.mode.${m}`), value: m }))}
                />
            ),
        },
        {
            title: t('ai.agents.model.contextWindow'),
            key: 'contextWindow',
            width: 130,
            render: (_: unknown, row: AgentModelMetadata, index: number) => (
                <InputNumber
                    value={row.contextWindow}
                    min={0}
                    onChange={(v) => patchMetadata(index, { contextWindow: Number(v) || 0 })}
                />
            ),
        },
        {
            title: t('ai.agents.model.maxTokens'),
            key: 'maxTokens',
            width: 130,
            render: (_: unknown, row: AgentModelMetadata, index: number) => (
                <InputNumber value={row.maxTokens} min={0} onChange={(v) => patchMetadata(index, { maxTokens: Number(v) || 0 })} />
            ),
        },
        {
            title: '',
            key: 'operate',
            width: 70,
            render: (_: unknown, __: AgentModelMetadata, index: number) => (
                <Button size="small" theme="borderless" type="danger" onClick={() => removeMetadata(index)}>
                    {t('common.delete')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <Text size="small" type="tertiary">
                    {t('ai.agents.model.account')}
                </Text>
                <Select
                    value={accountId}
                    onChange={(v) => {
                        setAccountId(v as number);
                        setModel('');
                        setFallbacks([]);
                    }}
                    style={{ width: '100%' }}
                    placeholder={t('ai.agents.model.account')}
                    optionList={accounts.map((a) => ({ label: `${a.name} (${a.providerName || a.provider})`, value: a.id }))}
                />
            </div>
            <div>
                <Text size="small" type="tertiary">
                    {t('ai.agents.model.model')}
                </Text>
                <Select
                    value={model}
                    onChange={(v) => setModel(v as string)}
                    style={{ width: '100%' }}
                    placeholder={t('ai.agents.model.model')}
                    optionList={modelOptions}
                />
            </div>
            <div>
                <Text size="small" type="tertiary">
                    {t('ai.agents.model.fallbacks')}
                </Text>
                <Select
                    multiple
                    value={fallbacks}
                    onChange={(v) => setFallbacks((v as string[]) ?? [])}
                    style={{ width: '100%' }}
                    placeholder={t('ai.agents.model.fallbacks')}
                    optionList={modelOptions}
                />
            </div>
            <div>
                <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Text size="small" type="tertiary">
                        {t('ai.agents.model.metadata')}
                    </Text>
                    <Button size="small" onClick={addMetadata}>
                        {t('ai.agents.model.addMetadata')}
                    </Button>
                </Space>
                <Table
                    style={{ marginTop: 6 }}
                    columns={columns}
                    dataSource={metadata}
                    pagination={false}
                    rowKey={(row) => `${row?.model}-${row?.contextWindow}-${row?.maxTokens}`}
                    empty={<Text type="tertiary">{t('ai.agents.model.empty')}</Text>}
                />
            </div>
            <div style={{ textAlign: 'right' }}>
                <Button theme="solid" loading={saving || isLoading} onClick={submit}>
                    {t('ai.agents.save')}
                </Button>
            </div>
        </div>
    );
}

/** 安全配置页签：允许来源（每行一个）。 */
function SecurityTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data } = useGetAgentSecurityConfigQuery(agentId);
    const [origins, setOrigins] = useState('');
    const [update, { isLoading }] = useUpdateAgentSecurityConfigMutation();

    useEffect(() => {
        setOrigins((data?.allowedOrigins ?? []).join('\n'));
    }, [data]);

    const submit = async () => {
        try {
            await update({ agentId, allowedOrigins: splitLines(origins) }).unwrap();
            Toast.success(t('ai.agents.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text size="small" type="tertiary">
                {t('ai.agents.security.helper')}
            </Text>
            <TextArea value={origins} onChange={setOrigins} rows={6} placeholder="https://example.com" />
            <div style={{ textAlign: 'right' }}>
                <Button theme="solid" loading={isLoading} onClick={submit}>
                    {t('ai.agents.save')}
                </Button>
            </div>
        </div>
    );
}

/** 其他配置页签。 */
function OtherTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data } = useGetAgentOtherConfigQuery(agentId);
    const [form, setForm] = useState({
        userTimezone: '',
        browserEnabled: false,
        npmRegistry: '',
        dashboardUsername: '',
        dashboardPassword: '',
    });

    useEffect(() => {
        if (!data) return;
        setForm({
            userTimezone: data.userTimezone || '',
            browserEnabled: !!data.browserEnabled,
            npmRegistry: data.npmRegistry || '',
            dashboardUsername: data.dashboardUsername || '',
            dashboardPassword: data.dashboardPassword || '',
        });
    }, [data]);

    const [update, { isLoading }] = useUpdateAgentOtherConfigMutation();

    const submit = async () => {
        try {
            await update({ agentId, ...form }).unwrap();
            Toast.success(t('ai.agents.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const field = (label: string, value: string, onChange: (v: string) => void, password = false) => (
        <div>
            <Text size="small" type="tertiary">
                {label}
            </Text>
            <Input value={value} mode={password ? 'password' : undefined} onChange={onChange} />
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {field(t('ai.agents.other.userTimezone'), form.userTimezone, (v) => setForm((f) => ({ ...f, userTimezone: v })))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch checked={form.browserEnabled} onChange={(v) => setForm((f) => ({ ...f, browserEnabled: Boolean(v) }))} />
                <Text size="small">{t('ai.agents.other.browserEnabled')}</Text>
            </label>
            {field(t('ai.agents.other.npmRegistry'), form.npmRegistry, (v) => setForm((f) => ({ ...f, npmRegistry: v })))}
            {field(t('ai.agents.other.dashboardUsername'), form.dashboardUsername, (v) =>
                setForm((f) => ({ ...f, dashboardUsername: v })),
            )}
            {field(
                t('ai.agents.other.dashboardPassword'),
                form.dashboardPassword,
                (v) => setForm((f) => ({ ...f, dashboardPassword: v })),
                true,
            )}
            <div style={{ textAlign: 'right' }}>
                <Button theme="solid" loading={isLoading} onClick={submit}>
                    {t('ai.agents.save')}
                </Button>
            </div>
        </div>
    );
}

/** 配置文件页签：直接编辑原始配置文本。 */
function ConfigFileTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data, isLoading } = useGetAgentConfigFileQuery(agentId);
    const [content, setContent] = useState('');
    const [update, { isLoading: saving }] = useUpdateAgentConfigFileMutation();

    useEffect(() => {
        if (data) setContent(data.content ?? '');
    }, [data]);

    const submit = async () => {
        try {
            await update({ agentId, content }).unwrap();
            Toast.success(t('ai.agents.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text size="small" type="tertiary">
                {t('ai.agents.configFile.helper')}
            </Text>
            <TextArea
                value={content}
                onChange={setContent}
                autosize={{ minRows: 12, maxRows: 24 }}
                placeholder={isLoading ? t('common.loading') : t('ai.agents.configFile.empty')}
                style={{ fontFamily: 'monospace' }}
            />
            <div style={{ textAlign: 'right' }}>
                <Button theme="solid" loading={saving} onClick={submit}>
                    {t('ai.agents.save')}
                </Button>
            </div>
        </div>
    );
}

/** 智能体设置弹窗：模型 / 安全 / 其他 / 配置文件四个页签。 */
export default function AgentConfigModal({ agentId, name, onClose }: { agentId: number; name: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('model');

    return (
        <Modal title={`${t('ai.agents.configTitle')} · ${name}`} visible onCancel={onClose} footer={null} width={760}>
            <Tabs type="line" activeKey={tab} onChange={(k) => setTab(String(k))}>
                <TabPane tab={t('ai.agents.tabs.model')} itemKey="model">
                    <ModelTab agentId={agentId} />
                </TabPane>
                <TabPane tab={t('ai.agents.tabs.security')} itemKey="security">
                    <SecurityTab agentId={agentId} />
                </TabPane>
                <TabPane tab={t('ai.agents.tabs.other')} itemKey="other">
                    <OtherTab agentId={agentId} />
                </TabPane>
                <TabPane tab={t('ai.agents.tabs.configFile')} itemKey="configFile">
                    <ConfigFileTab agentId={agentId} />
                </TabPane>
            </Tabs>
        </Modal>
    );
}
