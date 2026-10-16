import { useGetNginxModulesQuery, useUpdateNginxModuleMutation, type NginxModule } from '@/api/openrestyApi';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { errText } from '@/pages/toolbox/shared';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '../container/confirm-dialog';
import { BuildModal, ModuleOperateSheet } from './module-dialogs';
export default function ModulesTab() {
    const { t } = useTranslation();
    const query = useGetNginxModulesQuery();
    const [updateModule, { isLoading: updating }] = useUpdateNginxModuleMutation();
    const [operate, setOperate] = useState<{
        mode: 'create' | 'update' | 'view';
        target?: NginxModule;
    } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<NginxModule | null>(null);
    const [buildOpen, setBuildOpen] = useState(false);

    const modules = query.data?.modules ?? [];
    const dynamicSupported = query.data?.dynamicSupported ?? true;

    const toggleEnable = async (row: NginxModule, enable: boolean) => {
        try {
            await updateModule({ ...row, operate: 'update', enable }).unwrap();
            toast.success(t('openresty.saveSuccess'));
        } catch (e) {
            toast.error(errText(e));
            query.refetch();
        }
    };

    const remove = async (row: NginxModule) => {
        try {
            await updateModule({ operate: 'delete', name: row.name }).unwrap();
            toast.success(t('openresty.saveSuccess'));
            setDeleteTarget(null);
        } catch (e) {
            toast.error(errText(e));
            throw new Error(errText(e));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {query.isError ? (
                <Alert variant="destructive">
                    <AlertTitle>{errText(query.error)}</AlertTitle>
                </Alert>
            ) : null}
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                }}
            >
                <Button onClick={() => setOperate({ mode: 'create' })}>
                    <PlusIcon data-icon="inline-start" />
                    {t('openresty.modules.create')}
                </Button>
                <Button onClick={() => setBuildOpen(true)} disabled={!query.data}>
                    {t('openresty.modules.build')}
                </Button>
                <Button variant="outline" onClick={() => query.refetch()}>
                    <RefreshCwIcon data-icon="inline-start" />
                    {t('common.refresh')}
                </Button>
                <p className="text-sm text-muted-foreground">{t('openresty.modules.buildHelper')}</p>
            </div>
            {query.isLoading ? <Spinner /> : null}
            <Table>
                <TableHeader>
                    <TableRow>
                        {['name', 'buildMode', 'buildStatus', 'status', 'operate'].map((key) => (
                            <TableHead key={key}>{t(`openresty.modules.${key}`)}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {modules.length ? (
                        modules.map((row) => (
                            <TableRow key={row.name}>
                                <TableCell>{row.name}</TableCell>
                                <TableCell>
                                    <Badge variant="secondary">
                                        {t(
                                            `openresty.modules.buildMode${row.buildMode === 'static' ? 'Static' : 'Dynamic'}`,
                                        )}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={row.buildStatus === 'failed' ? 'destructive' : 'outline'}>
                                        {t(`openresty.modules.${row.buildStatus}`)}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        aria-label={`${t('openresty.modules.status')} ${row.name}`}
                                        checked={row.enable}
                                        disabled={updating}
                                        onCheckedChange={(value) => toggleEnable(row, value)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                setOperate({
                                                    mode: row.custom ? 'update' : 'view',
                                                    target: row,
                                                })
                                            }
                                        >
                                            {row.custom ? t('openresty.modules.edit') : t('openresty.modules.view')}
                                        </Button>
                                        {row.custom ? (
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setDeleteTarget(row)}
                                            >
                                                {t('common.delete')}
                                            </Button>
                                        ) : null}
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={5}>{t('common.empty')}</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {operate ? (
                <ModuleOperateSheet
                    mode={operate.mode}
                    target={operate.target}
                    dynamicSupported={dynamicSupported}
                    onClose={() => setOperate(null)}
                    onSaved={() => {
                        setOperate(null);
                        query.refetch();
                    }}
                />
            ) : null}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(next) => !next && setDeleteTarget(null)}
                title={t('common.delete')}
                description={t('openresty.modules.deleteConfirm', {
                    name: deleteTarget?.name ?? '',
                })}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                destructive
                onConfirm={async () => {
                    if (deleteTarget) await remove(deleteTarget);
                }}
            />
            {buildOpen && query.data ? <BuildModal config={query.data} onClose={() => setBuildOpen(false)} /> : null}
        </div>
    );
}
