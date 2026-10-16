import { Field, FieldLabel } from '@/components/ui/field';

import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useBindMcpDomainMutation,
    useCreateMcpServerMutation,
    useGetMcpDomainQuery,
    useUpdateMcpDomainMutation,
    useUpdateMcpServerMutation,
    type McpServer,
} from '@/api/aiApi';

const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
interface McpForm {
    id?: number;
    name: string;
    type: string;
    command: string;
    port: number;
    containerName: string;
    baseUrl: string;
    ssePath: string;
    streamableHttpPath: string;
    outputTransport: string;
    hostIP: string;
    protocolVersion: string;
    gatewayImage: string;
    gatewayArgs: string;
}
const emptyForm = (): McpForm => ({
    name: '',
    type: 'npx',
    command: '',
    port: 8000,
    containerName: '',
    baseUrl: '',
    ssePath: '',
    streamableHttpPath: '/mcp',
    outputTransport: 'streamableHttp',
    hostIP: '127.0.0.1',
    protocolVersion: '',
    gatewayImage: '',
    gatewayArgs: '',
});
export function McpFormModal({ row, onClose }: { row: McpServer | null; onClose: () => void }) {
    const { t } = useTranslation();
    const [form, setForm] = useState<McpForm>(() =>
        row
            ? {
                  id: row.id,
                  name: row.name,
                  type: row.type,
                  command: row.command,
                  port: row.port,
                  containerName: row.containerName,
                  baseUrl: row.baseUrl,
                  ssePath: row.ssePath,
                  streamableHttpPath: row.streamableHttpPath,
                  outputTransport: row.outputTransport,
                  hostIP: row.hostIP,
                  protocolVersion: row.protocolVersion,
                  gatewayImage: row.gatewayImage,
                  gatewayArgs: row.gatewayArgs,
              }
            : emptyForm(),
    );
    const [create, { isLoading: creating }] = useCreateMcpServerMutation();
    const [update, { isLoading: updating }] = useUpdateMcpServerMutation();
    const set = <K extends keyof McpForm>(key: K, value: McpForm[K]) => setForm((s) => ({ ...s, [key]: value }));
    const submit = async () => {
        if (!form.name.trim()) return toast.warning(t('ai.mcp.form.nameRequired'));
        const payload = { ...form, taskID: uuid() };
        try {
            if (form.id) {
                await update(payload).unwrap();
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
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{row ? t('ai.mcp.edit') : t('ai.mcp.create')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2.5">
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-1">{t('ai.mcp.form.name')}</FieldLabel>
                        <Input id="ai-mcp-1" value={form.name} disabled={!!row} onChange={(event) => set('name', event.target.value)} />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-2">{t('ai.mcp.form.type')}</FieldLabel>
                        <NativeSelect
                            id="ai-mcp-2"
                            value={form.type}
                            className="w-full"
                            onChange={(event) => set('type', event.target.value)}
                        >
                            <NativeSelectOption value="" disabled>
                                {'—'}
                            </NativeSelectOption>
                            {[
                                { label: 'npx', value: 'npx' },
                                { label: 'uvx', value: 'uvx' },
                            ].map((option) => (
                                <NativeSelectOption key={String(option.value)} value={option.value}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-3">{t('ai.mcp.form.command')}</FieldLabel>
                        <Input id="ai-mcp-3" value={form.command} onChange={(event) => set('command', event.target.value)} />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-4">{t('ai.mcp.form.port')}</FieldLabel>
                        <Input
                            id="ai-mcp-4"
                            value={String(form.port)}
                            type={'number'}
                            onChange={(event) => set('port', Number(event.target.value) || 0)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-5">{t('ai.mcp.form.baseUrl')}</FieldLabel>
                        <Input
                            id="ai-mcp-5"
                            value={form.baseUrl}
                            placeholder={'https://example.com'}
                            onChange={(event) => set('baseUrl', event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-6">{t('ai.mcp.form.outputTransport')}</FieldLabel>
                        <NativeSelect
                            id="ai-mcp-6"
                            value={form.outputTransport}
                            className="w-full"
                            onChange={(event) => set('outputTransport', event.target.value)}
                        >
                            <NativeSelectOption value="" disabled>
                                {'—'}
                            </NativeSelectOption>
                            {[
                                { label: 'streamableHttp', value: 'streamableHttp' },
                                { label: 'sse', value: 'sse' },
                            ].map((option) => (
                                <NativeSelectOption key={String(option.value)} value={option.value}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-7">{t('ai.mcp.form.streamableHttpPath')}</FieldLabel>
                        <Input
                            id="ai-mcp-7"
                            value={form.streamableHttpPath}
                            onChange={(event) => set('streamableHttpPath', event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-8">{t('ai.mcp.form.ssePath')}</FieldLabel>
                        <Input id="ai-mcp-8" value={form.ssePath} onChange={(event) => set('ssePath', event.target.value)} />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-9">{t('ai.mcp.form.containerName')}</FieldLabel>
                        <Input id="ai-mcp-9" value={form.containerName} onChange={(event) => set('containerName', event.target.value)} />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-10">{t('ai.mcp.form.protocolVersion')}</FieldLabel>
                        <Input
                            id="ai-mcp-10"
                            value={form.protocolVersion}
                            onChange={(event) => set('protocolVersion', event.target.value)}
                        />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-11">{t('ai.mcp.form.gatewayImage')}</FieldLabel>
                        <Input id="ai-mcp-11" value={form.gatewayImage} onChange={(event) => set('gatewayImage', event.target.value)} />
                    </Field>
                    <Field>
                        <FieldLabel htmlFor="ai-mcp-12">{t('ai.mcp.form.gatewayArgs')}</FieldLabel>
                        <Input id="ai-mcp-12" value={form.gatewayArgs} onChange={(event) => set('gatewayArgs', event.target.value)} />
                    </Field>
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
export function DomainModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const { data, isLoading } = useGetMcpDomainQuery();
    const [bind, { isLoading: binding }] = useBindMcpDomainMutation();
    const [update, { isLoading: updating }] = useUpdateMcpDomainMutation();
    const [domain, setDomain] = useState('');
    const [sslID, setSslId] = useState(0);
    const [ipList, setIpList] = useState('');
    const bound = !!data?.websiteID;
    useEffect(() => {
        if (!data) return;
        setDomain(data.domain || '');
        setSslId(data.sslID || 0);
        setIpList((data.allowIPs || []).join(','));
    }, [data]);
    const submit = async () => {
        if (!bound && !domain.trim()) return toast.warning(t('ai.mcp.domainRequired'));
        try {
            if (bound) {
                await update({ websiteID: data!.websiteID as number, sslID, ipList }).unwrap();
            } else {
                await bind({ domain, sslID, ipList }).unwrap();
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
                if (!open && !(binding || updating)) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.mcp.bindDomain')}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <span className="text-muted-foreground text-sm">{t('common.loading')}</span>
                ) : (
                    <div className="flex flex-col gap-2.5">
                        {bound ? (
                            <span className="text-muted-foreground text-sm">{t('ai.mcp.domainBound', { domain: data?.domain })}</span>
                        ) : (
                            <Field>
                                <FieldLabel htmlFor="ai-mcp-13">{t('ai.mcp.bindDomain')}</FieldLabel>
                                <Input
                                    id="ai-mcp-13"
                                    value={domain}
                                    placeholder={t('ai.mcp.domainPlaceholder')}
                                    onChange={(event) => setDomain(event.target.value)}
                                />
                            </Field>
                        )}
                        <Field>
                            <FieldLabel htmlFor="ai-mcp-14">{'sslID'}</FieldLabel>
                            <Input
                                id="ai-mcp-14"
                                value={String(sslID)}
                                type={'number'}
                                onChange={(event) => setSslId(Number(event.target.value) || 0)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="ai-mcp-15">{'IP'}</FieldLabel>
                            <Input
                                id="ai-mcp-15"
                                value={ipList}
                                placeholder={'1.2.3.4,5.6.7.8'}
                                onChange={(event) => setIpList(event.target.value)}
                            />
                        </Field>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={binding || updating} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={binding || updating} onClick={submit}>
                        {binding || updating ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
