import { useState } from 'react';
import {
    Button,
    DatePicker,
    Input,
    InputNumber,
    Modal,
    Radio,
    RadioGroup,
    SideSheet,
    Switch,
    Table,
    Tag,
    TextArea,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useCreateAPIKeyMutation,
    useRevokeAPIKeyMutation,
    useSearchAPIKeysQuery,
    useSetAPIKeyStatusMutation,
    useUpdateAPIKeyMutation,
    type APIKeyEditable,
    type APIKeyItem,
} from '@/api/settingsApi';
import { useGenerateApiKeyMutation, useLazyGetCurrentUserQuery } from '@/api/authApi';
import { SettingRow, Field, errText } from './shared';

const { Text } = Typography;

const ANY_KEY_IP = '0.0.0.0/0\n::/0';

function normalizeIPs(value: string): string {
    return value
        .split(/[\s,]+/)
        .filter(Boolean)
        .join('\n');
}

function isAnyIP(value: string): boolean {
    const entries = new Set(normalizeIPs(value).split('\n'));
    return entries.has('0.0.0.0/0') && entries.has('::/0');
}

function defaultExpiry(): string {
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

function formatDateTime(value?: string | null): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
        date.getMinutes(),
    )}`;
}

function emptyForm(): APIKeyEditable {
    return {
        name: '',
        description: '',
        ipWhiteList: '',
        apiTrustedProxies: '',
        apiKeyValidityTime: 120,
        expiresAt: defaultExpiry(),
        allowAppBinding: false,
    };
}

export default function APIKeysTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [excludeRevoked, setExcludeRevoked] = useState(true);
    const { data, isFetching, refetch } = useSearchAPIKeysQuery({ page, pageSize, excludeRevoked });
    const [createAPIKey, { isLoading: creating }] = useCreateAPIKeyMutation();
    const [updateAPIKey, { isLoading: updating }] = useUpdateAPIKeyMutation();
    const [setStatus] = useSetAPIKeyStatusMutation();
    const [revoke] = useRevokeAPIKeyMutation();
    const [loadCurrentUser] = useLazyGetCurrentUserQuery();
    const [generateApiKey] = useGenerateApiKeyMutation();

    const [editorOpen, setEditorOpen] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [form, setForm] = useState<APIKeyEditable>(emptyForm());
    const [ipMode, setIpMode] = useState<'restricted' | 'any'>('restricted');
    const [neverExpires, setNeverExpires] = useState(false);

    const [secret, setSecret] = useState('');
    const [secretName, setSecretName] = useState('');

    const [detail, setDetail] = useState<string | null>(null);
    const [legacySecret, setLegacySecret] = useState('');

    const rows = data?.items ?? [];
    const detailItem = rows.find((r) => r.id === detail) ?? null;

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm());
        setIpMode('restricted');
        setNeverExpires(false);
        setEditorOpen(true);
    };

    const openEdit = (item: APIKeyItem) => {
        setEditing(item.id);
        setForm({
            name: item.kind === 'legacy' ? t('settings.apikeys.legacy') : item.name,
            description: item.description,
            ipWhiteList: normalizeIPs(item.ipWhiteList),
            apiTrustedProxies: normalizeIPs(item.apiTrustedProxies),
            apiKeyValidityTime: item.apiKeyValidityTime,
            expiresAt: item.expiresAt,
            allowAppBinding: item.allowAppBinding,
        });
        setIpMode(isAnyIP(item.ipWhiteList) ? 'any' : 'restricted');
        setNeverExpires(!item.expiresAt);
        setEditorOpen(true);
    };

    const submit = async () => {
        if (!form.name.trim()) {
            Toast.warning(t('settings.apikeys.nameRequired'));
            return;
        }
        const payload: APIKeyEditable = {
            name: form.name.trim(),
            description: form.description,
            ipWhiteList: ipMode === 'any' ? ANY_KEY_IP : normalizeIPs(form.ipWhiteList),
            apiTrustedProxies: normalizeIPs(form.apiTrustedProxies),
            apiKeyValidityTime: form.apiKeyValidityTime,
            expiresAt: neverExpires ? null : form.expiresAt,
            allowAppBinding: form.allowAppBinding,
        };
        try {
            if (editing) {
                const current = rows.find((r) => r.id === editing);
                await updateAPIKey({ ...payload, id: editing, revision: current?.revision ?? 0 }).unwrap();
                Toast.success(t('settings.saved'));
            } else {
                const res = await createAPIKey({ ...payload, requestID: crypto.randomUUID() }).unwrap();
                setSecret(res.apiKey);
                setSecretName(res.item?.name ?? payload.name);
            }
            setEditorOpen(false);
            void refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const changeStatus = (item: APIKeyItem, next: 'Enable' | 'Disable') => {
        Modal.confirm({
            title: t('settings.apikeys.title'),
            content: next === 'Enable' ? t('settings.apikeys.enableConfirm', { name: item.name }) : t('settings.apikeys.disableConfirm', { name: item.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await setStatus({ id: item.id, revision: item.revision, status: next }).unwrap();
                    Toast.success(t('settings.saved'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const doRevoke = (item: APIKeyItem) => {
        Modal.confirm({
            title: t('settings.apikeys.title'),
            content: t('settings.apikeys.revokeConfirm', { name: item.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await revoke({ id: item.id, revision: item.revision }).unwrap();
                    Toast.success(t('settings.saved'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const revealLegacy = async () => {
        try {
            const res = await loadCurrentUser().unwrap();
            setLegacySecret(res.apiKey);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const resetLegacy = async () => {
        try {
            const key = await generateApiKey().unwrap();
            setLegacySecret(key);
            Toast.success(t('settings.saved'));
            void refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            Toast.success(t('settings.apikeys.copied'));
        } catch {
            Toast.error(t('settings.apikeys.copyFailed'));
        }
    };

    const columns = [
        {
            title: t('settings.apikeys.name'),
            dataIndex: 'name',
            render: (_: unknown, row: APIKeyItem) => (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <Button theme="borderless" onClick={() => setDetail(row.id)} style={{ padding: 0, height: 'auto' }}>
                        {row.kind === 'legacy' ? t('settings.apikeys.legacy') : row.name}
                    </Button>
                    <Text type="tertiary" size="small">
                        {row.keyHint}
                    </Text>
                </div>
            ),
        },
        {
            title: t('settings.apikeys.status'),
            dataIndex: 'status',
            width: 110,
            render: (_: unknown, row: APIKeyItem) => (
                <Tag color={row.status === 'Enable' ? 'green' : row.status === 'Disable' ? 'orange' : 'grey'}>
                    {t(`settings.apikeys.statusLabel.${row.status}`)}
                </Tag>
            ),
        },
        {
            title: t('settings.apikeys.ipWhiteList'),
            dataIndex: 'ipWhiteList',
            render: (_: unknown, row: APIKeyItem) =>
                isAnyIP(row.ipWhiteList) ? t('settings.apikeys.anyIp') : normalizeIPs(row.ipWhiteList).split('\n').filter(Boolean).join(', ') || '-',
        },
        {
            title: t('settings.apikeys.expiresAt'),
            dataIndex: 'expiresAt',
            width: 170,
            render: (_: unknown, row: APIKeyItem) => (row.expiresAt ? formatDateTime(row.expiresAt) : t('settings.apikeys.never')),
        },
        {
            title: t('settings.apikeys.allowAppBinding'),
            dataIndex: 'allowAppBinding',
            width: 130,
            render: (_: unknown, row: APIKeyItem) => (row.allowAppBinding ? t('settings.apikeys.yes') : t('settings.apikeys.no')),
        },
        {
            title: t('settings.apikeys.operate'),
            key: 'operate',
            width: 240,
            render: (_: unknown, row: APIKeyItem) => (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button theme="borderless" size="small" onClick={() => setDetail(row.id)}>
                        {t('settings.apikeys.view')}
                    </Button>
                    {row.status !== 'Revoked' ? (
                        <Button theme="borderless" size="small" onClick={() => openEdit(row)}>
                            {t('settings.apikeys.edit')}
                        </Button>
                    ) : null}
                    {row.status === 'Enable' ? (
                        <Button theme="borderless" size="small" onClick={() => changeStatus(row, 'Disable')}>
                            {t('settings.apikeys.disable')}
                        </Button>
                    ) : null}
                    {row.status === 'Disable' ? (
                        <Button theme="borderless" size="small" onClick={() => changeStatus(row, 'Enable')}>
                            {t('settings.apikeys.enable')}
                        </Button>
                    ) : null}
                    {row.status !== 'Revoked' ? (
                        <Button type="danger" theme="borderless" size="small" onClick={() => doRevoke(row)}>
                            {t('settings.apikeys.revoke')}
                        </Button>
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Button type="primary" onClick={openCreate}>
                    {t('settings.apikeys.create')}
                </Button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text>{t('settings.apikeys.showRevoked')}</Text>
                    <Switch checked={!excludeRevoked} onChange={(v) => { setExcludeRevoked(!v); setPage(1); }} />
                </div>
            </div>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                empty={<Text type="tertiary">{t('common.empty')}</Text>}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (size: number) => {
                        setPageSize(size);
                        setPage(1);
                    },
                }}
            />

            <Modal
                title={editing ? t('settings.apikeys.edit') : t('settings.apikeys.create')}
                visible={editorOpen}
                onCancel={() => setEditorOpen(false)}
                onOk={submit}
                confirmLoading={creating || updating}
                width={560}
            >
                <Field label={t('settings.apikeys.name')}>
                    <Input
                        value={form.name}
                        onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                        maxLength={64}
                        disabled={editing !== null && rows.find((r) => r.id === editing)?.kind === 'legacy'}
                    />
                </Field>
                <Field label={t('settings.apikeys.description')}>
                    <TextArea
                        value={form.description}
                        onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                        rows={2}
                        maxLength={256}
                    />
                </Field>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 6 }}>
                        <Text strong>{t('settings.apikeys.ipWhiteList')}</Text>
                    </div>
                    <RadioGroup type="button" value={ipMode} onChange={(e) => setIpMode(String(e.target.value) === 'any' ? 'any' : 'restricted')}>
                        <Radio value="restricted">{t('settings.apikeys.specifiedIPs')}</Radio>
                        <Radio value="any">{t('settings.apikeys.anyIp')}</Radio>
                    </RadioGroup>
                    {ipMode === 'restricted' ? (
                        <TextArea
                            style={{ marginTop: 8 }}
                            value={form.ipWhiteList}
                            onChange={(v) => setForm((f) => ({ ...f, ipWhiteList: v }))}
                            rows={4}
                            maxLength={4096}
                            placeholder={'192.168.1.0/24\n10.0.0.1'}
                        />
                    ) : null}
                </div>
                <Field label={t('settings.apikeys.trustedProxies')}>
                    <TextArea
                        value={form.apiTrustedProxies}
                        onChange={(v) => setForm((f) => ({ ...f, apiTrustedProxies: v }))}
                        rows={2}
                        maxLength={4096}
                    />
                </Field>
                <Field label={t('settings.apikeys.validityTime')}>
                    <InputNumber
                        value={form.apiKeyValidityTime}
                        min={0}
                        max={1440}
                        onChange={(v) => setForm((f) => ({ ...f, apiKeyValidityTime: Number(v ?? 0) }))}
                    />
                    <Text style={{ marginLeft: 8 }}>{t('settings.apikeys.minute')}</Text>
                </Field>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 6 }}>
                        <Text strong>{t('settings.apikeys.expiresAt')}</Text>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <input type="checkbox" checked={neverExpires} onChange={(e) => setNeverExpires(e.target.checked)} />
                        {t('settings.apikeys.never')}
                    </label>
                    {!neverExpires ? (
                        <DatePicker
                            type="dateTime"
                            value={form.expiresAt ? new Date(form.expiresAt) : undefined}
                            style={{ width: '100%' }}
                            onChange={(date) => setForm((f) => ({ ...f, expiresAt: date ? new Date(date as Date).toISOString() : null }))}
                        />
                    ) : null}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={form.allowAppBinding}
                        onChange={(e) => setForm((f) => ({ ...f, allowAppBinding: e.target.checked }))}
                    />
                    {t('settings.apikeys.allowAppBinding')}
                </label>
            </Modal>

            <Modal
                title={t('settings.apikeys.createdTitle')}
                visible={secret !== ''}
                onCancel={() => setSecret('')}
                footer={
                    <Button type="primary" onClick={() => setSecret('')}>
                        {t('common.confirm')}
                    </Button>
                }
            >
                <p>{t('settings.apikeys.createdTip')}</p>
                <SettingRow
                    label={t('settings.apikeys.name')}
                    value={secretName}
                    action={
                        <Button theme="light" onClick={() => void copy(secret)}>
                            {t('settings.apikeys.copy')}
                        </Button>
                    }
                />
                <TextArea value={secret} rows={2} readOnly style={{ marginTop: 8 }} />
            </Modal>

            <SideSheet
                title={t('settings.apikeys.details')}
                visible={detail !== null}
                onCancel={() => {
                    setDetail(null);
                    setLegacySecret('');
                }}
                width={560}
            >
                {detailItem ? (
                    <div>
                        <SettingRow label={t('settings.apikeys.name')} value={detailItem.name} />
                        <SettingRow label={t('settings.apikeys.status')} value={t(`settings.apikeys.statusLabel.${detailItem.status}`)} />
                        <SettingRow label={t('settings.apikeys.keyHint')} value={detailItem.keyHint} />
                        <SettingRow label={t('settings.apikeys.ipWhiteList')} value={isAnyIP(detailItem.ipWhiteList) ? t('settings.apikeys.anyIp') : normalizeIPs(detailItem.ipWhiteList).split('\n').filter(Boolean).join(', ') || '-'} />
                        <SettingRow label={t('settings.apikeys.trustedProxies')} value={normalizeIPs(detailItem.apiTrustedProxies).split('\n').filter(Boolean).join(', ') || '-'} />
                        <SettingRow label={t('settings.apikeys.validityTime')} value={`${detailItem.apiKeyValidityTime} ${t('settings.apikeys.minute')}`} />
                        <SettingRow label={t('settings.apikeys.expiresAt')} value={detailItem.expiresAt ? formatDateTime(detailItem.expiresAt) : t('settings.apikeys.never')} />
                        <SettingRow label={t('settings.apikeys.createdAt')} value={formatDateTime(detailItem.createdAt)} />
                        {detailItem.kind === 'legacy' && detailItem.status !== 'Revoked' ? (
                            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Text type="tertiary" size="small">
                                    {t('settings.apikeys.legacyHelp')}
                                </Text>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <Button theme="light" onClick={() => void revealLegacy()}>
                                        {t('settings.apikeys.showLegacy')}
                                    </Button>
                                    <Button onClick={() => void resetLegacy()}>{t('settings.apikeys.resetLegacy')}</Button>
                                </div>
                                {legacySecret ? (
                                    <TextArea value={legacySecret} rows={2} readOnly />
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </SideSheet>
        </div>
    );
}

