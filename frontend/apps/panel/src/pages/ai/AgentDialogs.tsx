import { Field, FieldLabel } from '@/components/ui/field';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useDeleteAgentMutation,
    useDeleteCheckAgentMutation,
    useGetAgentOverviewMutation,
    useUpdateAgentRemarkMutation,
    useBindAgentWebsiteMutation,
    type AgentItem,
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
export function OverviewModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [load, { isLoading }] = useGetAgentOverviewMutation();
    const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
    useEffect(() => {
        load({ agentId: row.id })
            .unwrap()
            .then((res) => setSnapshot((res?.snapshot as Record<string, unknown>) ?? {}))
            .catch(() => setSnapshot({}));
    }, [row.id, load]);
    const items: Array<[string, unknown]> = snapshot
        ? [
              [t('ai.agents.containerStatus'), snapshot.containerStatus],
              [t('ai.agents.appVersion'), snapshot.appVersion],
              [t('ai.agents.defaultModel'), snapshot.defaultModel],
              [t('ai.agents.channelCount'), snapshot.channelCount],
              [t('ai.agents.skillCount'), snapshot.skillCount],
              [t('ai.agents.jobCount'), snapshot.jobCount],
              [t('ai.agents.sessionCount'), snapshot.sessionCount],
          ]
        : [];
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{`${t('ai.agents.overviewTitle')} · ${row.name}`}</DialogTitle>
                </DialogHeader>
                {isLoading || !snapshot ? (
                    <span className="text-muted-foreground text-sm">{t('common.loading')}</span>
                ) : (
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {items
                            .map(([key, value]) => ({
                                key,
                                value: value === undefined || value === null || value === '' ? '-' : String(value),
                            }))
                            .map((item, index) => (
                                <div key={index}>
                                    <dt className="text-sm text-muted-foreground">{item.key}</dt>
                                    <dd className="text-sm break-all">{item.value}</dd>
                                </div>
                            ))}
                    </dl>
                )}
            </DialogContent>
        </Dialog>
    );
}
export function RemarkModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [update, { isLoading }] = useUpdateAgentRemarkMutation();
    const [remark, setRemark] = useState(row.remark || '');
    const submit = async () => {
        try {
            await update({ id: row.id, remark }).unwrap();
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
                if (!open && !isLoading) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.table.remark')}</DialogTitle>
                </DialogHeader>
                <Input aria-label={t('ai.table.remark')} value={remark} onChange={(event) => setRemark(event.target.value)} />
                <DialogFooter>
                    <Button variant="outline" disabled={isLoading} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={isLoading} onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
export function BindModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [bind, { isLoading }] = useBindAgentWebsiteMutation();
    const [websiteId, setWebsiteId] = useState('');
    const submit = async () => {
        const id = Number(websiteId);
        if (!id) return toast.warning(t('ai.agents.bindRequired'));
        try {
            await bind({ agentId: row.id, websiteId: id }).unwrap();
            toast.success(t('ai.agents.bindDone'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !isLoading) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.agents.bindTitle')}</DialogTitle>
                </DialogHeader>
                <Field>
                    <FieldLabel htmlFor="ai-agents-1">{t('ai.agents.bindWebsiteId')}</FieldLabel>
                    <Input id="ai-agents-1" value={websiteId} type={'number'} onChange={(event) => setWebsiteId(event.target.value)} />
                </Field>
                <DialogFooter>
                    <Button variant="outline" disabled={isLoading} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={isLoading} onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
export function DeleteModal({ row, onClose }: { row: AgentItem; onClose: () => void }) {
    const { t } = useTranslation();
    const [check, { isLoading: checking }] = useDeleteCheckAgentMutation();
    const [remove, { isLoading: deleting }] = useDeleteAgentMutation();
    const [resources, setResources] = useState<
        Array<{
            type: string;
            name: string;
        }>
    >([]);
    const [force, setForce] = useState(false);
    useEffect(() => {
        check({ id: row.id })
            .unwrap()
            .then((res) => setResources(Array.isArray(res) ? res : []))
            .catch(() => setResources([]));
    }, [row.id, check]);
    const submit = async () => {
        try {
            await remove({ id: row.id, taskID: uuid(), forceDelete: force }).unwrap();
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
                if (!open && !(checking || deleting)) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[460px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.actions.delete')}</DialogTitle>
                </DialogHeader>
                <span className="text-sm">{t('ai.agents.deleteConfirm', { name: row.name })}</span>
                {resources.length > 0 && (
                    <div className="mt-2.5">
                        <span className="text-muted-foreground text-sm">{t('ai.table.remark')}</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {resources.map((r) => (
                                <Badge
                                    key={`${r.type}-${r.name}`}
                                    variant={['red', 'orange'].includes('orange') ? 'destructive' : 'secondary'}
                                >
                                    {r.type}: {r.name}
                                </Badge>
                            ))}
                        </div>
                    </div>
                )}
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <Switch aria-label={t('ai.agents.forceDelete')} checked={force} onCheckedChange={setForce} />
                    <span className="text-sm">{t('ai.agents.forceDelete')}</span>
                </label>
                <DialogFooter>
                    <Button variant="outline" disabled={checking || deleting} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={checking || deleting} variant="destructive" onClick={submit}>
                        {checking || deleting ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
