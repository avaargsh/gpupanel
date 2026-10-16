import { Alert, AlertDescription } from '@/components/ui/alert';
import { AccountForm } from './AccountForm';
import { ModelPoolSheet } from './AccountModels';

import { useConfirmAction } from '@/components/use-confirm-action';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';

import { Plus, RefreshCw } from 'lucide-react';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';

import { Badge } from '@/components/ui/badge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeleteAccountMutation, useGetAgentProvidersQuery, useSearchAccountsQuery, type AccountItem } from '@/api/aiApi';
import { useDebouncedValue } from '@/pages/database/shared';
import { TablePagination } from '../container/table-pagination';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
export default function AccountsTab() {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [apiType, setApiType] = useState('');
    const [formAccount, setFormAccount] = useState<AccountItem | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [poolAccount, setPoolAccount] = useState<AccountItem | null>(null);
    useEffect(() => {
        setPage(1);
    }, [name, apiType]);
    const { data: providers = [] } = useGetAgentProvidersQuery();
    const listQuery = useSearchAccountsQuery({ page, pageSize, provider: '', apiType: apiType || undefined, name });
    const rows = listQuery.data?.items ?? [];
    const [deleteAccount] = useDeleteAccountMutation();
    const apiTypes = useMemo(() => {
        const set = new Set<string>();
        providers.forEach((p) => p.apiTypes.forEach((a) => set.add(a.apiType)));
        return Array.from(set);
    }, [providers]);
    const onDelete = (row: AccountItem) => {
        confirm({
            title: t('ai.actions.delete'),
            description: t('ai.accounts.deleteConfirm', { name: row.name }),
            run: async () => {
                try {
                    await deleteAccount({ id: row.id }).unwrap();
                    toast.success(t('common.confirm'));
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
                    <Input
                        aria-label={t('ai.accounts.searchPlaceholder')}
                        value={nameInput}
                        placeholder={t('ai.accounts.searchPlaceholder')}
                        className="w-[220px]"
                        onChange={(event) => setNameInput(event.target.value)}
                    />
                    <NativeSelect
                        aria-label={t('ai.table.apiType')}
                        value={apiType || undefined}
                        className="w-[160px]"
                        onChange={(event) => setApiType(event.target.value)}
                    >
                        <NativeSelectOption value="">{t('ai.accounts.apiTypePlaceholder')}</NativeSelectOption>
                        {apiTypes
                            .map((a) => ({ label: a, value: a }))
                            .map((option) => (
                                <NativeSelectOption key={String(option.value)} value={option.value}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                    </NativeSelect>
                    <Button
                        onClick={() => {
                            setFormAccount(null);
                            setShowForm(true);
                        }}
                        variant="default"
                        type="button"
                    >
                        <Plus />
                        {t('ai.actions.create')}
                    </Button>
                    <Button onClick={() => listQuery.refetch()} variant="outline" type="button">
                        <RefreshCw />
                        {t('ai.actions.refresh')}
                    </Button>
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
                                <TableHead>{t('ai.table.provider')}</TableHead>
                                <TableHead className="w-[110px]">{t('ai.table.apiType')}</TableHead>
                                <TableHead>{t('ai.table.baseUrl')}</TableHead>
                                <TableHead className="w-[140px]">{t('ai.table.apiKey')}</TableHead>
                                <TableHead className="w-[100px]">{t('ai.table.verified')}</TableHead>
                                <TableHead className="w-[220px]">{t('ai.table.operate')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {listQuery.isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7}>
                                        <Spinner role="status" aria-label="Loading" />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7}>
                                        <span className="text-muted-foreground text-sm">{t('ai.accounts.empty')}</span>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row, rowIndex) => (
                                    <TableRow key={row['id'] ?? rowIndex}>
                                        <TableCell>{row['name']}</TableCell>
                                        <TableCell>{row['providerName'] || row.provider}</TableCell>
                                        <TableCell><Badge variant="secondary">{row['apiType'] || '-'}</Badge></TableCell>
                                        <TableCell className="max-w-64 truncate">{row['baseUrl']}</TableCell>
                                        <TableCell>
                                            {row['apiKey'] ? `${row['apiKey'].slice(0, 4)}****${row['apiKey'].slice(-4)}` : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {row.verifyModel === '' ? (
                                                <Badge variant="outline">
                                                    {t('ai.accounts.verifySkipped')}
                                                </Badge>
                                            ) : row['verified'] ? (
                                                <Badge variant="secondary">
                                                    {t('ai.accounts.verified')}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline">
                                                    {t('ai.accounts.unverified')}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {
                                                <div className="flex flex-row items-center gap-3">
                                                    <Button
                                                        onClick={() => {
                                                            setFormAccount(row);
                                                            setShowForm(true);
                                                        }}
                                                        variant="ghost"
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        {t('ai.actions.edit')}
                                                    </Button>
                                                    <Button
                                                        onClick={() => setPoolAccount(row)}
                                                        variant="ghost"
                                                        size="sm"
                                                        type="button"
                                                    >
                                                        {t('ai.actions.models')}
                                                    </Button>
                                                    <Button
                                                        onClick={() => onDelete(row)}
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

                {showForm && <AccountForm account={formAccount} providers={providers} onClose={() => setShowForm(false)} />}
                {poolAccount && <ModelPoolSheet account={poolAccount} onClose={() => setPoolAccount(null)} />}
            </div>
        </>
    );
}
