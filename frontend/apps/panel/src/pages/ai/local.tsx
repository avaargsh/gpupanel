import { Alert, AlertDescription } from '@/components/ui/alert';
import { Field, FieldLabel } from '@/components/ui/field';
import { useConfirmAction } from '@/components/use-confirm-action';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Plus, RefreshCw } from 'lucide-react';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { TablePagination } from '../container/table-pagination';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useCloseOllamaModelMutation,
    useCreateOllamaModelMutation,
    useDeleteOllamaModelsMutation,
    useLoadOllamaModelMutation,
    useRecreateOllamaModelMutation,
    useSearchOllamaModelsQuery,
    useSyncOllamaModelsMutation,
    type OllamaModelInfo,
} from '@/api/aiApi';
import { useDebouncedValue } from '@/pages/database/shared';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
function statusTag(status: string) {
    const s = (status || '').toLowerCase();
    const color =
        s.includes('error') || s.includes('err') ? 'red' : s.includes('stop') ? 'grey' : s.includes('download') ? 'orange' : 'green';
    return <Badge variant={color === 'red' ? 'destructive' : color === 'grey' ? 'outline' : 'secondary'}>{status || '-'}</Badge>;
}
function LoadModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [create, { isLoading }] = useCreateOllamaModelMutation();
    const [name, setName] = useState('');
    const submit = async () => {
        if (!name.trim()) return toast.warning(t('ai.local.createNameRequired'));
        try {
            await create({ name, taskID: uuid() }).unwrap();
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
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.local.createTitle')}</DialogTitle>
                </DialogHeader>
                <Field>
                    <FieldLabel htmlFor="ai-local-1">{t('ai.local.createName')}</FieldLabel>
                    <Input
                        id="ai-local-1"
                        value={name}
                        placeholder={t('ai.local.createHelper')}
                        onChange={(event) => setName(event.target.value)}
                    />
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
function DetailModal({ name, onClose }: { name: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [load, { isLoading }] = useLoadOllamaModelMutation();
    const [detail, setDetail] = useState('');
    useEffect(() => {
        load({ name })
            .unwrap()
            .then((res) => setDetail(typeof res === 'string' ? res : JSON.stringify(res, null, 2)))
            .catch((e) => setDetail(errText(e)));
    }, [name, load]);
    return (
        <Dialog
            open={true}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.local.detailTitle')}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <span className="text-muted-foreground text-sm">{t('common.loading')}</span>
                ) : (
                    <pre className="whitespace-pre-wrap break-all text-xs m-0">
                        {detail || t('ai.local.detailEmpty')}
                    </pre>
                )}
            </DialogContent>
        </Dialog>
    );
}
function DeleteModal({ row, onClose }: { row: OllamaModelInfo; onClose: () => void }) {
    const { t } = useTranslation();
    const [remove, { isLoading }] = useDeleteOllamaModelsMutation();
    const [force, setForce] = useState(false);
    const submit = async () => {
        try {
            await remove({ ids: [row.id], forceDelete: force }).unwrap();
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
            <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{t('ai.actions.delete')}</DialogTitle>
                </DialogHeader>
                <span className="text-sm">{t('ai.local.deleteConfirm', { name: row.name })}</span>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <Switch aria-label={t('ai.local.force')} checked={force} onCheckedChange={setForce} />
                    <span className="text-sm">{t('ai.local.force')}</span>
                </label>
                <DialogFooter>
                    <Button variant="outline" disabled={isLoading} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={isLoading} variant="destructive" onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
export default function LocalTab() {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [showLoad, setShowLoad] = useState(false);
    const [detailName, setDetailName] = useState<string | null>(null);
    const [deleteRow, setDeleteRow] = useState<OllamaModelInfo | null>(null);
    useEffect(() => {
        setPage(1);
    }, [name]);
    const listQuery = useSearchOllamaModelsQuery({ page, pageSize, info: name });
    const rows = listQuery.data?.items ?? [];
    const [sync, { isLoading: syncing }] = useSyncOllamaModelsMutation();
    const [recreate] = useRecreateOllamaModelMutation();
    const [close] = useCloseOllamaModelMutation();
    const onSync = async () => {
        try {
            const res = await sync().unwrap();
            toast.success(t('ai.local.createTitle') + `: ${res?.length ?? 0}`);
            listQuery.refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const onRecreate = (row: OllamaModelInfo) => {
        confirm({
            title: t('ai.actions.recreate'),
            description: t('ai.local.deleteConfirm', { name: row.name }),
            run: async () => {
                try {
                    await recreate({ name: row.name, taskID: uuid() }).unwrap();
                    toast.success(t('common.confirm'));
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    const onCloseModel = (row: OllamaModelInfo) => {
        confirm({
            title: t('ai.actions.close'),
            description: t('ai.local.closeConfirm', { name: row.name }),
            run: async () => {
                try {
                    await close({ name: row.name }).unwrap();
                    toast.success(t('common.confirm'));
                    listQuery.refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    return (
        <>
            {dialog}
            <div className="flex flex-col gap-3">
                <div className="module-toolbar">
                    <Badge variant="secondary">Ollama</Badge>
                    <Input
                        aria-label={t('ai.local.searchPlaceholder')}
                        value={nameInput}
                        placeholder={t('ai.local.searchPlaceholder')}
                        className="w-[220px]"
                        onChange={(event) => setNameInput(event.target.value)}
                    />
                    <Button onClick={() => setShowLoad(true)} variant="default" type="button">
                        <Plus />
                        {t('ai.actions.create')}
                    </Button>
                    <Button onClick={onSync} variant="outline" type="button" disabled={false || syncing}>
                        {syncing ? <Spinner data-icon="inline-start" /> : <RefreshCw />}
                        {t('ai.actions.sync')}
                    </Button>
                    <Button onClick={() => listQuery.refetch()} variant="outline" type="button">
                        {t('ai.actions.refresh')}
                    </Button>
                    <span className="text-muted-foreground text-sm">{t('ai.local.deferred')}</span>
                </div>

                {listQuery.isError && (
                    <Alert variant="destructive">
                        <AlertDescription>
                            {t('hostOps.loadError')}{' '}
                            <Button variant="outline" onClick={() => void listQuery.refetch()}>
                                {t('common.refresh')}
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
                <div className="flex flex-col gap-3" aria-busy={listQuery.isLoading}>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('ai.table.name')}</TableHead>
                                <TableHead className="w-[120px]">{t('ai.local.size')}</TableHead>
                                <TableHead className="w-[120px]">{t('ai.local.source')}</TableHead>
                                <TableHead className="w-[120px]">{t('ai.table.status')}</TableHead>
                                <TableHead className="w-[260px]">{t('ai.table.operate')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {listQuery.isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5}>
                                        <Spinner role="status" aria-label="Loading" />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5}>
                                        <span className="text-muted-foreground text-sm">{t('ai.local.empty')}</span>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row, rowIndex) => (
                                    <TableRow key={row['id'] ?? rowIndex}>
                                        <TableCell>{row['name']}</TableCell>
                                        <TableCell>{row['size'] || '-'}</TableCell>
                                        <TableCell>{row['from'] || '-'}</TableCell>
                                        <TableCell>{statusTag(row.message && !row['status'] ? row.message : row['status'])}</TableCell>
                                        <TableCell>
                                            {
                                                <div className="flex flex-row items-center gap-3">
                                                    <Button
                                                        onClick={() => setDetailName(row.name)}
                                                        variant="ghost"
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        {t('ai.actions.detail')}
                                                    </Button>
                                                    <Button onClick={() => onRecreate(row)} variant="ghost" size="sm" type="button">
                                                        {t('ai.actions.recreate')}
                                                    </Button>
                                                    <Button
                                                        onClick={() => onCloseModel(row)}
                                                        variant="ghost"
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        {t('ai.actions.close')}
                                                    </Button>
                                                    <Button
                                                        onClick={() => setDeleteRow(row)}
                                                        variant="destructive"
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        {t('ai.actions.delete')}
                                                    </Button>
                                                </div>
                                            }
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <TablePagination
                        page={page}
                        pageSize={pageSize}
                        total={listQuery.data?.total ?? 0}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                    />
                </div>

                {showLoad && <LoadModal onClose={() => setShowLoad(false)} />}
                {detailName && <DetailModal name={detailName} onClose={() => setDetailName(null)} />}
                {deleteRow && <DeleteModal row={deleteRow} onClose={() => setDeleteRow(null)} />}
            </div>
        </>
    );
}
