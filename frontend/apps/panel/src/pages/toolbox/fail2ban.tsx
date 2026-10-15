import { useState } from 'react';
import { Button, Input, InputNumber, Modal, Select, Space, Switch, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconFile, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useGetFail2banBaseQuery,
    useLazyLoadFail2banConfQuery,
    useOperateFail2banMutation,
    useOperateFail2banSSHDMutation,
    useSearchFail2banQuery,
    useUpdateFail2banConfByFileMutation,
    useUpdateFail2banMutation,
    type Fail2banUpdate,
} from '@/api/toolboxApi';
import { ConfigEditorModal, Field, SettingRow, errText } from './shared';

const { Text } = Typography;

const UNITS = ['s', 'm', 'h', 'd', 'y'];
const BAN_ACTIONS = ['iptables-allports', 'iptables-multiport', 'firewallcmd-ipset', 'ufw'];

type ConfigKind = Fail2banUpdate['key'];

function splitDuration(value: string): { num: number; unit: string } {
    const m = /^(-?\d+)\s*([smhdy])?$/.exec((value || '').trim());
    if (!m) return { num: 0, unit: 'm' };
    return { num: Number(m[1]), unit: m[2] || 's' };
}

function ConfigEditModal({ kind, value, onClose, onSaved }: { kind: ConfigKind; value: string; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [updateFail2ban, { isLoading }] = useUpdateFail2banMutation();
    const duration = splitDuration(value);
    const isDuration = kind === 'bantime' || kind === 'findtime';
    const [num, setNum] = useState(duration.num);
    const [unit, setUnit] = useState(duration.unit);
    const [text, setText] = useState(value);
    const permanent = isDuration && num === -1;

    const save = async () => {
        let v: string;
        if (isDuration) v = permanent ? '-1' : `${num}${unit}`;
        else v = text;
        try {
            await updateFail2ban({ key: kind, value: v }).unwrap();
            Toast.success(t('toolbox.fail2ban.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const titleKey: Record<ConfigKind, string> = {
        port: 'toolbox.fail2ban.sshPort',
        maxretry: 'toolbox.fail2ban.maxRetry',
        bantime: 'toolbox.fail2ban.banTime',
        findtime: 'toolbox.fail2ban.findTime',
        banaction: 'toolbox.fail2ban.banAction',
        logpath: 'toolbox.fail2ban.logPath',
    };

    return (
        <Modal
            title={t(titleKey[kind])}
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            {kind === 'port' && (
                <Field label={t('toolbox.fail2ban.sshPort')} help={t('toolbox.fail2ban.sshPortHelper')}>
                    <InputNumber value={Number(text) || 0} onNumberChange={(v) => setText(String(v))} min={1} max={65535} style={{ width: 200 }} />
                </Field>
            )}
            {kind === 'maxretry' && (
                <Field label={t('toolbox.fail2ban.maxRetry')}>
                    <InputNumber value={Number(text) || 0} onNumberChange={(v) => setText(String(v))} min={1} style={{ width: 200 }} />
                </Field>
            )}
            {isDuration && (
                <Field label={t(titleKey[kind])} help={t('toolbox.fail2ban.banTimeHelper')}>
                    <Space>
                        <InputNumber value={num} onNumberChange={(v) => setNum(v === undefined || v === null ? 0 : Number(v))} disabled={permanent} style={{ width: 160 }} />
                        <Select value={unit} disabled={permanent} onChange={(v) => setUnit(String(v))} style={{ width: 120 }} optionList={UNITS.map((u) => ({ label: t('toolbox.fail2ban.unit' + u.toUpperCase(), u), value: u }))} />
                    </Space>
                </Field>
            )}
            {isDuration && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, cursor: 'pointer' }}>
                    <Switch size="small" checked={permanent} onChange={(v) => setNum(v ? -1 : 0)} />
                    <Text size="small">{t('toolbox.fail2ban.permanent')}</Text>
                </label>
            )}
            {kind === 'banaction' && (
                <Field label={t('toolbox.fail2ban.banAction')}>
                    <Select value={text} onChange={(v) => setText(String(v))} style={{ width: '100%' }} optionList={BAN_ACTIONS.map((a) => ({ label: a, value: a }))} />
                </Field>
            )}
            {kind === 'logpath' && (
                <Field label={t('toolbox.fail2ban.logPath')} help={t('toolbox.fail2ban.logPathHelper')}>
                    <Input value={text} onChange={setText} />
                </Field>
            )}
        </Modal>
    );
}

function IpListModal({ operate, onClose, onSaved }: { operate: 'ignore' | 'banned'; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const { data = [], isFetching } = useSearchFail2banQuery({ status: operate });
    const [value, setValue] = useState<string | null>(null);
    const [save, { isLoading }] = useOperateFail2banSSHDMutation();

    const text = value ?? (data || []).join('\n');

    const onSave = async () => {
        const ips = text
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        try {
            await save({ ips, operate }).unwrap();
            Toast.success(t('toolbox.fail2ban.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={operate === 'ignore' ? t('toolbox.fail2ban.ignoreIP') : t('toolbox.fail2ban.bannedIP')}
            visible
            confirmLoading={isLoading}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={onSave}
            onCancel={onClose}
        >
            <Field label={t('toolbox.fail2ban.ipHelper')}>
                <TextArea value={text} onChange={setValue} autosize={{ minRows: 8 }} disabled={isFetching} />
            </Field>
        </Modal>
    );
}

/** Fail2ban 原始配置文件（jail.local）。 */
function Fail2banConfModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [loadConf] = useLazyLoadFail2banConfQuery();
    const [updateByFile] = useUpdateFail2banConfByFileMutation();
    return (
        <ConfigEditorModal
            title={t('toolbox.config.fail2ban')}
            onClose={onClose}
            tabs={[
                {
                    key: 'jail',
                    label: '/etc/fail2ban/jail.local',
                    load: () => loadConf().unwrap(),
                    save: (file) => updateByFile({ file }).unwrap(),
                },
            ]}
        />
    );
}

export default function Fail2banTab() {
    const { t } = useTranslation();
    const { data, isFetching, refetch } = useGetFail2banBaseQuery();
    const [operate] = useOperateFail2banMutation();
    const [configKind, setConfigKind] = useState<ConfigKind | null>(null);
    const [ipKind, setIpKind] = useState<'ignore' | 'banned' | null>(null);
    const [confOpen, setConfOpen] = useState(false);

    if (!data) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{isFetching ? t('common.loading') : t('common.empty')}</Text>
            </div>
        );
    }

    if (!data.isExist) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{t('toolbox.fail2ban.notInstalled')}</Text>
            </div>
        );
    }

    const onOperate = (operation: string) => {
        Modal.confirm({
            title: t('toolbox.actions.' + operation, operation),
            content: t('toolbox.fail2ban.operationConfirm', { op: t('toolbox.actions.' + operation, operation) }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await operate({ operation }).unwrap();
                    Toast.success(t('toolbox.fail2ban.saved'));
                    refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Tag color="green" size="large">
                    Fail2ban
                </Tag>
                <Tag color={data.isActive ? 'green' : 'grey'}>{data.isActive ? t('toolbox.actions.enable') : t('toolbox.actions.disable')}</Tag>
                <Tag>
                    {t('toolbox.fail2ban.version')}: {data.version}
                </Tag>
                <Button theme="borderless" type="primary" onClick={() => onOperate(data.isActive ? 'stop' : 'start')}>
                    {data.isActive ? t('toolbox.fail2ban.stop') : t('toolbox.fail2ban.start')}
                </Button>
                <Button theme="borderless" type="primary" onClick={() => onOperate('restart')}>
                    {t('toolbox.fail2ban.restart')}
                </Button>
                <Space>
                    <Text size="small">{t('toolbox.fail2ban.autoStart')}</Text>
                    <Switch size="small" checked={data.isEnable} onChange={(v) => onOperate(v ? 'enable' : 'disable')} />
                </Space>
                <Button icon={<IconRefresh />} theme="borderless" loading={isFetching} onClick={() => refetch()}>
                    {t('toolbox.actions.refresh')}
                </Button>
            </div>

            <Space>
                <Button theme="solid" type="primary" disabled={!data.isActive} onClick={() => setIpKind('ignore')}>
                    {t('toolbox.fail2ban.ignoreIP')}
                </Button>
                <Button disabled={!data.isActive} onClick={() => setIpKind('banned')}>
                    {t('toolbox.fail2ban.bannedIP')}
                </Button>
                <Button icon={<IconFile />} onClick={() => setConfOpen(true)}>
                    {t('toolbox.config.title')}
                </Button>
            </Space>

            <div style={{ maxWidth: 900 }}>
                <SettingRow
                    label={t('toolbox.fail2ban.sshPort')}
                    value={<Text>{data.port}</Text>}
                    setLabel={t('toolbox.actions.set')}
                    onSet={() => setConfigKind('port')}
                />
                <SettingRow
                    label={t('toolbox.fail2ban.maxRetry')}
                    value={<Text>{data.maxRetry}</Text>}
                    setLabel={t('toolbox.actions.set')}
                    onSet={() => setConfigKind('maxretry')}
                />
                <SettingRow
                    label={t('toolbox.fail2ban.banTime')}
                    value={<Text>{data.banTime}</Text>}
                    setLabel={t('toolbox.actions.set')}
                    onSet={() => setConfigKind('bantime')}
                />
                <SettingRow
                    label={t('toolbox.fail2ban.findTime')}
                    value={<Text>{data.findTime}</Text>}
                    setLabel={t('toolbox.actions.set')}
                    onSet={() => setConfigKind('findtime')}
                />
                <SettingRow
                    label={t('toolbox.fail2ban.banAction')}
                    value={<Text>{data.banAction}</Text>}
                    setLabel={t('toolbox.actions.set')}
                    onSet={() => setConfigKind('banaction')}
                />
                <SettingRow
                    label={t('toolbox.fail2ban.logPath')}
                    value={<Text>{data.logPath}</Text>}
                    setLabel={t('toolbox.actions.set')}
                    onSet={() => setConfigKind('logpath')}
                />
            </div>

            {configKind && (
                <ConfigEditModal
                    kind={configKind}
                    value={configKind === 'port' ? String(data.port) : configKind === 'maxretry' ? String(data.maxRetry) : configKind === 'bantime' ? data.banTime : configKind === 'findtime' ? data.findTime : configKind === 'banaction' ? data.banAction : data.logPath}
                    onClose={() => setConfigKind(null)}
                    onSaved={() => {
                        setConfigKind(null);
                        refetch();
                    }}
                />
            )}
            {ipKind && (
                <IpListModal
                    operate={ipKind}
                    onClose={() => setIpKind(null)}
                    onSaved={() => {
                        setIpKind(null);
                        refetch();
                    }}
                />
            )}
            {confOpen && <Fail2banConfModal onClose={() => setConfOpen(false)} />}
        </div>
    );
}
