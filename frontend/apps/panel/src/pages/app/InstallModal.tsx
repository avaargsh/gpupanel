import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldLabel, FieldGroup } from '@/components/ui/field';
import { useEffect, useRef, useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetAppByKeyQuery, useGetAppDetailQuery, useInstallAppMutation, type AppFormField } from '@/api/appApi';
import { useAppSelector } from '@/store/hooks';
import { clearPendingAppInstall, readPendingAppInstall, savePendingAppInstall, type PendingAppInstall } from '@/utils/app-install-pending';
import InstallReceipt from './InstallReceipt';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
export const newInstallTaskID = () => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
function ParamField({
    field,
    value,
    onChange,
    disabled,
}: {
    field: AppFormField;
    value: unknown;
    onChange: (v: unknown) => void;
    disabled?: boolean;
}) {
    const id = useId();
    const label = field.label?.zh || field.labelZh || field.envKey;
    if (field.values && field.values.length > 0) {
        return (
            <Field>
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                <NativeSelect
                    id={id}
                    value={Array.isArray(value) ? value.map(String) : String(value ?? '')}
                    disabled={disabled}
                    multiple={field.multiple}
                    style={{ width: '100%' }}
                    aria-label={label}
                    onChange={(event) =>
                        onChange(
                            event.target.multiple
                                ? Array.from(
                                      event.target.selectedOptions,
                                      (item) =>
                                          (field.values ?? [])
                                              .map((o) => ({ label: o.label, value: o.value }))
                                              .find((option) => String(option.value) === item.value)?.value ?? item.value,
                                  )
                                : ((field.values ?? [])
                                      .map((o) => ({ label: o.label, value: o.value }))
                                      .find((option) => String(option.value) === event.target.value)?.value ?? event.target.value),
                        )
                    }
                >
                    <NativeSelectOption value="" disabled>
                        {'—'}
                    </NativeSelectOption>
                    {(field.values ?? [])
                        .map((o) => ({ label: o.label, value: o.value }))
                        .map((option) => (
                            <NativeSelectOption key={String(option.value)} value={option.value}>
                                {option.label}
                            </NativeSelectOption>
                        ))}
                </NativeSelect>
            </Field>
        );
    }
    const isNumber = field.type === 'number';
    return (
        <Field>
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
            <Input
                id={id}
                value={value === undefined || value === null ? '' : String(value)}
                disabled={disabled}
                aria-label={label}
                type={isNumber ? 'number' : field.type === 'password' ? 'password' : 'text'}
                onChange={(event) =>
                    onChange(isNumber ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)
                }
            />
        </Field>
    );
}
export default function InstallModal({ appKey, onClose }: { appKey: string; onClose: () => void }) {
    const { t } = useTranslation();
    const appQuery = useGetAppByKeyQuery(appKey);
    const app = appQuery.currentData;
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const [originNode] = useState(node);
    const [pending, setPending] = useState<PendingAppInstall | null>(readPendingAppInstall);
    const [phase, setPhase] = useState<'idle' | 'submitting' | 'uncertain'>(() => (readPendingAppInstall() ? 'uncertain' : 'idle'));
    const singleFlight = useRef(false);
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
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
    const detailQuery = useGetAppDetailQuery({ appId: app?.id ?? 0, version, type: 'app' }, { skip: !app?.id || !version });
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
        if (!name.trim()) return toast.error(t('apps.install.nameRequired'));
        if (!version) return toast.error(t('apps.install.versionRequired'));
        if (!detail || detailQuery.isFetching || detailQuery.isError || appQuery.isError) return;
        const missing = detail.params?.formFields?.find(
            (field) => field.required && (params[field.envKey] === '' || params[field.envKey] == null),
        );
        if (missing) return toast.error(missing.labelZh || missing.envKey);
        singleFlight.current = true;
        if (!window.confirm('确认创建应用与 Docker 资源？ / Create application and Docker resources?')) {
            singleFlight.current = false; return;
        }
        const receipt = { taskID: newInstallTaskID(), node, appKey };
        if (!savePendingAppInstall(receipt)) {
            singleFlight.current = false;
            setPhase('uncertain');
            setPending(readPendingAppInstall());
            toast.error('无法安全保存回执；未发送请求 / Cannot save receipt; request not sent');
            return;
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
            if (mounted.current) toast.info('请求已受理，请核对实际状态 / Accepted; inspect actual outcome');
        } catch (e) {
            if (mounted.current) toast.error(errText(e));
        } finally {
            singleFlight.current = false;
            if (mounted.current) setPhase('uncertain');
        }
    };
    const fields = detail?.params?.formFields ?? [];
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !isLoading)
                    (() => {
                        if (!singleFlight.current) onClose();
                    })();
            }}
        >
            <DialogContent
                aria-describedby={undefined}
                className="max-h-[90vh] overflow-y-auto"
                style={{ maxWidth: 560 }}
                onInteractOutside={(event) => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>{t('apps.install.title')}</DialogTitle>
                </DialogHeader>
                {phase === 'uncertain' ? (
                    <Alert>
                        <AlertDescription>
                            {
                                '结果未核对，禁止再次提交。请检查原 Host、任务及 Docker 资源。 / Unresolved outcome; inspect original Host, task and resources before retrying.'
                            }
                        </AlertDescription>
                    </Alert>
                ) : null}
                {pending ? (
                    <>
                        <InstallReceipt receipt={pending} />
                        <Button
                            onClick={() => {
                                if (
                                    window.confirm(
                                        '已人工核对资源并清除本地提示？不会回滚或重试安装。 / Reviewed resources and clear local hint? No rollback or retry.',
                                    )
                                ) {
                                    if (clearPendingAppInstall(pending.taskID)) {
                                        setPending(null);
                                        setPhase('idle');
                                    }
                                }
                            }}
                            variant={'outline'}
                            type={'button'}
                            disabled={phase !== 'uncertain' || node !== pending.node}
                        >
                            已人工核对 / Reviewed manually
                        </Button>
                    </>
                ) : null}
                {node !== originNode ? (
                    <Alert>
                        <AlertDescription>{'Host 已切换，请重新打开 / Host changed; reopen on intended Host'}</AlertDescription>
                    </Alert>
                ) : null}
                {appQuery.isError || detailQuery.isError ? (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {
                                <Button
                                    onClick={() => {
                                        void appQuery.refetch();
                                        if (version) void detailQuery.refetch();
                                    }}
                                    variant={'outline'}
                                    type={'button'}
                                >
                                    重试 / Retry
                                </Button>
                            }
                        </AlertDescription>
                    </Alert>
                ) : null}
                <fieldset disabled={phase !== 'idle'} className="m-0 border-0 p-0">
                    <FieldGroup>
                        <span className="text-muted-foreground text-sm">{t('apps.install.name')}</span>
                        <Input
                            value={name}
                            disabled={phase !== 'idle'}
                            aria-label={t('apps.install.name')}
                            onChange={(event) => setName(event.target.value)}
                        />
                        <span className="text-muted-foreground text-sm">{t('apps.install.version')}</span>
                        <NativeSelect
                            value={version}
                            disabled={phase !== 'idle'}
                            style={{ width: '100%' }}
                            aria-label={t('apps.install.version')}
                            onChange={(event) =>
                                setVersion(
                                    (app?.versions ?? [])
                                        .map((v) => ({ label: v, value: v }))
                                        .find((option) => String(option.value) === event.target.value)?.value ??
                                        (event.target.value as string),
                                )
                            }
                        >
                            <NativeSelectOption value="" disabled>
                                {'—'}
                            </NativeSelectOption>
                            {(app?.versions ?? [])
                                .map((v) => ({ label: v, value: v }))
                                .map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={option.value}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                        {detailQuery.isLoading ? (
                            <Spinner role="status" aria-label="Loading" />
                        ) : fields.length === 0 ? (
                            <span className="text-muted-foreground text-sm">{t('apps.install.noParams')}</span>
                        ) : (
                            fields
                                .filter((f) => f.envKey)
                                .map((f) => (
                                    <ParamField
                                        disabled={phase !== 'idle'}
                                        key={f.envKey}
                                        field={f}
                                        value={params[f.envKey]}
                                        onChange={(v) => setParams((p) => ({ ...p, [f.envKey]: v }))}
                                    />
                                ))
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                            <span className="text-sm">{t('apps.install.advanced')}</span>
                        </label>
                        {advanced && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Field>
                                    <FieldLabel htmlFor="install-container-name">{t('apps.install.containerName')}</FieldLabel>
                                    <Input
                                        id="install-container-name"
                                        aria-label={t('apps.install.containerName')}
                                        value={containerName}
                                        placeholder={t('apps.install.containerNameHelper')}
                                        onChange={(event) => setContainerName(event.target.value)}
                                    />
                                </Field>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={allowPort} onChange={(e) => setAllowPort(e.target.checked)} />
                                    <span className="text-sm">{t('apps.install.allowPort')}</span>
                                </label>
                                {allowPort && (
                                    <Input
                                        aria-label={t('apps.install.specifyIPHelper')}
                                        value={specifyIP}
                                        placeholder={t('apps.install.specifyIPHelper')}
                                        onChange={(event) => setSpecifyIP(event.target.value)}
                                    />
                                )}
                                <NativeSelect
                                    aria-label="Restart policy"
                                    value={restartPolicy}
                                    style={{ width: '100%' }}
                                    onChange={(event) =>
                                        setRestartPolicy(
                                            [
                                                { label: 'no', value: 'no' },
                                                { label: 'always', value: 'always' },
                                                { label: 'on-failure', value: 'on-failure' },
                                                { label: 'unless-stopped', value: 'unless-stopped' },
                                            ].find((option) => String(option.value) === event.target.value)?.value ??
                                                (event.target.value as string),
                                        )
                                    }
                                >
                                    <NativeSelectOption value="" disabled>
                                        {'—'}
                                    </NativeSelectOption>
                                    {[
                                        { label: 'no', value: 'no' },
                                        { label: 'always', value: 'always' },
                                        { label: 'on-failure', value: 'on-failure' },
                                        { label: 'unless-stopped', value: 'unless-stopped' },
                                    ].map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={option.value}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input type="checkbox" checked={pullImage} onChange={(e) => setPullImage(e.target.checked)} />
                                    <span className="text-sm">{t('apps.install.pullImage')}</span>
                                </label>
                            </div>
                        )}
                    </FieldGroup>
                </fieldset>
                <DialogFooter>
                    <Button
                        variant="outline"
                        disabled={isLoading}
                        onClick={() => {
                            if (!singleFlight.current) onClose();
                        }}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        disabled={
                            isLoading ||
                            phase !== 'idle' ||
                            !!pending ||
                            node !== originNode ||
                            appQuery.isFetching ||
                            detailQuery.isFetching ||
                            appQuery.isError ||
                            detailQuery.isError ||
                            !detail
                        }
                        onClick={submit}
                    >
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('apps.actions.install')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
