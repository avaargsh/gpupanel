import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { useId } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

import { newInstallTaskID } from './InstallModal';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useGetInstallParamsQuery,
    useUpdateAppConfigMutation,
    useUpdateInstallParamsMutation,
    useUpdateInstalledSortMutation,
    type AppInstallDto,
} from '@/api/appApi';

const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = newInstallTaskID;
export function ParamsModal({ row, onClose }: { row: AppInstallDto; onClose: () => void }) {
    const { t } = useTranslation();
    const { data: config, isLoading } = useGetInstallParamsQuery(row.id);
    const [saveParams, { isLoading: saving }] = useUpdateInstallParamsMutation();
    const [saveConfig] = useUpdateAppConfigMutation();
    const [edit, setEdit] = useState(false);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [webUI, setWebUI] = useState('');
    const prefix = useId();
    useEffect(() => {
        if (!config) return;
        const next: Record<string, unknown> = {};
        config.params.forEach((p) => {
            next[p.key] = p.type === 'number' ? Number(p.value) : p.value;
        });
        setValues(next);
        setWebUI(config.webUI || '');
    }, [config]);
    const submit = async () => {
        try {
            await saveParams({ installId: row.id, params: values }).unwrap();
            if (config && webUI !== config.webUI) {
                await saveConfig({ installID: row.id, webUI }).unwrap();
            }
            toast.success(t('apps.params.success'));
            setEdit(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !saving) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{t('apps.params.title')}</DialogTitle>
                </DialogHeader>
                {isLoading || !config ? (
                    <Spinner role="status" aria-label="Loading" />
                ) : (
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor={`${prefix}-webui`}>{t('apps.params.webUI')}</FieldLabel>
                            {edit ? (
                                <Input id={`${prefix}-webui`} value={webUI} onChange={(event) => setWebUI(event.target.value)} />
                            ) : (
                                <span className="text-sm">{config.webUI || '-'}</span>
                            )}
                        </Field>
                        {config.params.length === 0 ? (
                            <span className="text-muted-foreground text-sm">{t('apps.params.empty')}</span>
                        ) : (
                            config.params.map((p) => (
                                <Field key={p.key}>
                                    <FieldLabel htmlFor={`${prefix}-${p.key}`}>{p.labelZh || p.key}</FieldLabel>
                                    {!edit ? (
                                        <span className="text-sm">
                                            {p.type === 'password'
                                                ? '********'
                                                : String(p.showValue && p.showValue !== '' ? p.showValue : (p.value ?? '-'))}
                                        </span>
                                    ) : p.values && p.values.length > 0 ? (
                                        <NativeSelect
                                            id={`${prefix}-${p.key}`}
                                            value={values[p.key] as string}
                                            className="w-full"
                                            onChange={(event) =>
                                                setValues((s) => ({
                                                    ...s,
                                                    [p.key]:
                                                        (p.values ?? [])
                                                            .map((o) => ({ label: o.label, value: o.value }))
                                                            .find((option) => String(option.value) === event.target.value)?.value ??
                                                        event.target.value,
                                                }))
                                            }
                                        >
                                            <NativeSelectOption value="" disabled>
                                                {'—'}
                                            </NativeSelectOption>
                                            {(p.values ?? [])
                                                .map((o) => ({ label: o.label, value: o.value }))
                                                .map((option) => (
                                                    <NativeSelectOption key={String(option.value)} value={option.value}>
                                                        {option.label}
                                                    </NativeSelectOption>
                                                ))}
                                        </NativeSelect>
                                    ) : (
                                        <Input
                                            id={`${prefix}-${p.key}`}
                                            value={values[p.key] === undefined || values[p.key] === null ? '' : String(values[p.key])}
                                            disabled={!p.edit}
                                            type={p.type === 'number' ? 'number' : p.type === 'password' ? 'password' : 'text'}
                                            onChange={(event) =>
                                                setValues((s) => ({
                                                    ...s,
                                                    [p.key]: p.type === 'number' ? Number(event.target.value) : event.target.value,
                                                }))
                                            }
                                        />
                                    )}
                                </Field>
                            ))
                        )}
                    </FieldGroup>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={saving} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={saving} onClick={edit ? submit : () => setEdit(true)}>
                        {saving ? <Spinner data-icon="inline-start" /> : null}
                        {edit ? t('common.confirm') : t('apps.params.edit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
export function SortModal({ rows, onClose }: { rows: AppInstallDto[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [list, setList] = useState(() => rows.map((r) => ({ id: r.id, name: r.name })));
    const [save, { isLoading }] = useUpdateInstalledSortMutation();
    const move = (index: number, dir: -1 | 1) => {
        setList((s) => {
            const next = [...s];
            const target = index + dir;
            if (target < 0 || target >= next.length) return s;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };
    const submit = async () => {
        try {
            await save({ items: list.map((r, i) => ({ installID: r.id, sortOrder: i })) }).unwrap();
            toast.success(t('apps.sort.success'));
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
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{t('apps.sort.title')}</DialogTitle>
                </DialogHeader>
                <span className="text-muted-foreground text-sm">{t('apps.sort.hint')}</span>
                <div className="mt-2.5 flex flex-col gap-1.5">
                    {list.map((r, i) => (
                        <div
                            key={r.id}
                            className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"
                        >
                            <span className="text-sm">{r.name}</span>
                            <div className="flex flex-row  gap-3 items-center">
                                <Button onClick={() => move(i, -1)} variant={'ghost'} size="sm" type={'button'} disabled={i === 0}>
                                    ↑
                                </Button>
                                <Button
                                    onClick={() => move(i, 1)}
                                    variant={'ghost'}
                                    size="sm"
                                    type={'button'}
                                    disabled={i === list.length - 1}
                                >
                                    ↓
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
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
