import { useState } from 'react';
import { Button, Card, Input, InputNumber, Modal, Radio, RadioGroup, Select, TextArea, Toast } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useGetCoreSettingsQuery,
    useLoadInterfaceAddrQuery,
    useLoadSSLInfoQuery,
    useUpdateBindMutation,
    useUpdatePortMutation,
    useUpdateSSLMutation,
    useUpdateSettingMutation,
} from '@/api/settingsApi';
import { Field, SettingRow, errText } from './shared';

const NO_AUTH_CODES = ['200', '400', '401', '403', '404', '408', '416', '444', '500'];

type SafeEdit = 'port' | 'bind' | 'entrance' | 'noAuth' | 'allowIPs' | 'bindDomain' | 'expiration' | 'ssl' | null;

function randomEntrance(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i += 1) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

export default function SafeSettingsTab() {
    const { t } = useTranslation();
    const { data, isFetching } = useGetCoreSettingsQuery();
    const { data: ifaces } = useLoadInterfaceAddrQuery();
    const { data: sslInfo } = useLoadSSLInfoQuery();
    const [updateSetting] = useUpdateSettingMutation();
    const [updatePort, { isLoading: savingPort }] = useUpdatePortMutation();
    const [updateBind] = useUpdateBindMutation();
    const [updateSSL, { isLoading: savingSSL }] = useUpdateSSLMutation();

    const [edit, setEdit] = useState<SafeEdit>(null);
    const [draft, setDraft] = useState('');
    const [ipv6, setIpv6] = useState('Disable');
    const [sslType, setSslType] = useState<'self' | 'import-paste'>('self');
    const [sslCert, setSslCert] = useState('');
    const [sslKey, setSslKey] = useState('');

    const saveSetting = async (key: string, value: string) => {
        try {
            await updateSetting({ key, value }).unwrap();
            Toast.success(t('settings.saved'));
            setEdit(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const open = (key: SafeEdit, value: string) => {
        setDraft(value ?? '');
        setEdit(key);
    };

    const submitPort = async () => {
        try {
            await updatePort({ serverPort: Number(draft) }).unwrap();
            Toast.success(t('settings.saved'));
            setEdit(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const submitBind = async () => {
        try {
            await updateBind({ bindAddress: draft, ipv6 }).unwrap();
            Toast.success(t('settings.saved'));
            setEdit(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const submitSSL = async (enable: boolean) => {        try {
            if (!enable) {
                await updateSSL({ ssl: 'Disable', sslType: 'self', domain: '', cert: '', key: '', sslID: 0 }).unwrap();
            } else {
                const isPaste = sslType === 'import-paste';
                await updateSSL({
                    ssl: 'Enable',
                    sslType,
                    domain: isPaste ? '' : window.location.hostname,
                    cert: isPaste ? sslCert : '',
                    key: isPaste ? sslKey : '',
                    sslID: 0,
                }).unwrap();
            }
            Toast.success(t('settings.safe.sslChanged'));
            setEdit(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const downloadCert = async () => {
        try {
            const base = import.meta.env.VITE_API_URL || '/api/v1';
            const res = await fetch(`${base}/core/settings/ssl/download`, { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error(await res.text());
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'server.crt';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const sslValue = data?.ssl === 'Enable' ? `${t('settings.safe.enable')} (${data.sslType})` : t('settings.safe.disable');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title={t('settings.safe.title')} loading={isFetching}>
                <SettingRow
                    label={t('settings.safe.port')}
                    value={data?.serverPort || '-'}
                    action={
                        <Button theme="light" onClick={() => open('port', data?.serverPort || '')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.safe.bindAddress')}
                    help={t('settings.safe.bindHelper')}
                    value={`${data?.bindAddress || '-'} (IPv6: ${data?.ipv6 || 'Disable'})`}
                    action={
                        <Button
                            theme="light"
                            onClick={() => {
                                setDraft(data?.bindAddress || '');
                                setIpv6(data?.ipv6 || 'Disable');
                                setEdit('bind');
                            }}
                        >
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.safe.entrance')}
                    help={t('settings.safe.entranceHelper')}
                    value={data?.securityEntrance || t('settings.safe.entranceNone')}
                    action={
                        <Button theme="light" onClick={() => open('entrance', data?.securityEntrance || '')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.safe.noAuth')}
                    help={t('settings.safe.noAuthHelper')}
                    value={
                        <Select
                            value={data?.noAuthSetting || '200'}
                            style={{ width: 260 }}
                            optionList={NO_AUTH_CODES.map((code) => ({
                                value: code,
                                label: `${code} - ${t(`settings.safe.noAuthOption.${code}`)}`,
                            }))}
                            onChange={(v) => void saveSetting('NoAuthSetting', String(v))}
                        />
                    }
                />
                <SettingRow
                    label={t('settings.safe.allowIPs')}
                    help={t('settings.safe.allowIPsHelper')}
                    value={data?.allowIPs || t('settings.safe.allAllowed')}
                    action={
                        <Button theme="light" onClick={() => open('allowIPs', data?.allowIPs || '')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.safe.bindDomain')}
                    help={t('settings.safe.bindDomainHelper')}
                    value={data?.bindDomain || t('settings.safe.notSet')}
                    action={
                        <Button theme="light" onClick={() => open('bindDomain', data?.bindDomain || '')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.safe.complexity')}
                    help={t('settings.safe.complexityHelper')}
                    value={
                        <RadioGroup
                            type="button"
                            value={data?.complexityVerification || 'Disable'}
                            onChange={(e) => void saveSetting('ComplexityVerification', String(e.target.value))}
                        >
                            <Radio value="Enable">{t('settings.safe.enable')}</Radio>
                            <Radio value="Disable">{t('settings.safe.disable')}</Radio>
                        </RadioGroup>
                    }
                />
                <SettingRow
                    label={t('settings.safe.expiration')}
                    help={t('settings.safe.expirationHelper')}
                    value={data?.expirationDays ? t('settings.safe.days', { days: data.expirationDays }) : t('settings.safe.never')}
                    action={
                        <Button theme="light" onClick={() => open('expiration', data?.expirationDays || '0')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.safe.ssl')}
                    help={t('settings.safe.sslHelper')}
                    value={sslValue}
                    action={
                        data?.ssl === 'Enable' ? (
                            <span style={{ display: 'inline-flex', gap: 8 }}>
                                {data?.sslType === 'self' ? (
                                    <Button theme="light" onClick={() => void downloadCert()}>
                                        {t('settings.safe.downloadCert')}
                                    </Button>
                                ) : null}
                                <Button theme="solid" type="danger" onClick={() => void submitSSL(false)}>
                                    {t('settings.safe.disableSSL')}
                                </Button>
                            </span>
                        ) : (
                            <Button
                                theme="light"
                                onClick={() => {
                                    setSslType('self');
                                    setSslCert('');
                                    setSslKey('');
                                    setEdit('ssl');
                                }}
                            >
                                {t('settings.safe.enableSSL')}
                            </Button>
                        )
                    }
                />
            </Card>

            <Modal
                title={t('settings.safe.port')}
                visible={edit === 'port'}
                onCancel={() => setEdit(null)}
                onOk={submitPort}
                confirmLoading={savingPort}
            >
                <Field label={t('settings.safe.port')} help={t('settings.safe.portHelper')}>
                    <InputNumber value={Number(draft)} min={1} max={65535} onChange={(v) => setDraft(String(v ?? ''))} />
                </Field>
            </Modal>

            <Modal
                title={t('settings.safe.bindAddress')}
                visible={edit === 'bind'}
                onCancel={() => setEdit(null)}
                onOk={submitBind}
            >
                <Field label={t('settings.safe.bindAddress')} help={t('settings.safe.bindHelper')}>
                    <Select
                        value={draft}
                        style={{ width: '100%' }}
                        placeholder="0.0.0.0"
                        optionList={(ifaces ?? []).map((item) => ({ value: item, label: item }))}
                        onChange={(v) => setDraft(String(v))}
                    />
                </Field>
                <Field label="IPv6">
                    <RadioGroup type="button" value={ipv6} onChange={(e) => setIpv6(String(e.target.value))}>
                        <Radio value="Enable">{t('settings.safe.enable')}</Radio>
                        <Radio value="Disable">{t('settings.safe.disable')}</Radio>
                    </RadioGroup>
                </Field>
            </Modal>

            <Modal
                title={t('settings.safe.entrance')}
                visible={edit === 'entrance'}
                onCancel={() => setEdit(null)}
                onOk={() => void saveSetting('SecurityEntrance', draft)}
            >
                <Field label={t('settings.safe.entrance')} help={t('settings.safe.entranceInputHelper')}>
                    <Input
                        value={draft}
                        onChange={setDraft}
                        showClear
                        suffix={
                            <Button theme="borderless" size="small" onClick={() => setDraft(randomEntrance())}>
                                {t('settings.safe.random')}
                            </Button>
                        }
                    />
                </Field>
            </Modal>

            <Modal
                title={t('settings.safe.allowIPs')}
                visible={edit === 'allowIPs'}
                onCancel={() => setEdit(null)}
                onOk={() => void saveSetting('AllowIPs', draft)}
            >
                <Field label={t('settings.safe.allowIPs')} help={t('settings.safe.allowIPsModalHelper')}>
                    <TextArea value={draft} onChange={setDraft} rows={4} placeholder="192.168.1.0/24" />
                </Field>
            </Modal>

            <Modal
                title={t('settings.safe.bindDomain')}
                visible={edit === 'bindDomain'}
                onCancel={() => setEdit(null)}
                onOk={() => void saveSetting('BindDomain', draft)}
            >
                <Field label={t('settings.safe.bindDomain')} help={t('settings.safe.bindDomainHelper')}>
                    <Input value={draft} onChange={setDraft} showClear />
                </Field>
            </Modal>

            <Modal
                title={t('settings.safe.expiration')}
                visible={edit === 'expiration'}
                onCancel={() => setEdit(null)}
                onOk={() => void saveSetting('ExpirationDays', draft)}
            >
                <Field label={t('settings.safe.expiration')} help={t('settings.safe.expirationHelper')}>
                    <InputNumber value={Number(draft)} min={0} onChange={(v) => setDraft(String(v ?? ''))} />
                </Field>
            </Modal>

            <Modal
                title="HTTPS"
                visible={edit === 'ssl'}
                onCancel={() => setEdit(null)}
                onOk={() => void submitSSL(true)}
                confirmLoading={savingSSL}
            >
                <Field label={t('settings.safe.sslType')}>
                    <RadioGroup type="button" value={sslType} onChange={(e) => setSslType(String(e.target.value) === 'import-paste' ? 'import-paste' : 'self')}>
                        <Radio value="self">{t('settings.safe.sslSelfSigned')}</Radio>
                        <Radio value="import-paste">{t('settings.safe.sslImport')}</Radio>
                    </RadioGroup>
                </Field>
                {sslType === 'import-paste' ? (
                    <>
                        <Field label={t('settings.safe.sslCert')}>
                            <TextArea value={sslCert} onChange={setSslCert} rows={4} placeholder="-----BEGIN CERTIFICATE-----" />
                        </Field>
                        <Field label={t('settings.safe.sslKey')}>
                            <TextArea value={sslKey} onChange={setSslKey} rows={4} placeholder="-----BEGIN PRIVATE KEY-----" />
                        </Field>
                    </>
                ) : (
                    <p>
                        {t('settings.safe.sslSelfHelper', { domain: window.location.hostname })}
                        {sslInfo?.sslID ? ` (sslID: ${sslInfo.sslID})` : ''}
                    </p>
                )}
            </Modal>
        </div>
    );
}
