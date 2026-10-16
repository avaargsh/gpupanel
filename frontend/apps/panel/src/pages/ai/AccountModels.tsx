import { useConfirmAction } from '@/components/use-confirm-action';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Search, Trash2 } from 'lucide-react';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useCreateAccountModelMutation,
    useDeleteAccountModelMutation,
    useDiscoverAccountModelsMutation,
    useGetAccountModelsQuery,
    type AccountItem,
    type AccountModel,
} from '@/api/aiApi';

const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
export function ModelPoolSheet({ account, onClose }: { account: AccountItem; onClose: () => void }) {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const { data: models = [], isLoading, refetch } = useGetAccountModelsQuery(account.id);
    const [discover, { isLoading: discovering }] = useDiscoverAccountModelsMutation();
    const [createModel, { isLoading: creating }] = useCreateAccountModelMutation();
    const [deleteModel] = useDeleteAccountModelMutation();
    const [addId, setAddId] = useState('');
    const [addName, setAddName] = useState('');
    const onDiscover = async () => {
        try {
            const res = await discover({
                provider: account.provider,
                baseURL: account.baseUrl,
                apiKey: account.apiKey,
                apiType: account.apiType,
            }).unwrap();
            toast.success(t('ai.accounts.models.discovered', { count: res?.length ?? 0 }));
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const onAdd = async () => {
        if (!addId.trim()) return toast.warning(t('ai.accounts.models.addRequired'));
        try {
            await createModel({ accountId: account.id, model: { recordId: 0, id: addId, name: addName || addId } }).unwrap();
            setAddId('');
            setAddName('');
            refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const onDelete = (m: AccountModel) => {
        confirm({
            title: t('ai.actions.delete'),
            description: t('ai.accounts.models.deleteConfirm', { name: m.name || m.id }),
            run: async () => {
                try {
                    await deleteModel({ accountId: account.id, recordId: m.recordId }).unwrap();
                    refetch();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };
    return (
        <>
            {' '}
            {dialog}{' '}
            {
                <Sheet
                    open={true}
                    onOpenChange={(open) => {
                        if (!open) onClose();
                    }}
                >
                    <SheetContent aria-describedby={undefined} className="overflow-y-auto" style={{ maxWidth: 560 }}>
                        <SheetHeader>
                            <SheetTitle>{`${t('ai.accounts.models.title')} · ${account.name}`}</SheetTitle>
                        </SheetHeader>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="flex flex-row flex-wrap gap-3 items-center">
                                <Input
                                    aria-label={t('ai.accounts.models.id')}
                                    value={addId}
                                    placeholder={t('ai.accounts.models.id')}
                                    style={{ width: 180 }}
                                    onChange={(event) => setAddId(event.target.value)}
                                />
                                <Input
                                    aria-label={t('ai.accounts.models.name')}
                                    value={addName}
                                    placeholder={t('ai.accounts.models.name')}
                                    style={{ width: 180 }}
                                    onChange={(event) => setAddName(event.target.value)}
                                />
                                <Button onClick={onAdd} variant={'outline'} type={'button'} disabled={false || creating}>
                                    {creating ? <Spinner data-icon="inline-start" /> : <Plus />}
                                    {t('ai.accounts.models.add')}
                                </Button>
                                <Button onClick={onDiscover} variant={'outline'} type={'button'} disabled={false || discovering}>
                                    {discovering ? <Spinner data-icon="inline-start" /> : <Search />}
                                    {t('ai.accounts.models.discover')}
                                </Button>
                            </div>
                            <div className="flex flex-col gap-3" aria-busy={isLoading}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('ai.accounts.models.id')}</TableHead>
                                            <TableHead>{t('ai.accounts.models.name')}</TableHead>
                                            <TableHead style={{ width: 100 }}>{t('ai.table.operate')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={3}>
                                                    <Spinner role="status" aria-label="Loading" />
                                                </TableCell>
                                            </TableRow>
                                        ) : models.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3}>
                                                    {<span className="text-muted-foreground text-sm">{t('ai.accounts.models.empty')}</span>}
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            models.map((row, rowIndex) => (
                                                <TableRow key={row['recordId'] ?? rowIndex}>
                                                    <TableCell>{row['id']}</TableCell>
                                                    <TableCell>{row['name'] || '-'}</TableCell>
                                                    <TableCell>
                                                        {
                                                            <Button
                                                                aria-label={t('ai.actions.delete')}
                                                                onClick={() => onDelete(row)}
                                                                variant={'destructive'}
                                                                size="sm"
                                                                type={'button'}
                                                            >
                                                                {<Trash2 />}
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
                    </SheetContent>
                </Sheet>
            }{' '}
        </>
    );
}
