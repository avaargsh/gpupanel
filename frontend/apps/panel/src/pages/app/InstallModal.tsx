import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Input, Modal, Select, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useGetAppByKeyQuery, useGetAppDetailQuery, useInstallAppMutation, type AppFormField } from '@/api/appApi';
import { useAppSelector } from '@/store/hooks';
import { clearPendingAppInstall, readPendingAppInstall, savePendingAppInstall, type PendingAppInstall } from '@/utils/app-install-pending';
import InstallReceipt from './InstallReceipt';
const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);
export const newInstallTaskID = () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
function ParamField({ field, value, onChange, disabled }: { field: AppFormField; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
    const label = field.label?.zh || field.labelZh || field.envKey;
    if (field.values && field.values.length > 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text size="small" type="tertiary">{label}</Text>
                <Select
                    disabled={disabled}
                    aria-label={label}
                    multiple={field.multiple}
                    value={value as string | number | (string | number)[]}
                    onChange={(v) => onChange(v)}
                    style={{ width: '100%' }}
                    optionList={field.values.map((o) => ({ label: o.label, value: o.value }))}
                />
            </div>
        );
    }
    const isNumber = field.type === 'number';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text size="small" type="tertiary">{label}</Text>
            <Input
                disabled={disabled}
                aria-label={label}
                type={isNumber ? 'number' : field.type === 'password' ? 'password' : 'text'}
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(v) => onChange(isNumber ? (v === '' ? '' : Number(v)) : v)}
            />
        </div>
    );
}

export default function InstallModal({ appKey, onClose }: { appKey: string; onClose: () => void }) {
    const { t } = useTranslation();
    const appQuery = useGetAppByKeyQuery(appKey);
    const app = appQuery.currentData;
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const [originNode] = useState(node);
    const [pending, setPending] = useState<PendingAppInstall | null>(readPendingAppInstall);
    const [phase, setPhase] = useState<'idle' | 'submitting' | 'uncertain'>(() => readPendingAppInstall() ? 'uncertain' : 'idle');
    const singleFlight = useRef(false);
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const [version, setVersion] = useState('');
    const [name, setName] = useState(appKey.replace(/^local/, ''));
    const [params, setParams] = useState<Record<string, unknown>>({});
    const [advanced, setAdvanced] = useState(false);
    const [containerName, setContainerName] = useState('');
    const [allowPort, setAllowPort] = useState(false);
    const [specifyIP, setSpecifyIP] = useState('');
    const [restartPolicy, setRestartPolicy] = useState('always');
    const [pullImage, setPullImage] = useState(true);

    useEffect(() => {
        if (app?.versions?.length && !version) setVersion(app.versions[0]);
        if (app?.key) setName(app.key.replace(/^local/, ''));
    }, [app, version]);

    const detailQuery = useGetAppDetailQuery(
        { appId: app?.id ?? 0, version, type: 'app' },
        { skip: !app?.id || !version },
    );
    const detail = detailQuery.currentData;

    useEffect(() => {
        if (!detail?.params?.formFields) return;
        const next: Record<string, unknown> = {};
        detail.params.formFields.forEach((f) => {
            if (!f.envKey) return;
            next[f.envKey] = f.default ?? '';
        });
        setParams(next);
    }, [detail]);

    const [install, { isLoading }] = useInstallAppMutation();

    const submit = async () => {
        if (singleFlight.current || phase !== 'idle' || pending || node !== originNode) return;
        if (!name.trim()) return Toast.error(t('apps.install.nameRequired'));
        if (!version) return Toast.error(t('apps.install.versionRequired'));
        if (!detail || detailQuery.isFetching || detailQuery.isError || appQuery.isError) return;
        const missing = detail.params?.formFields?.find((field) => field.required && (params[field.envKey] === '' || params[field.envKey] == null));
        if (missing) return Toast.error(missing.labelZh || missing.envKey);
        singleFlight.current = true;
        if (!window.confirm('确认创建应用与 Docker 资源？ / Create application and Docker resources?')) {
            singleFlight.current = false; return;
        }
        const receipt = { taskID: newInstallTaskID(), node, appKey };
        if (!savePendingAppInstall(receipt)) {
            singleFlight.current = false; setPhase('uncertain'); setPending(readPendingAppInstall());
            Toast.error('无法安全保存回执；未发送请求 / Cannot save receipt; request not sent'); return;
        }
        setPending(receipt);
        setPhase('submitting');
        try {
            await install({
                appDetailId: detail.id,
                params,
                name: name.trim(),
                taskID: receipt.taskID,
                advanced,
                containerName,
                allowPort,
                specifyIP,
                restartPolicy,
                pullImage,
                cpuQuota: 0,
                memoryLimit: 0,
                memoryUnit: 'M',
            }).unwrap();
            if (mounted.current) Toast.info('请求已受理，请核对实际状态 / Accepted; inspect actual outcome');
        } catch (e) {
            if (mounted.current) Toast.error(errText(e));
        } finally {
            singleFlight.current = false;
            if (mounted.current) setPhase('uncertain');
        }
    };

    const fields = detail?.params?.formFields ?? [];

    return (
        <Modal
            title={t('apps.install.title')}
            visible
            onCancel={() => { if (!singleFlight.current) onClose(); }}
            onOk={submit}
            okText={t('apps.actions.install')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            okButtonProps={{ disabled: phase !== 'idle' || Boolean(pending) || !detail || detailQuery.isFetching || detailQuery.isError || appQuery.isError || node !== originNode }}
            width={560}
            maskClosable={false}
        >
            {phase === 'uncertain' ? <Banner type="warning" description="结果未核对，禁止再次提交。请检查原 Host、任务及 Docker 资源。 / Unresolved outcome; inspect original Host, task and resources before retrying." /> : null}
            {pending ? <><InstallReceipt receipt={pending} /><Button disabled={phase !== 'uncertain' || node !== pending.node} onClick={() => {
                if (window.confirm('已人工核对资源并清除本地提示？不会回滚或重试安装。 / Reviewed resources and clear local hint? No rollback or retry.')) {
                    if (clearPendingAppInstall(pending.taskID)) { setPending(null); setPhase('idle'); }
                }
            }}>已人工核对 / Reviewed manually</Button></> : null}
            {node !== originNode ? <Banner type="warning" description="Host 已切换，请重新打开 / Host changed; reopen on intended Host" /> : null}
            {appQuery.isError || detailQuery.isError ? <Banner type="danger" description={<Button onClick={() => { void appQuery.refetch(); if (version) void detailQuery.refetch(); }}>重试 / Retry</Button>} /> : null}

            <fieldset disabled={phase !== 'idle'} style={{ border: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Text size="small" type="tertiary">{t('apps.install.name')}</Text>
                <Input aria-label={t('apps.install.name')} disabled={phase !== 'idle'} value={name} onChange={setName} />
                <Text size="small" type="tertiary">{t('apps.install.version')}</Text>
                <Select aria-label={t('apps.install.version')} disabled={phase !== 'idle'} value={version} onChange={(v) => setVersion(v as string)} style={{ width: '100%' }} optionList={(app?.versions ?? []).map((v) => ({ label: v, value: v }))} />
                {detailQuery.isLoading ? (
                    <Spin />
                ) : fields.length === 0 ? (
                    <Text type="tertiary" size="small">{t('apps.install.noParams')}</Text>
                ) : (
                    fields
                        .filter((f) => f.envKey)
                        .map((f) => <ParamField disabled={phase !== 'idle'} key={f.envKey} field={f} value={params[f.envKey]} onChange={(v) => setParams((p) => ({ ...p, [f.envKey]: v }))} />)
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                    <Text size="small">{t('apps.install.advanced')}</Text>
                </label>
                {advanced && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <Input value={containerName} onChange={setContainerName} placeholder={t('apps.install.containerNameHelper')} addonBefore={t('apps.install.containerName')} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={allowPort} onChange={(e) => setAllowPort(e.target.checked)} />
                            <Text size="small">{t('apps.install.allowPort')}</Text>
                        </label>
                        {allowPort && <Input value={specifyIP} onChange={setSpecifyIP} placeholder={t('apps.install.specifyIPHelper')} />}
                        <Select
                            value={restartPolicy}
                            onChange={(v) => setRestartPolicy(v as string)}
                            style={{ width: '100%' }}
                            optionList={[
                                { label: 'no', value: 'no' },
                                { label: 'always', value: 'always' },
                                { label: 'on-failure', value: 'on-failure' },
                                { label: 'unless-stopped', value: 'unless-stopped' },
                            ]}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={pullImage} onChange={(e) => setPullImage(e.target.checked)} />
                            <Text size="small">{t('apps.install.pullImage')}</Text>
                        </label>
                    </div>
                )}
            </fieldset>
        </Modal>
    );
}

