import { useState } from 'react';
import { Button, Card, Input, InputNumber, Modal, Radio, RadioGroup, Select, Toast } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@/store/hooks';
import { setLanguage, setThemeMode } from '@/features/ui/uiSlice';
import { SUPPORTED_LANGUAGES } from '@/i18n';
import {
    useDefaultMenuMutation,
    useGetAgentSettingsQuery,
    useGetCoreSettingsQuery,
    useUpdateAgentSettingMutation,
    useUpdateProxyMutation,
    useUpdateSettingMutation,
    type ProxyUpdate,
} from '@/api/settingsApi';
import { SettingRow, Field, errText } from './shared';

export default function PanelSettingsTab() {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const { data, isFetching } = useGetCoreSettingsQuery();
    const { data: agent } = useGetAgentSettingsQuery();
    const [updateSetting] = useUpdateSettingMutation();
    const [updateAgentSetting] = useUpdateAgentSettingMutation();
    const [updateProxy, { isLoading: savingProxy }] = useUpdateProxyMutation();
    const [defaultMenu] = useDefaultMenuMutation();

    const [editKey, setEditKey] = useState<'panelName' | 'sessionTimeout' | 'systemIP' | 'proxy' | null>(null);
    const [draft, setDraft] = useState('');
    const [proxy, setProxy] = useState<ProxyUpdate>({
        proxyType: 'close',
        proxyUrl: '',
        proxyPort: '',
        proxyUser: '',
        proxyPasswd: '',
        proxyPasswdKeep: 'Disable',
    });

    const onSetting = async (key: string, value: string) => {
        try {
            await updateSetting({ key, value }).unwrap();
            Toast.success(t('settings.panel.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const saveAgent = async (key: string, value: string) => {
        try {
            await updateAgentSetting({ key, value }).unwrap();
            Toast.success(t('settings.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onTheme = async (value: string) => {
        try {
            await updateSetting({ key: 'Theme', value }).unwrap();
            dispatch(setThemeMode((value === 'auto' ? 'system' : value) as 'light' | 'dark' | 'system'));
            Toast.success(t('settings.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onLanguage = async (value: string) => {
        try {
            await updateSetting({ key: 'Language', value }).unwrap();
            dispatch(setLanguage(value));
            Toast.success(t('settings.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const openEdit = (key: 'panelName' | 'sessionTimeout' | 'systemIP', value: string) => {
        setDraft(value ?? '');
        setEditKey(key);
    };

    const submitEdit = async () => {
        if (!editKey) return;
        try {
            if (editKey === 'systemIP') {
                await updateAgentSetting({ key: 'SystemIP', value: draft }).unwrap();
            } else {
                const key = editKey === 'panelName' ? 'PanelName' : 'SessionTimeout';
                await updateSetting({ key, value: draft }).unwrap();
            }
            Toast.success(t('settings.saved'));
            setEditKey(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const openProxy = () => {
        setProxy({
            proxyType: data?.proxyType || '',
            proxyUrl: data?.proxyUrl || '',
            proxyPort: data?.proxyPort || '',
            proxyUser: data?.proxyUser || '',
            proxyPasswd: '',
            proxyPasswdKeep: data?.proxyPasswdKeep || 'Disable',
        });
        setEditKey('proxy');
    };

    const submitProxy = async () => {
        try {
            const isClose = !proxy.proxyType || proxy.proxyType === 'close';
            await updateProxy({
                proxyType: isClose ? '' : proxy.proxyType,
                proxyUrl: isClose ? '' : proxy.proxyUrl,
                proxyPort: isClose ? '' : proxy.proxyPort,
                proxyUser: isClose ? '' : proxy.proxyUser,
                proxyPasswd: isClose ? '' : proxy.proxyPasswd,
                proxyPasswdKeep: isClose ? '' : proxy.proxyPasswdKeep,
            }).unwrap();
            Toast.success(t('settings.saved'));
            setEditKey(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onDefaultMenu = () => {
        Modal.confirm({
            title: t('settings.panel.menuDefault'),
            content: t('settings.panel.menuDefaultConfirm'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await defaultMenu().unwrap();
                    Toast.success(t('settings.saved'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card title={t('settings.panel.title')} loading={isFetching}>
                <SettingRow
                    label={t('settings.panel.theme')}
                    value={
                        <RadioGroup
                            type="button"
                            value={data?.theme ?? 'auto'}
                            onChange={(e) => onTheme(String(e.target.value))}
                        >
                            <Radio value="light">{t('settings.panel.themeLight')}</Radio>
                            <Radio value="dark">{t('settings.panel.themeDark')}</Radio>
                            <Radio value="auto">{t('settings.panel.themeAuto')}</Radio>
                        </RadioGroup>
                    }
                />
                <SettingRow
                    label={t('settings.panel.menuTabs')}
                    help={t('settings.panel.menuTabsHelper')}
                    value={
                        <RadioGroup
                            type="button"
                            value={data?.menuTabs || 'Disable'}
                            onChange={(e) => void onSetting('MenuTabs', String(e.target.value))}
                        >
                            <Radio value="Enable">{t('settings.panel.enable')}</Radio>
                            <Radio value="Disable">{t('settings.panel.disable')}</Radio>
                        </RadioGroup>
                    }
                />
                <SettingRow
                    label={t('settings.panel.menuAccordion')}
                    help={t('settings.panel.menuAccordionHelper')}
                    value={
                        <RadioGroup
                            type="button"
                            value={data?.menuAccordion || 'Disable'}
                            onChange={(e) => void onSetting('MenuAccordion', String(e.target.value))}
                        >
                            <Radio value="Enable">{t('settings.panel.enable')}</Radio>
                            <Radio value="Disable">{t('settings.panel.disable')}</Radio>
                        </RadioGroup>
                    }
                />
                <SettingRow
                    label={t('settings.panel.panelName')}
                    value={data?.panelName || '-'}
                    action={
                        <Button theme="borderless" onClick={() => openEdit('panelName', data?.panelName || '')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.panel.language')}
                    help={t('settings.panel.languageHelper')}
                    value={
                        <Select
                            style={{ width: 180 }}
                            value={data?.language || 'zh'}
                            optionList={SUPPORTED_LANGUAGES.map((l) => ({ label: l.label, value: l.value }))}
                            onChange={(v) => void onLanguage(String(v))}
                        />
                    }
                />
                <SettingRow
                    label={t('settings.panel.sessionTimeout')}
                    help={t('settings.panel.sessionTimeoutHelper')}
                    value={data?.sessionTimeout ? t('settings.panel.seconds', { count: Number(data.sessionTimeout) }) : '-'}
                    action={
                        <Button theme="light" onClick={() => openEdit('sessionTimeout', data?.sessionTimeout || '300')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.panel.systemIP')}
                    help={t('settings.panel.systemIPHelper')}
                    value={agent?.systemIP || t('settings.panel.notSet')}
                    action={
                        <Button theme="light" onClick={() => openEdit('systemIP', agent?.systemIP || '')}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.panel.developerMode')}
                    help={t('settings.panel.developerModeHelper')}
                    value={
                        <RadioGroup
                            type="button"
                            value={data?.developerMode || 'Disable'}
                            onChange={(e) => void onSetting('DeveloperMode', String(e.target.value))}
                        >
                            <Radio value="Enable">{t('settings.panel.enable')}</Radio>
                            <Radio value="Disable">{t('settings.panel.disable')}</Radio>
                        </RadioGroup>
                    }
                />
                <SettingRow
                    label={t('settings.panel.region')}
                    help={t('settings.panel.regionHelper')}
                    value={
                        <Select
                            value={data?.edition || 'cn'}
                            style={{ width: 200 }}
                            optionList={[
                                { label: t('settings.panel.regionCn'), value: 'cn' },
                                { label: t('settings.panel.regionIntl'), value: 'intl' },
                            ]}
                            onChange={(v) => void onSetting('Edition', String(v))}
                        />
                    }
                />
                <SettingRow
                    label={t('settings.panel.proxy')}
                    help={t('settings.panel.proxyHelper')}
                    value={data?.proxyType ? `${data.proxyType}://${data.proxyUrl}:${data.proxyPort}` : t('settings.panel.proxyNone')}
                    action={
                        <Button theme="light" onClick={openProxy}>
                            {t('settings.set')}
                        </Button>
                    }
                />
                <SettingRow
                    label={t('settings.panel.menuSetting')}
                    help={t('settings.panel.menuSettingHelper')}
                    value={data?.hideMenu || ''}
                    action={
                        <Button theme="light" onClick={onDefaultMenu}>
                            {t('settings.panel.menuDefault')}
                        </Button>
                    }
                />
            </Card>

            <Modal
                title={t('settings.panel.editTitle')}
                visible={editKey !== null && editKey !== 'proxy'}
                onCancel={() => setEditKey(null)}
                onOk={submitEdit}
            >
                {editKey === 'panelName' ? (
                    <Field label={t('settings.panel.panelName')}>
                        <Input value={draft} onChange={setDraft} maxLength={64} showClear />
                    </Field>
                ) : null}
                {editKey === 'sessionTimeout' ? (
                    <Field label={t('settings.panel.sessionTimeout')} help={t('settings.panel.sessionTimeoutHelper2')}>
                        <InputNumber value={Number(draft)} min={300} step={60} onChange={(v) => setDraft(String(v ?? ''))} />
                    </Field>
                ) : null}
                {editKey === 'systemIP' ? (
                    <Field label={t('settings.panel.systemIP')} help={t('settings.panel.systemIPHelper')}>
                        <Input value={draft} onChange={setDraft} placeholder="https://1.2.3.4:9999" showClear />
                    </Field>
                ) : null}
            </Modal>

            <Modal
                title={t('settings.panel.proxy')}
                visible={editKey === 'proxy'}
                onCancel={() => setEditKey(null)}
                onOk={submitProxy}
                confirmLoading={savingProxy}
            >
                <Field label={t('settings.panel.proxyType')}>
                    <Select
                        value={proxy.proxyType || 'close'}
                        style={{ width: '100%' }}
                        optionList={[
                            { label: t('settings.panel.proxyClose'), value: 'close' },
                            { label: 'http', value: 'http' },
                            { label: 'https', value: 'https' },
                            { label: 'socks5', value: 'socks5' },
                        ]}
                        onChange={(v) => setProxy((p) => ({ ...p, proxyType: String(v) }))}
                    />
                </Field>
                {proxy.proxyType && proxy.proxyType !== 'close' ? (
                    <>
                        <Field label={t('settings.panel.proxyUrl')}>
                            <Input
                                value={proxy.proxyUrl}
                                onChange={(v) => setProxy((p) => ({ ...p, proxyUrl: v }))}
                                placeholder="127.0.0.1"
                                showClear
                            />
                        </Field>
                        <Field label={t('settings.panel.proxyPort')}>
                            <Input
                                value={proxy.proxyPort}
                                onChange={(v) => setProxy((p) => ({ ...p, proxyPort: v }))}
                                placeholder="7890"
                                showClear
                            />
                        </Field>
                        <Field label={t('settings.panel.proxyUser')}>
                            <Input
                                value={proxy.proxyUser}
                                onChange={(v) => setProxy((p) => ({ ...p, proxyUser: v }))}
                                showClear
                            />
                        </Field>
                        <Field label={t('settings.panel.proxyPasswd')}>
                            <Input
                                mode="password"
                                value={proxy.proxyPasswd}
                                onChange={(v) => setProxy((p) => ({ ...p, proxyPasswd: v }))}
                            />
                        </Field>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={proxy.proxyPasswdKeep === 'Enable'}
                                onChange={(e) =>
                                    setProxy((p) => ({ ...p, proxyPasswdKeep: e.target.checked ? 'Enable' : 'Disable' }))
                                }
                            />
                            {t('settings.panel.proxyKeep')}
                        </label>
                    </>
                ) : null}
            </Modal>
        </div>
    );
}
