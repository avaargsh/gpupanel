import { useId } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';

import { newInstallTaskID } from './InstallModal';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteCheckQuery, useInstalledOpMutation, type AppInstallDto } from '@/api/appApi';

const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = newInstallTaskID;
export function UninstallModal({ row, onClose }: { row: AppInstallDto; onClose: () => void }) {
    const { t } = useTranslation();
    const { data: resources = [], isLoading } = useDeleteCheckQuery(row.id);
    const [op, { isLoading: submitting }] = useInstalledOpMutation();
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);
    const [deleteDB, setDeleteDb] = useState(false);
    const [deleteImage, setDeleteImage] = useState(false);
    const submit = async () => {
        try {
            await op({ installId: row.id, operate: 'delete', forceDelete, deleteBackup, deleteDB, deleteImage, taskID: uuid() }).unwrap();
            toast.success(t('apps.uninstall.success'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open && !submitting) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: 480 }}>
                <DialogHeader>
                    <DialogTitle>{t('apps.uninstall.title')}</DialogTitle>
                </DialogHeader>
                <span className="text-sm">{t('apps.uninstall.content', { name: row.name })}</span>
                {isLoading ? (
                    <Spinner role="status" aria-label="Loading" />
                ) : resources.length > 0 ? (
                    <div style={{ marginTop: 10 }}>
                        <span className="text-muted-foreground text-sm">{t('apps.uninstall.resource')}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
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
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                    <SwitchLine checked={forceDelete} onChange={setForceDelete} label={t('apps.uninstall.force')} />
                    <SwitchLine checked={deleteBackup} onChange={setDeleteBackup} label={t('apps.uninstall.deleteBackup')} />
                    <SwitchLine checked={deleteDB} onChange={setDeleteDb} label={t('apps.uninstall.deleteDB')} />
                    <SwitchLine checked={deleteImage} onChange={setDeleteImage} label={t('apps.uninstall.deleteImage')} />
                </div>
                <DialogFooter>
                    <Button variant="outline" disabled={submitting} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={submitting} variant="destructive" onClick={submit}>
                        {submitting ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
export function SwitchLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    const id = useId();
    return (
        <Field orientation="horizontal">
            <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
            <FieldLabel htmlFor={id}>{label}</FieldLabel>
        </Field>
    );
}
