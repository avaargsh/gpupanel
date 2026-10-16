import { Field, FieldLabel } from '@/components/ui/field';

import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

import { Switch } from '@/components/ui/switch';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateAccountMutation, useUpdateAccountMutation, type AccountItem, type ProviderApiInfo, type ProviderInfo } from '@/api/aiApi';

const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
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
export function AccountForm({
    account,
    providers,
    onClose,
}: {
    account: AccountItem | null;
    providers: ProviderInfo[];
    onClose: () => void;
}) {
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
    const [modelSearch, setModelSearch] = useState('');
    const visibleModels = models.filter(
        (model) => model.id === form.verifyModel || (model.name || model.id).toLowerCase().includes(modelSearch.toLowerCase()),
    );
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
        if (!form.name.trim()) return toast.warning(t('ai.accounts.form.nameRequired'));
        if (!form.apiKey.trim()) return toast.warning(t('ai.accounts.form.apiKeyRequired'));
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
            toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !(creating || updating)) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: 520 }}>
                <DialogHeader>
                    <DialogTitle>{account ? t('ai.accounts.form.titleEdit') : t('ai.accounts.form.titleCreate')}</DialogTitle>
                </DialogHeader>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Field>
                        <FieldLabel htmlFor="ai-accounts-1">{t('ai.accounts.form.provider')}</FieldLabel>
                        <NativeSelect
                            id="ai-accounts-1"
                            value={form.provider || undefined}
                            style={{ width: '100%' }}
                            onChange={(event) =>
                                onProviderChange(
                                    String(
                                        providers
                                            .map((p) => ({ label: p.displayName || p.provider, value: p.provider }))
                                            .find((option) => String(option.value) === event.target.value)?.value ?? event.target.value,
                                    ),
                                )
                            }
                        >
                            <NativeSelectOption value="" disabled>
                                {t('ai.accounts.form.provider')}
                            </NativeSelectOption>
                            {providers
                                .map((p) => ({ label: p.displayName || p.provider, value: p.provider }))
                                .map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={option.value}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-accounts-2">{t('ai.accounts.form.apiType')}</FieldLabel>
                        <NativeSelect
                            id="ai-accounts-2"
                            value={form.apiType || undefined}
                            style={{ width: '100%' }}
                            onChange={(event) =>
                                onApiTypeChange(
                                    String(
                                        (provider?.apiTypes ?? [])
                                            .map((a) => ({ label: a.apiType, value: a.apiType }))
                                            .find((option) => String(option.value) === event.target.value)?.value ?? event.target.value,
                                    ),
                                )
                            }
                        >
                            <NativeSelectOption value="" disabled>
                                {t('ai.accounts.form.apiType')}
                            </NativeSelectOption>
                            {(provider?.apiTypes ?? [])
                                .map((a) => ({ label: a.apiType, value: a.apiType }))
                                .map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={option.value}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-accounts-3">{t('ai.accounts.form.baseUrl')}</FieldLabel>
                        <Input
                            id="ai-accounts-3"
                            value={form.baseUrl}
                            disabled={!api?.editableBaseUrl && account != null}
                            onChange={(event) => setForm((s) => ({ ...s, baseUrl: event.target.value }))}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-accounts-4">{t('ai.accounts.form.name')}</FieldLabel>
                        <Input
                            id="ai-accounts-4"
                            value={form.name}
                            onChange={(event) => setForm((s) => ({ ...s, name: event.target.value }))}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-accounts-5">{t('ai.accounts.form.apiKey')}</FieldLabel>
                        <Input
                            id="ai-accounts-5"
                            value={form.apiKey}
                            type="password"
                            onChange={(event) => setForm((s) => ({ ...s, apiKey: event.target.value }))}
                        />
                    </Field>
                    {authModes.length > 0 && (
                        <Field>
                            <FieldLabel htmlFor="ai-accounts-6">{t('ai.accounts.form.authMode')}</FieldLabel>
                            <NativeSelect
                                id="ai-accounts-6"
                                value={form.authMode || undefined}
                                style={{ width: '100%' }}
                                onChange={(event) =>
                                    setForm((s) => ({
                                        ...s,
                                        authMode: String(
                                            authModes
                                                .map((m) => ({ label: m, value: m }))
                                                .find((option) => String(option.value) === event.target.value)?.value ?? event.target.value,
                                        ),
                                    }))
                                }
                            >
                                <NativeSelectOption value="" disabled>
                                    {'—'}
                                </NativeSelectOption>
                                {authModes
                                    .map((m) => ({ label: m, value: m }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={option.value}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
                        </Field>
                    )}
                    {models.length > 0 && (
                        <Field>
                            <FieldLabel htmlFor="ai-accounts-7">{t('ai.accounts.form.verifyModel')}</FieldLabel>
                            <Input
                                aria-label={t('ai.accounts.form.verifyModel')}
                                value={modelSearch}
                                onChange={(event) => setModelSearch(event.target.value)}
                                placeholder={t('ai.accounts.form.verifyModel')}
                            />
                            <NativeSelect
                                id="ai-accounts-7"
                                value={form.verifyModel || undefined}
                                style={{ width: '100%' }}
                                onChange={(event) =>
                                    setForm((s) => ({
                                        ...s,
                                        verifyModel: String(
                                            models
                                                .map((m) => ({ label: m.name || m.id, value: m.id }))
                                                .find((option) => String(option.value) === event.target.value)?.value ?? event.target.value,
                                        ),
                                    }))
                                }
                            >
                                <NativeSelectOption value="" disabled>
                                    {'—'}
                                </NativeSelectOption>
                                {visibleModels
                                    .map((m) => ({ label: m.name || m.id, value: m.id }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={option.value}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
                        </Field>
                    )}
                    <Field>
                        <FieldLabel htmlFor="ai-accounts-8">{t('ai.accounts.form.remark')}</FieldLabel>
                        <Input
                            id="ai-accounts-8"
                            value={form.remark}
                            onChange={(event) => setForm((s) => ({ ...s, remark: event.target.value }))}
                        />
                    </Field>
                    <SwitchLine
                        checked={form.remember}
                        onChange={(v) => setForm((s) => ({ ...s, remember: v }))}
                        label={t('ai.accounts.form.remember')}
                    />
                    {!account && (
                        <SwitchLine
                            checked={form.validate}
                            onChange={(v) => setForm((s) => ({ ...s, validate: v }))}
                            label={t('ai.accounts.form.validate')}
                        />
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" disabled={creating || updating} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={creating || updating} onClick={submit}>
                        {creating || updating ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
function SwitchLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
            <span className="text-sm">{label}</span>
        </label>
    );
}
