import { useState } from 'react';
import { Button, Card, Input, InputNumber, Modal, Select, Space, Switch, TabPane, Table, Tabs, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCleanAlertLogsMutation,
    useCreateAlertMutation,
    useDeleteAlertMutation,
    useSearchAlertLogsQuery,
    useSearchAlertsQuery,
    useSetAlertStatusMutation,
    useUpdateAlertMutation,
    type AlertCreate,
    type AlertRule,
} from '@/api/settingsApi';
import { Field, errText } from './shared';

const { Text } = Typography;

const ALERT_TYPES = [
    'sshLogin',
    'ssl',
    'siteEndTime',
    'cpu',
    'memory',
    'disk',
    'load',
    'clams',
    'shell',
    'app',
    'website',
    'database',
    'directory',
    'log',
    'snapshot',
    'curl',
    'cutWebsiteLog',
    'clean',
    'ntp',
];

const ALERT_METHODS = ['email', 'webhook', 'sms'];

function AlertFormModal({ target, onClose, onSaved }: { target: AlertRule | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [form, setForm] = useState<AlertCreate>({
        title: target?.title ?? '',
        type: target?.type ?? 'cpu',
        method: target?.method ?? 'email',
        project: target?.project ?? '',
        cycle: target?.cycle ?? 5,
        count: target?.count ?? 3,
        status: target?.status ?? 'Enable',
        sendCount: target?.sendCount ?? 0,
        advancedParams: target?.advancedParams ?? '',
    });
    const [create, { isLoading: creating }] = useCreateAlertMutation();
    const [update, { isLoading: updating }] = useUpdateAlertMutation();

    const save = async () => {
        if (!form.title.trim()) {
            Toast.error(t('settings.alert.titleRequired'));
            return;
        }
        try {
            if (isEdit && target) await update({ ...form, id: target.id }).unwrap();
            else await create(form).unwrap();
            Toast.success(t('settings.alert.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={isEdit ? t('settings.alert.edit') : t('settings.alert.add')}
            visible
            confirmLoading={creating || updating}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
            width={560}
        >
            <Field label={t('settings.alert.ruleTitle')}>
                <Input value={form.title} onChange={(v) => setForm((f) => ({ ...f, title: v }))} showClear />
            </Field>
            <Field label={t('settings.alert.type')}>
                <Select
                    value={form.type}
                    style={{ width: '100%' }}
                    filter
                    optionList={ALERT_TYPES.map((v) => ({ value: v, label: t(`settings.alert.typeLabel.${v}`, v) }))}
                    onChange={(v) => setForm((f) => ({ ...f, type: String(v) }))}
                />
            </Field>
            <Field label={t('settings.alert.method')}>
                <Select
                    value={form.method}
                    style={{ width: '100%' }}
                    optionList={ALERT_METHODS.map((v) => ({ value: v, label: t(`settings.alert.methodLabel.${v}`, v) }))}
                    onChange={(v) => setForm((f) => ({ ...f, method: String(v) }))}
                />
            </Field>
            <Field label={t('settings.alert.project')}>
                <Input value={form.project} onChange={(v) => setForm((f) => ({ ...f, project: v }))} showClear />
            </Field>
            <Field label={t('settings.alert.cycle')} help={t('settings.alert.cycleHelper')}>
                <InputNumber value={form.cycle} min={1} onChange={(v) => setForm((f) => ({ ...f, cycle: Number(v ?? 1) }))} />
            </Field>
            <Field label={t('settings.alert.count')} help={t('settings.alert.countHelper')}>
                <InputNumber value={form.count} min={1} onChange={(v) => setForm((f) => ({ ...f, count: Number(v ?? 1) }))} />
            </Field>
            <Field label={t('settings.alert.advancedParams')} help={t('settings.alert.advancedParamsHelper')}>
                <TextArea value={form.advancedParams} onChange={(v) => setForm((f) => ({ ...f, advancedParams: v }))} autosize={{ minRows: 3 }} />
            </Field>
            <Field label={t('settings.alert.status')}>
                <Switch checked={form.status === 'Enable'} onChange={(v) => setForm((f) => ({ ...f, status: v ? 'Enable' : 'Disable' }))} />
            </Field>
        </Modal>
    );
}

function AlertRules({ onOpenLogs }: { onOpenLogs: () => void }) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [type, setType] = useState('');
    const [status, setStatus] = useState('');

    const { data, isFetching, refetch } = useSearchAlertsQuery({ page, pageSize, type, status });
    const [setAlertStatus] = useSetAlertStatusMutation();
    const [deleteAlert] = useDeleteAlertMutation();

    const [formOpen, setFormOpen] = useState(false);
    const [formTarget, setFormTarget] = useState<AlertRule | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);

    const toggleStatus = async (row: AlertRule) => {
        try {
            await setAlertStatus({ id: row.id, status: row.status === 'Enable' ? 'Disable' : 'Enable' }).unwrap();
            Toast.success(t('settings.alert.statusChanged'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteAlert({ id: deleteTarget.id }).unwrap();
            Toast.success(t('settings.alert.deleted'));
            setDeleteTarget(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('settings.alert.ruleTitle'), dataIndex: 'title', key: 'title' },
        {
            title: t('settings.alert.type'),
            dataIndex: 'type',
            key: 'type',
            width: 160,
            render: (v: string) => <Tag size="small">{t(`settings.alert.typeLabel.${v}`, v)}</Tag>,
        },
        {
            title: t('settings.alert.method'),
            dataIndex: 'method',
            key: 'method',
            width: 120,
            render: (v: string) => t(`settings.alert.methodLabel.${v}`, v),
        },
        { title: t('settings.alert.cycle'), dataIndex: 'cycle', key: 'cycle', width: 100 },
        { title: t('settings.alert.count'), dataIndex: 'count', key: 'count', width: 100 },
        {
            title: t('settings.alert.status'),
            key: 'status',
            width: 100,
            render: (_: unknown, row: AlertRule) => (
                <Switch size="small" checked={row.status === 'Enable'} onChange={() => toggleStatus(row)} />
            ),
        },
        { title: t('settings.alert.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 180 },
        {
            title: '',
            key: 'op',
            width: 160,
            render: (_: unknown, row: AlertRule) => (
                <Space>
                    <Button size="small" theme="borderless" onClick={() => { setFormTarget(row); setFormOpen(true); }}>
                        {t('common.edit')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteTarget(row)}>
                        {t('common.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Select
                    value={type}
                    onChange={(v) => {
                        setType(String(v ?? ''));
                        setPage(1);
                    }}
                    style={{ width: 200 }}
                    showClear
                    placeholder={t('settings.alert.type')}
                    optionList={ALERT_TYPES.map((v) => ({ value: v, label: t(`settings.alert.typeLabel.${v}`, v) }))}
                />
                <Select
                    value={status}
                    onChange={(v) => {
                        setStatus(String(v ?? ''));
                        setPage(1);
                    }}
                    style={{ width: 160 }}
                    showClear
                    placeholder={t('settings.alert.status')}
                    optionList={[
                        { value: 'Enable', label: t('settings.alert.enable') },
                        { value: 'Disable', label: t('settings.alert.disable') },
                    ]}
                />
                <Button icon={<IconPlus />} theme="solid" type="primary" onClick={() => { setFormTarget(null); setFormOpen(true); }}>
                    {t('settings.alert.add')}
                </Button>
                <Button icon={<IconRefresh />} onClick={() => refetch()}>
                    {t('common.refresh')}
                </Button>
                <Button onClick={onOpenLogs}>{t('settings.alert.viewLogs')}</Button>
            </Space>

            <Table
                rowKey="id"
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
                empty={<Text type="tertiary">{t('settings.alert.empty')}</Text>}
            />

            {formOpen && (
                <AlertFormModal
                    target={formTarget}
                    onClose={() => setFormOpen(false)}
                    onSaved={() => {
                        setFormOpen(false);
                        refetch();
                    }}
                />
            )}

            {deleteTarget && (
                <Modal
                    title={t('settings.alert.delete')}
                    visible
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    onOk={doDelete}
                    onCancel={() => setDeleteTarget(null)}
                >
                    <Text>{t('settings.alert.deleteConfirm', { name: deleteTarget.title })}</Text>
                </Modal>
            )}
        </div>
    );
}

function AlertLogs() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [status, setStatus] = useState('');
    const { data, isFetching, refetch } = useSearchAlertLogsQuery({ page, pageSize, status });
    const [cleanLogs, { isLoading: cleaning }] = useCleanAlertLogsMutation();

    const onClean = () => {
        Modal.confirm({
            title: t('settings.alert.cleanLogs'),
            content: t('settings.alert.cleanLogsConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await cleanLogs().unwrap();
                    Toast.success(t('settings.alert.cleaned'));
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('settings.alert.logType'), dataIndex: 'type', key: 'type', width: 160 },
        {
            title: t('settings.alert.logStatus'),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (v: string) => <Tag size="small" color={v === 'Success' ? 'green' : 'red'}>{v || '-'}</Tag>,
        },
        { title: t('settings.alert.logMessage'), dataIndex: 'message', key: 'message', render: (v: string) => v || '-' },
        { title: t('settings.alert.logCount'), dataIndex: 'count', key: 'count', width: 100 },
        { title: t('settings.alert.createdAt'), dataIndex: 'createdAt', key: 'createdAt', width: 180 },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Select
                    value={status}
                    onChange={(v) => {
                        setStatus(String(v ?? ''));
                        setPage(1);
                    }}
                    style={{ width: 160 }}
                    showClear
                    placeholder={t('settings.alert.logStatus')}
                    optionList={[
                        { value: 'Success', label: t('settings.alert.logSuccess') },
                        { value: 'Failed', label: t('settings.alert.logFailed') },
                    ]}
                />
                <Button icon={<IconRefresh />} onClick={() => refetch()}>
                    {t('common.refresh')}
                </Button>
                <Button theme="borderless" type="danger" loading={cleaning} onClick={onClean}>
                    {t('settings.alert.cleanLogs')}
                </Button>
            </Space>

            <Table
                rowKey="id"
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
                empty={<Text type="tertiary">{t('settings.alert.logEmpty')}</Text>}
            />
        </div>
    );
}

export default function AlertSettingsTab() {
    const { t } = useTranslation();
    const [sub, setSub] = useState('rules');

    return (
        <Card title={t('settings.alert.title')}>
            <Tabs type="button" activeKey={sub} onChange={(k) => setSub(String(k))} lazyRender>
                <TabPane tab={t('settings.alert.rulesTab')} itemKey="rules">
                    <AlertRules onOpenLogs={() => setSub('logs')} />
                </TabPane>
                <TabPane tab={t('settings.alert.logsTab')} itemKey="logs">
                    <AlertLogs />
                </TabPane>
            </Tabs>
        </Card>
    );
}
