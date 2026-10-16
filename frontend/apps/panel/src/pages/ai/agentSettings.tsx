import { Field, FieldLabel } from '@/components/ui/field';
import { toast } from 'sonner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useGetAccountModelsQuery,
    useGetAgentConfigFileQuery,
    useGetAgentModelConfigQuery,
    useGetAgentOtherConfigQuery,
    useGetAgentSecurityConfigQuery,
    useSearchAccountsQuery,
    useUpdateAgentConfigFileMutation,
    useUpdateAgentModelConfigMutation,
    useUpdateAgentOtherConfigMutation,
    useUpdateAgentSecurityConfigMutation,
    type AgentModelMetadata,
} from '@/api/aiApi';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const INPUT_MODES = ['auto', 'text', 'image'];
const splitLines = (text: string) =>
    text
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
/** 模型配置页签：账户 / 默认模型 / 备用模型 / 模型元数据。 */
function ModelTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data, isLoading } = useGetAgentModelConfigQuery(agentId);
    const { data: accountPage } = useSearchAccountsQuery({ page: 1, pageSize: 200, provider: '', apiType: '', name: '' });
    const accounts = accountPage?.items ?? [];
    const [accountId, setAccountId] = useState<number | undefined>();
    const [model, setModel] = useState('');
    const [fallbacks, setFallbacks] = useState<string[]>([]);
    const [metadata, setMetadata] = useState<AgentModelMetadata[]>([]);
    useEffect(() => {
        if (!data) return;
        setAccountId(data.accountId || undefined);
        setModel(data.model || '');
        setFallbacks(data.fallbacks ?? []);
        setMetadata(data.metadata ?? []);
    }, [data]);
    const { data: models } = useGetAccountModelsQuery(accountId as number, { skip: !accountId });
    const modelOptions = (models ?? []).map((m) => ({ label: m.name, value: m.name }));
    const [update, { isLoading: saving }] = useUpdateAgentModelConfigMutation();
    const addMetadata = () => setMetadata((rows) => [...rows, { model: '', inputMode: 'auto', contextWindow: 0, maxTokens: 0 }]);
    const patchMetadata = (index: number, patch: Partial<AgentModelMetadata>) =>
        setMetadata((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    const removeMetadata = (index: number) => setMetadata((rows) => rows.filter((_, i) => i !== index));
    const submit = async () => {
        if (!accountId || !model) return toast.warning(t('ai.agents.model.modelRequired'));
        try {
            await update({ agentId, accountId, model, fallbacks, metadata: metadata.filter((m) => m.model) }).unwrap();
            toast.success(t('ai.agents.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <div className="flex flex-col gap-3">
            <Field>
                <FieldLabel htmlFor="ai-agentSettings-1">{t('ai.agents.model.account')}</FieldLabel>
                <NativeSelect
                    id="ai-agentSettings-1"
                    value={accountId}
                    className="w-full"
                    onChange={(event) => setFallbacks(Array.from(event.target.selectedOptions, (option) => option.value))}
                >
                    <NativeSelectOption value="" disabled>
                        {t('ai.agents.model.account')}
                    </NativeSelectOption>
                    {accounts
                        .map((a) => ({ label: `${a.name} (${a.providerName || a.provider})`, value: a.id }))
                        .map((option) => (
                            <NativeSelectOption key={String(option.value)} value={option.value}>
                                {option.label}
                            </NativeSelectOption>
                        ))}
                </NativeSelect>
            </Field>
            <Field>
                <FieldLabel htmlFor="ai-agentSettings-2">{t('ai.agents.model.model')}</FieldLabel>
                <NativeSelect
                    id="ai-agentSettings-2"
                    value={model}
                    className="w-full"
                    onChange={(event) => setModel(event.target.value)}
                >
                    <NativeSelectOption value="" disabled>
                        {t('ai.agents.model.model')}
                    </NativeSelectOption>
                    {modelOptions.map((option) => (
                        <NativeSelectOption key={String(option.value)} value={option.value}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </Field>
            <Field>
                <FieldLabel htmlFor="ai-agentSettings-3">{t('ai.agents.model.fallbacks')}</FieldLabel>
                <NativeSelect
                    id="ai-agentSettings-3"
                    value={fallbacks}
                    multiple
                    className="w-full"
                    onChange={(event) => setFallbacks(Array.from(event.target.selectedOptions, (option) => option.value))}
                >
                    <NativeSelectOption value="" disabled>
                        {t('ai.agents.model.fallbacks')}
                    </NativeSelectOption>
                    {modelOptions.map((option) => (
                        <NativeSelectOption key={String(option.value)} value={option.value}>
                            {option.label}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </Field>
            <div>
                <div className="flex flex-row  gap-3 items-center justify-between w-full">
                    <span className="text-muted-foreground text-sm">{t('ai.agents.model.metadata')}</span>
                    <Button onClick={addMetadata} variant={'outline'} size="sm" type={'button'}>
                        {t('ai.agents.model.addMetadata')}
                    </Button>
                </div>
                <div className="flex flex-col gap-3" aria-busy={false}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('ai.agents.model.model')}</TableHead>
                                <TableHead className="w-[130px]">{t('ai.agents.model.inputMode')}</TableHead>
                                <TableHead className="w-[130px]">{t('ai.agents.model.contextWindow')}</TableHead>
                                <TableHead className="w-[130px]">{t('ai.agents.model.maxTokens')}</TableHead>
                                <TableHead className="w-[70px]">{''}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {metadata.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5}>
                                        {<span className="text-muted-foreground text-sm">{t('ai.agents.model.empty')}</span>}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                metadata.map((row, rowIndex) => (
                                    <TableRow key={rowIndex}>
                                        <TableCell>
                                            <Input
                                                aria-label={'gpt-4o'}
                                                value={row.model}
                                                placeholder={'gpt-4o'}
                                                onChange={(event) => patchMetadata(rowIndex, { model: event.target.value })}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <NativeSelect
                                                aria-label={t('ai.agents.model.inputMode')}
                                                value={row.inputMode}
                                                className="w-full"
                                                onChange={(event) =>
                                                    patchMetadata(rowIndex, {
                                                        inputMode: event.target.value as AgentModelMetadata['inputMode'],
                                                    })
                                                }
                                            >
                                                <NativeSelectOption value="" disabled>
                                                    {'—'}
                                                </NativeSelectOption>
                                                {INPUT_MODES.map((m) => ({ label: t(`ai.agents.model.mode.${m}`), value: m })).map(
                                                    (option) => (
                                                        <NativeSelectOption key={String(option.value)} value={option.value}>
                                                            {option.label}
                                                        </NativeSelectOption>
                                                    ),
                                                )}
                                            </NativeSelect>
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                aria-label={t('ai.agents.model.contextWindow')}
                                                value={row.contextWindow}
                                                min={0}
                                                type="number"
                                                onChange={(event) =>
                                                    patchMetadata(rowIndex, { contextWindow: Number(event.target.value) || 0 })
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Input
                                                aria-label={t('ai.agents.model.maxTokens')}
                                                value={row.maxTokens}
                                                min={0}
                                                type="number"
                                                onChange={(event) => patchMetadata(rowIndex, { maxTokens: Number(event.target.value) || 0 })}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {
                                                <Button
                                                    onClick={() => removeMetadata(rowIndex)}
                                                    variant={'destructive'}
                                                    size="sm"
                                                    type={'button'}
                                                    disabled={false}
                                                >
                                                    {t('common.delete')}
                                                </Button>
                                            }
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
            <div className="text-right">
                <Button onClick={submit} variant={'outline'} type={'button'} disabled={false || saving || isLoading}>
                    {saving || isLoading ? <Spinner data-icon="inline-start" /> : null}
                    {t('ai.agents.save')}
                </Button>
            </div>
        </div>
    );
}
/** 安全配置页签：允许来源（每行一个）。 */
function SecurityTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data } = useGetAgentSecurityConfigQuery(agentId);
    const [origins, setOrigins] = useState('');
    const [update, { isLoading }] = useUpdateAgentSecurityConfigMutation();
    useEffect(() => {
        setOrigins((data?.allowedOrigins ?? []).join('\n'));
    }, [data]);
    const submit = async () => {
        try {
            await update({ agentId, allowedOrigins: splitLines(origins) }).unwrap();
            toast.success(t('ai.agents.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <Field>
            <FieldLabel htmlFor="ai-agentSettings-4">{t('ai.agents.security.helper')}</FieldLabel>
            <Textarea
                id="ai-agentSettings-4"
                value={origins}
                placeholder={'https://example.com'}
                rows={6}
                onChange={(event) => setOrigins(event.target.value)}
            />
            <div className="text-right">
                <Button onClick={submit} variant={'outline'} type={'button'} disabled={false || isLoading}>
                    {isLoading ? <Spinner data-icon="inline-start" /> : null}
                    {t('ai.agents.save')}
                </Button>
            </div>
        </Field>
    );
}
/** 其他配置页签。 */
function OtherTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data } = useGetAgentOtherConfigQuery(agentId);
    const [form, setForm] = useState({
        userTimezone: '',
        browserEnabled: false,
        npmRegistry: '',
        dashboardUsername: '',
        dashboardPassword: '',
    });
    useEffect(() => {
        if (!data) return;
        setForm({
            userTimezone: data.userTimezone || '',
            browserEnabled: !!data.browserEnabled,
            npmRegistry: data.npmRegistry || '',
            dashboardUsername: data.dashboardUsername || '',
            dashboardPassword: data.dashboardPassword || '',
        });
    }, [data]);
    const [update, { isLoading }] = useUpdateAgentOtherConfigMutation();
    const submit = async () => {
        try {
            await update({ agentId, ...form }).unwrap();
            toast.success(t('ai.agents.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const field = (label: string, value: string, onChange: (v: string) => void, password = false) => (
        <Field>
            <FieldLabel htmlFor="ai-agentSettings-5">{label}</FieldLabel>
            <Input id="ai-agentSettings-5" value={value} type="password" onChange={(event) => onChange(event.target.value)} />
        </Field>
    );
    return (
        <div className="flex flex-col gap-3">
            {field(t('ai.agents.other.userTimezone'), form.userTimezone, (v) => setForm((f) => ({ ...f, userTimezone: v })))}
            <label className="flex items-center gap-2">
                <Switch
                    aria-label={t('ai.agents.other.browserEnabled')}
                    checked={form.browserEnabled}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, browserEnabled: Boolean(v) }))}
                />
                <span className="text-sm">{t('ai.agents.other.browserEnabled')}</span>
            </label>
            {field(t('ai.agents.other.npmRegistry'), form.npmRegistry, (v) => setForm((f) => ({ ...f, npmRegistry: v })))}
            {field(t('ai.agents.other.dashboardUsername'), form.dashboardUsername, (v) => setForm((f) => ({ ...f, dashboardUsername: v })))}
            {field(
                t('ai.agents.other.dashboardPassword'),
                form.dashboardPassword,
                (v) => setForm((f) => ({ ...f, dashboardPassword: v })),
                true,
            )}
            <div className="text-right">
                <Button onClick={submit} variant={'outline'} type={'button'} disabled={false || isLoading}>
                    {isLoading ? <Spinner data-icon="inline-start" /> : null}
                    {t('ai.agents.save')}
                </Button>
            </div>
        </div>
    );
}
/** 配置文件页签：直接编辑原始配置文本。 */
function ConfigFileTab({ agentId }: { agentId: number }) {
    const { t } = useTranslation();
    const { data, isLoading } = useGetAgentConfigFileQuery(agentId);
    const [content, setContent] = useState('');
    const [update, { isLoading: saving }] = useUpdateAgentConfigFileMutation();
    useEffect(() => {
        if (data) setContent(data.content ?? '');
    }, [data]);
    const submit = async () => {
        try {
            await update({ agentId, content }).unwrap();
            toast.success(t('ai.agents.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <Field>
            <FieldLabel htmlFor="ai-agentSettings-6">{t('ai.agents.configFile.helper')}</FieldLabel>
            <Textarea
                id="ai-agentSettings-6"
                value={content}
                placeholder={isLoading ? t('common.loading') : t('ai.agents.configFile.empty')}
                className="font-mono"
                onChange={(event) => setContent(event.target.value)}
            />
            <div className="text-right">
                <Button onClick={submit} variant={'outline'} type={'button'} disabled={false || saving}>
                    {saving ? <Spinner data-icon="inline-start" /> : null}
                    {t('ai.agents.save')}
                </Button>
            </div>
        </Field>
    );
}
/** 智能体设置弹窗：模型 / 安全 / 其他 / 配置文件四个页签。 */
export default function AgentConfigModal({ agentId, name, onClose }: { agentId: number; name: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState('model');
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[760px]">
                <DialogHeader>
                    <DialogTitle>{`${t('ai.agents.configTitle')} · ${name}`}</DialogTitle>
                </DialogHeader>
                <Tabs value={tab} onValueChange={(k) => setTab(String(k))}>
                    <TabsList>
                        <TabsTrigger value={'model'}>{t('ai.agents.tabs.model')}</TabsTrigger>
                        <TabsTrigger value={'security'}>{t('ai.agents.tabs.security')}</TabsTrigger>
                        <TabsTrigger value={'other'}>{t('ai.agents.tabs.other')}</TabsTrigger>
                        <TabsTrigger value={'configFile'}>{t('ai.agents.tabs.configFile')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value={'model'}>
                        <ModelTab agentId={agentId} />
                    </TabsContent>
                    <TabsContent value={'security'}>
                        <SecurityTab agentId={agentId} />
                    </TabsContent>
                    <TabsContent value={'other'}>
                        <OtherTab agentId={agentId} />
                    </TabsContent>
                    <TabsContent value={'configFile'}>
                        <ConfigFileTab agentId={agentId} />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
