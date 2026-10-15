import { useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconClose, IconFile, IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCheckDNSMutation,
    useGetDeviceBaseQuery,
    useLazyLoadDeviceConfQuery,
    useLoadTimeZoneOptionsQuery,
    useLoadUsersQuery,
    useUpdateDeviceConfByFileMutation,
    useUpdateDeviceHostMutation,
    useUpdateDeviceMutation,
    useUpdateDevicePasswdMutation,
    useUpdateDeviceSwapMutation,
    type DeviceBaseInfo,
    type HostHelper,
} from '@/api/toolboxApi';
import { formatBytes } from '@/utils/format';
import { ConfigEditorModal, Field, SettingRow, errText } from './shared';

const { Text } = Typography;

type ModalKind = 'dns' | 'hosts' | 'swap' | 'hostname' | 'passwd' | 'ntp' | 'timezone' | null;

/** 系统原始配置文件（旧版使用 CodeMirror，这里以 TextArea 呈现）。 */
function DeviceConfigModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [loadConf] = useLazyLoadDeviceConfQuery();
    const [updateByFile] = useUpdateDeviceConfByFileMutation();
    return (
        <ConfigEditorModal
            title={t('toolbox.config.title')}
            onClose={onClose}
            tabs={[
                {
                    key: 'resolve',
                    label: '/etc/resolv.conf',
                    load: () => loadConf({ name: 'DNS' }).unwrap(),
                    save: (file) => updateByFile({ name: 'DNS', file }).unwrap(),
                },
                {
                    key: 'hosts',
                    label: '/etc/hosts',
                    load: () => loadConf({ name: 'Hosts' }).unwrap(),
                    save: (file) => updateByFile({ name: 'Hosts', file }).unwrap(),
                },
            ]}
        />
    );
}

function DnsModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [value, setValue] = useState((base.dns || []).join('\n'));
    const [checkDNS, { isLoading: testing }] = useCheckDNSMutation();
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();

    const test = async () => {
        try {
            await checkDNS({ key: 'form', value: value.replace(/\n/g, ',') }).unwrap();
            Toast.success(t('toolbox.device.dnsOk'));
        } catch {
            Toast.error(t('toolbox.device.dnsTestFailed'));
        }
    };
    const save = async () => {
        try {
            await updateDevice({ key: 'DNS', value: value.replace(/\n/g, ',') }).unwrap();
            Toast.success(t('toolbox.device.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title="DNS"
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <Field label="DNS" help={t('toolbox.device.dnsHelper')}>
                <TextArea value={value} onChange={setValue} autosize={{ minRows: 6 }} placeholder="114.114.114.114&#10;8.8.8.8" />
            </Field>
            <Button style={{ marginTop: 12 }} onClick={test} loading={testing}>
                {t('toolbox.device.dnsTest')}
            </Button>
        </Modal>
    );
}

function HostsModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [rows, setRows] = useState<HostHelper[]>(base.hosts?.length ? base.hosts : [{ ip: '', host: '' }]);
    const [updateHost, { isLoading }] = useUpdateDeviceHostMutation();

    const setRow = (i: number, key: keyof HostHelper, v: string) =>
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));

    const save = async () => {
        const list = rows.filter((r) => r.ip.trim() || r.host.trim());
        if (list.some((r) => !r.ip.trim() || !r.host.trim())) {
            Toast.error(t('toolbox.device.hostRequired'));
            return;
        }
        try {
            await updateHost(list).unwrap();
            Toast.success(t('toolbox.device.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title="Hosts"
            visible
            width={640}
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <Text type="tertiary" size="small">
                {t('toolbox.device.hostsHelper')}
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {rows.map((row, i) => (
                    <Space key={i} style={{ width: '100%' }}>
                        <Input
                            style={{ width: 240 }}
                            value={row.ip}
                            placeholder={t('toolbox.device.hostPlaceholder')}
                            onChange={(v) => setRow(i, 'ip', v)}
                        />
                        <Input
                            style={{ width: 240 }}
                            value={row.host}
                            placeholder={t('toolbox.device.hostNamePlaceholder')}
                            onChange={(v) => setRow(i, 'host', v)}
                        />
                        <Button
                            icon={<IconClose />}
                            theme="borderless"
                            type="danger"
                            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                        />
                    </Space>
                ))}
                <Button icon={<IconPlus />} theme="borderless" style={{ alignSelf: 'flex-start' }} onClick={() => setRows((prev) => [...prev, { ip: '', host: '' }])}>
                    {t('toolbox.actions.add')}
                </Button>
            </div>
        </Modal>
    );
}

function HostnameModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [value, setValue] = useState(base.hostname);
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();
    const save = async () => {
        try {
            await updateDevice({ key: 'Hostname', value }).unwrap();
            Toast.success(t('toolbox.device.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };
    return (
        <Modal
            title={t('toolbox.device.hostname')}
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <Field label={t('toolbox.device.hostname')}>
                <Input value={value} onChange={setValue} />
            </Field>
        </Modal>
    );
}

function PasswdModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data: users = [] } = useLoadUsersQuery();
    const [user, setUser] = useState(base.user);
    const [passwd, setPasswd] = useState('');
    const [confirm, setConfirm] = useState('');
    const [updatePasswd, { isLoading }] = useUpdateDevicePasswdMutation();

    const save = async () => {
        if (!passwd) {
            Toast.error(t('toolbox.device.passwdHelper'));
            return;
        }
        if (passwd !== confirm) {
            Toast.error(t('toolbox.device.passwordMismatch'));
            return;
        }
        try {
            await updatePasswd({ user, passwd }).unwrap();
            Toast.success(t('toolbox.device.passwordChanged'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('toolbox.device.passwd')}
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label={t('toolbox.device.user')}>
                    <Select value={user} onChange={(v) => setUser(String(v))} style={{ width: '100%' }} optionList={users.map((u) => ({ label: u, value: u }))} />
                </Field>
                <Field label={t('toolbox.device.newPassword')} help={t('toolbox.device.passwdHelper')}>
                    <Input mode="password" value={passwd} onChange={setPasswd} />
                </Field>
                <Field label={t('toolbox.device.confirmPassword')}>
                    <Input mode="password" value={confirm} onChange={setConfirm} />
                </Field>
            </div>
        </Modal>
    );
}

function NtpModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [value, setValue] = useState(base.ntp);
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();
    const presets = ['ntp.aliyun.com', 'time.google.com'];
    const save = async () => {
        try {
            await updateDevice({ key: 'Ntp', value }).unwrap();
            Toast.success(t('toolbox.device.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };
    return (
        <Modal
            title={t('toolbox.device.syncSite')}
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <Field label={t('toolbox.device.syncSite')}>
                <Space wrap>
                    <Input style={{ width: 280 }} value={value} onChange={setValue} />
                    {presets.map((p) => (
                        <Button key={p} theme="borderless" type="primary" onClick={() => setValue(p)}>
                            {p}
                        </Button>
                    ))}
                </Space>
            </Field>
        </Modal>
    );
}

function TimeZoneModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data: zones = [] } = useLoadTimeZoneOptionsQuery();
    const [value, setValue] = useState(base.timeZone);
    const [updateDevice, { isLoading }] = useUpdateDeviceMutation();
    const save = async () => {
        try {
            await updateDevice({ key: 'TimeZone', value }).unwrap();
            Toast.success(t('toolbox.device.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };
    return (
        <Modal
            title={t('toolbox.device.timeZone')}
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <Field label={t('toolbox.device.timeZone')} help={t('toolbox.device.timeZoneHelper')}>
                <Select value={value} onChange={(v) => setValue(String(v))} style={{ width: '100%' }} filter optionList={zones.map((z) => ({ label: z, value: z }))} />
            </Field>
        </Modal>
    );
}

function SwapModal({ base, onClose, onSaved }: { base: DeviceBaseInfo; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [updateSwap] = useUpdateDeviceSwapMutation();
    const [sizes, setSizes] = useState<Record<string, number>>(() => {
        const m: Record<string, number> = {};
        (base.swapDetails || []).forEach((d) => {
            m[d.path] = Math.round(((Number(d.size) || 0) / 1024) * 100) / 100;
        });
        return m;
    });

    const saveRow = async (row: DeviceBaseInfo['swapDetails'][number]) => {
        const kb = Math.round((sizes[row.path] ?? 0) * 1024);
        if (kb !== 0 && kb < 40) {
            Toast.error(t('toolbox.device.swapMin'));
            return;
        }
        if (base.maxSize > 0 && kb * 1024 > base.maxSize) {
            Toast.error(t('toolbox.device.swapMax', { max: formatBytes(base.maxSize) }));
            return;
        }
        try {
            await updateSwap({ path: row.path, size: kb, used: Number(row.used) || 0, isNew: row.isNew, taskID: row.taskID }).unwrap();
            Toast.success(t('toolbox.device.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('toolbox.device.swapPath'), dataIndex: 'path', key: 'path' },
        {
            title: t('toolbox.device.swapSize'),
            key: 'size',
            width: 240,
            render: (_: unknown, row: DeviceBaseInfo['swapDetails'][number]) => (
                <Input
                    type="number"
                    value={String(sizes[row.path] ?? 0)}
                    onChange={(v) => setSizes((prev) => ({ ...prev, [row.path]: Number(v) || 0 }))}
                    addonAfter="MB"
                />
            ),
        },
        {
            title: t('toolbox.device.swapUsed'),
            key: 'used',
            width: 140,
            render: (_: unknown, row: DeviceBaseInfo['swapDetails'][number]) =>
                row.used === '-' || row.used === undefined ? (
                    <Text type="tertiary">-</Text>
                ) : (
                    <Text>{formatBytes(Number(row.used) * 1024)}</Text>
                ),
        },
        {
            title: '',
            key: 'op',
            width: 100,
            render: (_: unknown, row: DeviceBaseInfo['swapDetails'][number]) => (
                <Button size="small" onClick={() => saveRow(row)}>
                    {t('toolbox.actions.save')}
                </Button>
            ),
        },
    ];

    return (
        <Modal title={t('toolbox.device.swap')} visible width={820} footer={null} onCancel={onClose}>
            <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
                <Text>
                    {t('toolbox.device.swapTotal')}: <Text strong>{formatBytes(base.swapMemoryTotal)}</Text>
                </Text>
                <Text>
                    {t('toolbox.device.swapUsed')}: <Text strong>{formatBytes(base.swapMemoryUsed)}</Text>
                </Text>
                <Text>
                    {t('toolbox.device.swapAvailable')}: <Text strong>{formatBytes(base.swapMemoryAvailable)}</Text>
                </Text>
            </div>
            <Text type="tertiary" size="small">
                {t('toolbox.device.swapHelper')}
            </Text>
            <Table rowKey="path" columns={columns} dataSource={base.swapDetails ?? []} pagination={false} style={{ marginTop: 12 }} />
            <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 8 }}>
                {t('toolbox.device.swapOff')}
            </Text>
        </Modal>
    );
}

export default function DeviceTab() {
    const { t } = useTranslation();
    const { data, isFetching, refetch } = useGetDeviceBaseQuery();
    const [modal, setModal] = useState<ModalKind>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const [updateDevice] = useUpdateDeviceMutation();

    const onSaved = () => {
        setModal(null);
        refetch();
    };

    if (!data) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{isFetching ? t('toolbox.device.loading') : t('common.empty')}</Text>
            </div>
        );
    }

    const dnsText = (data.dns || []).join(', ') || '-';
    const hostsText = (data.hosts || []).map((h) => `${h.ip} ${h.host}`).join('; ') || '-';
    const setLabel = t('toolbox.actions.set');

    const syncTime = () => {
        Modal.confirm({
            title: t('toolbox.device.syncTime'),
            content: t('toolbox.device.syncTimeConfirm', { site: data.ntp || '-' }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await updateDevice({ key: 'LocalTime', value: '' }).unwrap();
                    Toast.success(t('toolbox.device.saved'));
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    return (
        <div style={{ maxWidth: 960 }}>
            <Button icon={<IconRefresh />} loading={isFetching} onClick={() => refetch()} style={{ marginBottom: 8 }}>
                {t('toolbox.actions.refresh')}
            </Button>
            <Button icon={<IconFile />} onClick={() => setConfigOpen(true)} style={{ marginBottom: 8, marginLeft: 8 }}>
                {t('toolbox.config.title')}
            </Button>
            <SettingRow label="DNS" value={<Text>{dnsText}</Text>} setLabel={setLabel} onSet={() => setModal('dns')} />
            <SettingRow label="Hosts" value={<Text>{hostsText}</Text>} setLabel={setLabel} onSet={() => setModal('hosts')} />
            <SettingRow label="Swap" value={<Text>{formatBytes(data.swapMemoryTotal)}</Text>} setLabel={setLabel} onSet={() => setModal('swap')} />
            <SettingRow label={t('toolbox.device.hostname')} value={<Text>{data.hostname}</Text>} setLabel={setLabel} onSet={() => setModal('hostname')} />
            <SettingRow label={t('toolbox.device.passwd')} value={<Tag size="small">{data.user}</Tag>} setLabel={setLabel} onSet={() => setModal('passwd')} />
            <SettingRow label={t('toolbox.device.syncSite')} value={<Text>{data.ntp || '-'}</Text>} setLabel={setLabel} onSet={() => setModal('ntp')} />
            <SettingRow label={t('toolbox.device.timeZone')} value={<Text>{data.timeZone}</Text>} setLabel={setLabel} onSet={() => setModal('timezone')} />
            <SettingRow label={t('toolbox.device.localTime')} value={<Text>{data.localTime}</Text>} setLabel={t('toolbox.device.syncTime')} onSet={syncTime} />

            {modal === 'dns' && <DnsModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {modal === 'hosts' && <HostsModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {modal === 'swap' && <SwapModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {modal === 'hostname' && <HostnameModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {modal === 'passwd' && <PasswdModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {modal === 'ntp' && <NtpModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {modal === 'timezone' && <TimeZoneModal base={data} onClose={() => setModal(null)} onSaved={onSaved} />}
            {configOpen && <DeviceConfigModal onClose={() => setConfigOpen(false)} />}
        </div>
    );
}
