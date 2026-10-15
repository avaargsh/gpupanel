import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Input, Modal, Select, SideSheet, Space, Switch, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateAccountModelMutation,
    useCreateAccountMutation,
    useDeleteAccountModelMutation,
    useDeleteAccountMutation,
    useDiscoverAccountModelsMutation,
    useGetAccountModelsQuery,
    useGetAgentProvidersQuery,
    useSearchAccountsQuery,
    useUpdateAccountMutation,
    type AccountItem,
    type AccountModel,
    type ProviderApiInfo,
    type ProviderInfo,
} from '@/api/aiApi';
import { useDebouncedValue } from '@/pages/database/shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

function providerApiInfo(provider: ProviderInfo | undefined, apiType: string): ProviderApiInfo | undefined {
    if (!provider) return undefined;
    return provider.apiTypes.find((a) => a.apiType === apiType) ?? provider.apiTypes[0];
}

interface FormState {
    id?: number;
    provider: string;
    apiType: string;
    baseUrl: string;
    name: string;
    apiKey: string;
    authMode: string;
    verifyModel: string;
    remark: string;
    remember: boolean;
    validate: boolean;
}

const emptyForm = (): FormState => ({
    provider: '',
    apiType: '',
    baseUrl: '',
    name: '',
    apiKey: '',
    authMode: '',
    verifyModel: '',
    remark: '',
    remember: true,
    validate: true,
});

function AccountForm({ account, providers, onClose }: { account: AccountItem | null; providers: ProviderInfo[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [form, setForm] = useState<FormState>(() =>
        account
            ? {
                  id: account.id,
                  provider: account.provider,
                  apiType: account.apiType,
                  baseUrl: account.baseUrl,
                  name: account.name,
                  apiKey: account.apiKey,
                  authMode: account.authMode,
                  verifyModel: account.verifyModel,
                  remark: account.remark,
                  remember: account.rememberApiKey,
                  validate: false,
              }
            : emptyForm(),
    );
    const [create, { isLoading: creating }] = useCreateAccountMutation();
    const [update, { isLoading: updating }] = useUpdateAccountMutation();

    const provider = providers.find((p) => p.provider === form.provider);
    const api = providerApiInfo(provider, form.apiType);
    const authModes = api?.authModes ?? [];
    const models = api?.models ?? provider?.models ?? [];

    const onProviderChange = (p: string) => {
        const target = providers.find((item) => item.provider === p);
        const nextApi = target ? (target.apiTypes.find((a) => a.apiType === target.defaultApiType) ?? target.apiTypes[0]) : undefined;
        setForm((s) => ({
            ...s,
            provider: p,
            apiType: nextApi?.apiType ?? '',
            baseUrl: nextApi?.baseUrl ?? target?.baseUrl ?? '',
            authMode: nextApi?.defaultAuthMode ?? '',
            verifyModel: (nextApi?.models ?? target?.models ?? [])[0]?.id ?? '',
        }));
    };

    const onApiTypeChange = (apiType: string) => {
        const nextApi = providerApiInfo(provider, apiType);
        setForm((s) => ({
            ...s,
            apiType,
            baseUrl: nextApi?.baseUrl ?? s.baseUrl,
            authMode: nextApi?.defaultAuthMode ?? s.authMode,
            verifyModel: (nextApi?.models ?? [])[0]?.id ?? '',
        }));
    };

    const submit = async () => {
        if (!form.name.trim()) return Toast.warning(t('ai.accounts.form.nameRequired'));
        if (!form.apiKey.trim()) return Toast.warning(t('ai.accounts.form.apiKeyRequired'));
        const payload = {
            provider: form.provider,
            name: form.name,
            apiKey: form.apiKey,
            rememberApiKey: form.remember,
            baseURL: form.baseUrl,
            apiType: form.apiType,
            authMode: form.authMode,
            verifyModel: form.verifyModel,
            validateAvailability: form.validate,
            remark: form.remark,
        };
        try {
            if (form.id) {
                await update({ id: form.id, ...payload, syncAgents: false }).unwrap();
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
            title={account ? t('ai.accounts.form.titleEdit') : t('ai.accounts.form.titleCreate')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={creating || updating}
            width={520}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Field label={t('ai.accounts.form.provider')}>
                    <Select
                        value={form.provider || undefined}
                        onChange={(v) => onProviderChange(String(v))}
                        style={{ width: '100%' }}
                        placeholder={t('ai.accounts.form.provider')}
                        optionList={providers.map((p) => ({ label: p.displayName || p.provider, value: p.provider }))}
                    />
                </Field>
                <Field label={t('ai.accounts.form.apiType')}>
                    <Select
                        value={form.apiType || undefined}
                        onChange={(v) => onApiTypeChange(String(v))}
                        style={{ width: '100%' }}
                        placeholder={t('ai.accounts.form.apiType')}
                        optionList={(provider?.apiTypes ?? []).map((a) => ({ label: a.apiType, value: a.apiType }))}
                    />
                </Field>
                <Field label={t('ai.accounts.form.baseUrl')}>
                    <Input value={form.baseUrl} onChange={(v) => setForm((s) => ({ ...s, baseUrl: v }))} disabled={!api?.editableBaseUrl && account != null} />
                </Field>
                <Field label={t('ai.accounts.form.name')}>
                    <Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
                </Field>
                <Field label={t('ai.accounts.form.apiKey')}>
                    <Input mode="password" value={form.apiKey} onChange={(v) => setForm((s) => ({ ...s, apiKey: v }))} />
                </Field>
                {authModes.length > 0 && (
                    <Field label={t('ai.accounts.form.authMode')}>
                        <Select
                            value={form.authMode || undefined}
                            onChange={(v) => setForm((s) => ({ ...s, authMode: String(v) }))}
                            style={{ width: '100%' }}
                            optionList={authModes.map((m) => ({ label: m, value: m }))}
                        />
                    </Field>
                )}
                {models.length > 0 && (
                    <Field label={t('ai.accounts.form.verifyModel')}>
                        <Select
                            value={form.verifyModel || undefined}
                            onChange={(v) => setForm((s) => ({ ...s, verifyModel: String(v) }))}
                            style={{ width: '100%' }}
                            filter
                            optionList={models.map((m) => ({ label: m.name || m.id, value: m.id }))}
                        />
                    </Field>
                )}
                <Field label={t('ai.accounts.form.remark')}>
                    <Input value={form.remark} onChange={(v) => setForm((s) => ({ ...s, remark: v }))} />
                </Field>
                <SwitchLine checked={form.remember} onChange={(v) => setForm((s) => ({ ...s, remember: v }))} label={t('ai.accounts.form.remember')} />
                {!account && (
                    <SwitchLine checked={form.validate} onChange={(v) => setForm((s) => ({ ...s, validate: v }))} label={t('ai.accounts.form.validate')} />
                )}
            </div>
        </Modal>
    );
}

function ModelPoolSheet({ account, onClose }: { account: AccountItem; onClose: () => void }) {
    const { t } = useTranslation();
    const { data: models = [], isLoading, refetch } = useGetAccountModelsQuery(account.id);
    const [discover, { isLoading: discovering }] = useDiscoverAccountModelsMutation();
    const [createModel, { isLoading: creating }] = useCreateAccountModelMutation();
    const [deleteModel] = useDeleteAccountModelMutation();
    const [addId, setAddId] = useState('');
    const [addName, setAddName] = useState('');

    const onDiscover = async () => {
        try {
            const res = await discover({ provider: account.provider, baseURL: account.baseUrl, apiKey: account.apiKey, apiType: account.apiType }).unwrap();
            Toast.success(t('ai.accounts.models.discovered', { count: res?.length ?? 0 }));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onAdd = async () => {
        if (!addId.trim()) return Toast.warning(t('ai.accounts.models.addRequired'));
        try {
            await createModel({ accountId: account.id, model: { recordId: 0, id: addId, name: addName || addId } }).unwrap();
            setAddId('');
            setAddName('');
            refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onDelete = (m: AccountModel) => {
        Modal.confirm({
            title: t('ai.actions.delete'),
            content: t('ai.accounts.models.deleteConfirm', { name: m.name || m.id }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await deleteModel({ accountId: account.id, recordId: m.recordId }).unwrap();
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('ai.accounts.models.id'), dataIndex: 'id', key: 'id' },
        { title: t('ai.accounts.models.name'), dataIndex: 'name', key: 'name', render: (v: string) => v || '-' },
        {
            title: t('ai.table.operate'),
            key: 'operate',
            width: 100,
            render: (_: unknown, row: AccountModel) => (
                <Button type="danger" theme="borderless" size="small" icon={<IconDelete />} onClick={() => onDelete(row)} />
            ),
        },
    ];

    return (
        <SideSheet title={`${t('ai.accounts.models.title')} · ${account.name}`} visible width={560} onCancel={onClose} placement="right">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Space wrap>
                    <Input value={addId} onChange={setAddId} placeholder={t('ai.accounts.models.id')} style={{ width: 180 }} />
                    <Input value={addName} onChange={setAddName} placeholder={t('ai.accounts.models.name')} style={{ width: 180 }} />
                    <Button icon={<IconPlus />} loading={creating} onClick={onAdd}>
                        {t('ai.accounts.models.add')}
                    </Button>
                    <Button icon={<IconSearch />} loading={discovering} onClick={onDiscover}>
                        {t('ai.accounts.models.discover')}
                    </Button>
                </Space>
                <Table
                    rowKey="recordId"
                    columns={columns}
                    dataSource={models}
                    loading={isLoading}
                    pagination={false}
                    empty={<Text type="tertiary">{t('ai.accounts.models.empty')}</Text>}
                />
            </div>
        </SideSheet>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text size="small" type="tertiary">{label}</Text>
            {children}
        </div>
    );
}

function SwitchLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Switch checked={checked} onChange={onChange} size="small" />
            <Text size="small">{label}</Text>
        </label>
    );
}

export default function AccountsTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [apiType, setApiType] = useState('');
    const [formAccount, setFormAccount] = useState<AccountItem | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [poolAccount, setPoolAccount] = useState<AccountItem | null>(null);

    useEffect(() => {
        setPage(1);
    }, [name, apiType]);

    const { data: providers = [] } = useGetAgentProvidersQuery();
    const listQuery = useSearchAccountsQuery({ page, pageSize, provider: '', apiType: apiType || undefined, name });
    const rows = listQuery.data?.items ?? [];
    const [deleteAccount] = useDeleteAccountMutation();

    const apiTypes = useMemo(() => {
        const set = new Set<string>();
        providers.forEach((p) => p.apiTypes.forEach((a) => set.add(a.apiType)));
        return Array.from(set);
    }, [providers]);

    const onDelete = (row: AccountItem) => {
        Modal.confirm({
            title: t('ai.actions.delete'),
            content: t('ai.accounts.deleteConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await deleteAccount({ id: row.id }).unwrap();
                    Toast.success(t('common.confirm'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('ai.table.name'), dataIndex: 'name', key: 'name' },
        { title: t('ai.table.provider'), dataIndex: 'providerName', key: 'providerName', render: (v: string, row: AccountItem) => v || row.provider },
        { title: t('ai.table.apiType'), dataIndex: 'apiType', key: 'apiType', width: 110, render: (v: string) => <Tag size="small">{v || '-'}</Tag> },
        { title: t('ai.table.baseUrl'), dataIndex: 'baseUrl', key: 'baseUrl', ellipsis: true },
        { title: t('ai.table.apiKey'), dataIndex: 'apiKey', key: 'apiKey', width: 140, render: (v: string) => (v ? `${v.slice(0, 4)}****${v.slice(-4)}` : '-') },
        {
            title: t('ai.table.verified'),
            dataIndex: 'verified',
            key: 'verified',
            width: 100,
            render: (v: boolean, row: AccountItem) =>
                row.verifyModel === '' ? (
                    <Tag size="small" color="grey">{t('ai.accounts.verifySkipped')}</Tag>
                ) : v ? (
                    <Tag size="small" color="green">{t('ai.accounts.verified')}</Tag>
                ) : (
                    <Tag size="small" color="orange">{t('ai.accounts.unverified')}</Tag>
                ),
        },
        {
            title: t('ai.table.operate'),
            key: 'operate',
            width: 220,
            render: (_: unknown, row: AccountItem) => (
                <Space>
                    <Button
                        size="small"
                        theme="borderless"
                        onClick={() => {
                            setFormAccount(row);
                            setShowForm(true);
                        }}
                    >
                        {t('ai.actions.edit')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => setPoolAccount(row)}>
                        {t('ai.actions.models')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => onDelete(row)}>
                        {t('ai.actions.delete')}
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
                    placeholder={t('ai.accounts.searchPlaceholder')}
                    value={nameInput}
                    onChange={setNameInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Select
                    value={apiType || undefined}
                    onChange={(v) => setApiType(v ? String(v) : '')}
                    placeholder={t('ai.accounts.apiTypePlaceholder')}
                    style={{ width: 160 }}
                    showClear
                    optionList={apiTypes.map((a) => ({ label: a, value: a }))}
                />
                <Button
                    icon={<IconPlus />}
                    theme="solid"
                    type="primary"
                    onClick={() => {
                        setFormAccount(null);
                        setShowForm(true);
                    }}
                >
                    {t('ai.actions.create')}
                </Button>
                <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>
                    {t('ai.actions.refresh')}
                </Button>
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
                empty={<Text type="tertiary">{t('ai.accounts.empty')}</Text>}
            />

            {showForm && <AccountForm account={formAccount} providers={providers} onClose={() => setShowForm(false)} />}
            {poolAccount && <ModelPoolSheet account={poolAccount} onClose={() => setPoolAccount(null)} />}
        </div>
    );
}
