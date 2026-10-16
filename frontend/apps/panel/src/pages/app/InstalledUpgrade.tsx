import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';

import { newInstallTaskID } from './InstallModal';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useCancelIgnoreAppUpgradeMutation,
    useGetUpdateVersionsMutation,
    useIgnoreAppUpgradeMutation,
    useInstalledOpMutation,
    useListIgnoredAppsQuery,
    type AppInstallDto,
    type AppVersion,
} from '@/api/appApi';

import { SwitchLine } from './InstalledRemoval';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = newInstallTaskID;
export function UpgradeModal({ row, onClose }: { row: AppInstallDto; onClose: () => void }) {
    const { t } = useTranslation();
    const [fetchVersions, { isLoading: loadingVersions }] = useGetUpdateVersionsMutation();
    const [op, { isLoading }] = useInstalledOpMutation();
    const [versions, setVersions] = useState<AppVersion[]>([]);
    const [detailId, setDetailId] = useState<number | undefined>();
    const [backup, setBackup] = useState(true);
    const [pullImage, setPullImage] = useState(true);
    useEffect(() => {
        fetchVersions({ appInstallID: row.id })
            .unwrap()
            .then((res) => {
                const list = Array.isArray(res) ? res : [];
                setVersions(list);
                if (list.length) setDetailId(list[0].detailId);
            })
            .catch(() => setVersions([]));
    }, [row.id, fetchVersions]);
    const submit = async () => {
        try {
            await op({ installId: row.id, operate: 'upgrade', detailId, backup, pullImage, taskID: uuid() }).unwrap();
            toast.success(t('apps.upgrade.success'));
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
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: 460 }}>
                <DialogHeader>
                    <DialogTitle>{t('apps.upgrade.title')}</DialogTitle>
                </DialogHeader>
                <span className="text-sm">{t('apps.upgrade.content')}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    {loadingVersions ? (
                        <Spinner role="status" aria-label="Loading" />
                    ) : (
                        <NativeSelect
                            aria-label={t('apps.upgrade.version')}
                            value={detailId}
                            style={{ width: '100%' }}
                            onChange={(event) => setDetailId(event.target.value ? Number(event.target.value) : undefined)}
                        >
                            <NativeSelectOption value="" disabled>
                                {t('apps.upgrade.version')}
                            </NativeSelectOption>
                            {versions
                                .map((v) => ({ label: v.version, value: v.detailId }))
                                .map((option) => (
                                    <NativeSelectOption key={String(option.value)} value={option.value}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                        </NativeSelect>
                    )}
                    <SwitchLine checked={backup} onChange={setBackup} label={t('apps.upgrade.backup')} />
                    <SwitchLine checked={pullImage} onChange={setPullImage} label={t('apps.upgrade.pullImage')} />
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
export function IgnoreModal({ row, onClose, onSaved }: { row: AppInstallDto; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [fetchVersions, { isLoading: loadingVersions }] = useGetUpdateVersionsMutation();
    const [ignore, { isLoading }] = useIgnoreAppUpgradeMutation();
    const [versions, setVersions] = useState<AppVersion[]>([]);
    const [scope, setScope] = useState<'all' | 'version'>('all');
    const [detailId, setDetailId] = useState<number | undefined>();
    useEffect(() => {
        fetchVersions({ appInstallID: row.id })
            .unwrap()
            .then((res) => {
                const list = Array.isArray(res) ? res : [];
                setVersions(list);
                if (list.length) setDetailId(list[0].detailId);
            })
            .catch(() => setVersions([]));
    }, [row.id, fetchVersions]);
    const submit = async () => {
        try {
            await ignore({
                appID: row.appID,
                appDetailID: scope === 'version' ? detailId : undefined,
                scope,
            }).unwrap();
            toast.success(t('apps.ignore.success'));
            onSaved();
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
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: 460 }}>
                <DialogHeader>
                    <DialogTitle>{t('apps.ignore.title')}</DialogTitle>
                </DialogHeader>
                <span className="text-sm">{t('apps.ignore.content', { name: row.name })}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                    <ToggleGroup
                        type="single"
                        value={scope}
                        onValueChange={(value) => {
                            if (value) setScope({ target: { value } }.target.value as 'all' | 'version');
                        }}
                        className="flex flex-wrap"
                    >
                        <ToggleGroupItem value={'all'}>{t('apps.ignore.all')}</ToggleGroupItem>
                        <ToggleGroupItem value={'version'}>{t('apps.ignore.version')}</ToggleGroupItem>
                    </ToggleGroup>
                    {scope === 'version' &&
                        (loadingVersions ? (
                            <Spinner role="status" aria-label="Loading" />
                        ) : (
                            <NativeSelect
                                aria-label={t('apps.upgrade.version')}
                                value={detailId}
                                style={{ width: '100%' }}
                                onChange={(event) => setDetailId(event.target.value ? Number(event.target.value) : undefined)}
                            >
                                <NativeSelectOption value="" disabled>
                                    {t('apps.ignore.versionSelect')}
                                </NativeSelectOption>
                                {versions
                                    .map((v) => ({ label: v.version, value: v.detailId }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={option.value}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
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
export function IgnoredListModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const { data = [], isFetching, refetch } = useListIgnoredAppsQuery();
    const [cancel, { isLoading }] = useCancelIgnoreAppUpgradeMutation();
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: 640 }}>
                <DialogHeader>
                    <DialogTitle>{t('apps.ignoreList.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3" aria-busy={isFetching}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('apps.ignoreList.name')}</TableHead>
                                <TableHead>{t('apps.ignoreList.scope')}</TableHead>
                                <TableHead style={{ width: 120 }}>{t('apps.ignoreList.operate')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isFetching ? (
                                <TableRow>
                                    <TableCell colSpan={3}>
                                        <Spinner role="status" aria-label="Loading" />
                                    </TableCell>
                                </TableRow>
                            ) : data.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3}>
                                        {<span className="text-muted-foreground text-sm">{t('apps.ignoreList.empty')}</span>}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                data.map((row, rowIndex) => (
                                    <TableRow key={row['ID'] ?? rowIndex}>
                                        <TableCell>{row['name']}</TableCell>
                                        <TableCell>
                                            {row.scope === 'version' ? (
                                                <Badge variant={'secondary'}>{row.version}</Badge>
                                            ) : (
                                                <Badge variant={'secondary'}>{t('apps.ignoreList.allVersion')}</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {
                                                <Button
                                                    onClick={async () => {
                                                        try {
                                                            await cancel({ id: row.ID }).unwrap();
                                                            toast.success(t('apps.ignoreList.canceled'));
                                                            refetch();
                                                        } catch (e) {
                                                            toast.error(errText(e));
                                                        }
                                                    }}
                                                    variant={'ghost'}
                                                    size="sm"
                                                    type={'button'}
                                                    disabled={false || isLoading}
                                                >
                                                    {isLoading ? <Spinner data-icon="inline-start" /> : null}
                                                    {t('apps.ignoreList.cancel')}
                                                </Button>
                                            }
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter>
                    {
                        <Button onClick={onClose} variant={'outline'} type={'button'}>
                            {t('common.close')}
                        </Button>
                    }
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
