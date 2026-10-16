import {
    useDeleteWebsiteMutation,
    useListWebsiteGroupsQuery,
    useOperateWebsiteMutation,
    useSearchWebsitesQuery,
    type WebsiteRes,
} from '@/api/websiteApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDebouncedValue } from '@/pages/database/shared';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '../container/confirm-dialog';
import { TablePagination } from '../container/table-pagination';

const TYPES = ['deployment', 'runtime', 'static', 'proxy', 'subsite', 'stream'];
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
    running: 'default',
    stopped: 'secondary',
    creating: 'outline',
};

import { CreateWebsiteModal, DeleteWebsiteModal } from './website-modals';

export default function WebsitesPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [type, setType] = useState('');
    const [groupId, setGroupId] = useState(0);
    const [selected, setSelected] = useState<number[]>([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<WebsiteRes | null>(null);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

    const groupsQuery = useListWebsiteGroupsQuery('website');
    const groups = groupsQuery.data ?? [];
    const groupOptions = groups.length ? groups : [{ id: 1, name: 'Default', type: 'website' }];

    useEffect(() => {
        setPage(1);
    }, [name, type, groupId]);

    const listQuery = useSearchWebsitesQuery({
        page,
        pageSize,
        name,
        type,
        websiteGroupId: groupId,
        orderBy: 'createdAt',
        order: 'null',
    });
    const rows = listQuery.data?.items ?? [];
    const total = listQuery.data?.total ?? 0;

    const [operate, { isLoading: operating }] = useOperateWebsiteMutation();
    const [remove] = useDeleteWebsiteMutation();

    const doOperate = async (row: WebsiteRes, op: string) => {
        try {
            await operate({ id: row.id, operate: op }).unwrap();
            toast.success(t('website.batch.success'));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doBatchOperate = async (op: string) => {
        if (!selected.length) return;
        try {
            await Promise.all(selected.map((id) => operate({ id, operate: op }).unwrap()));
            toast.success(t('website.batch.success'));
            setSelected([]);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doBatchDelete = async () => {
        if (!selected.length) return;
        try {
            await Promise.all(
                selected.map((id) =>
                    remove({ id, deleteApp: false, deleteBackup: false, forceDelete: true, deleteDB: false }).unwrap(),
                ),
            );
            toast.success(t('website.batch.success'));
            setBatchDeleteOpen(false);
            setSelected([]);
        } catch (e) {
            toast.error(errText(e));
            throw new Error(errText(e));
        }
    };

    const idsOnPage = rows.map((row) => row.id);
    const allSelected = idsOnPage.length > 0 && idsOnPage.every((id) => selected.includes(id));

    const toggleAll = (checked: boolean) => {
        if (checked) {
            setSelected((prev) => Array.from(new Set([...prev, ...idsOnPage])));
        } else {
            setSelected((prev) => prev.filter((id) => !idsOnPage.includes(id)));
        }
    };

    const toggleRow = (id: number, checked: boolean) => {
        setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    className="w-[220px]"
                    placeholder={t('common.search')}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                />
                <NativeSelect
                    aria-label={t('website.table.type')}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                >
                    <NativeSelectOption value="">{t('common.empty')}</NativeSelectOption>
                    {TYPES.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                            {t(`website.type.${option}`)}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <NativeSelect
                    aria-label={t('website.actions.group')}
                    value={String(groupId)}
                    onChange={(e) => setGroupId(Number(e.target.value))}
                >
                    <NativeSelectOption value="0">{t('common.empty')}</NativeSelectOption>
                    {groupOptions.map((group) => (
                        <NativeSelectOption key={group.id} value={String(group.id)}>
                            {group.name}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
                <Button variant="outline" onClick={() => listQuery.refetch()}>
                    <RefreshCwIcon data-icon="inline-start" />
                    {t('website.actions.refresh')}
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                    <PlusIcon data-icon="inline-start" />
                    {t('website.actions.create')}
                </Button>
                {selected.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => doBatchOperate('start')}>
                            {t('website.actions.start')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => doBatchOperate('stop')}>
                            {t('website.actions.stop')}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setBatchDeleteOpen(true)}>
                            {t('website.actions.delete')}
                        </Button>
                    </div>
                )}
            </div>

            <div className="rounded-lg border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[40px]">
                                <Checkbox
                                    aria-label={t('website.table.domain')}
                                    checked={allSelected}
                                    disabled={idsOnPage.length === 0}
                                    onCheckedChange={(checked) => toggleAll(checked === true)}
                                />
                            </TableHead>
                            <TableHead>{t('website.table.domain')}</TableHead>
                            <TableHead className="w-[160px]">{t('website.table.type')}</TableHead>
                            <TableHead className="w-[110px]">{t('website.table.status')}</TableHead>
                            <TableHead className="w-[180px]">{t('website.table.sitePath')}</TableHead>
                            <TableHead className="w-[160px]">{t('website.table.expireDate')}</TableHead>
                            <TableHead className="w-[140px]">{t('website.table.remark')}</TableHead>
                            <TableHead className="w-[200px]">{t('website.table.operate')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                                    {t('common.empty')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            rows.map((row) => (
                                <TableRow key={row.id}>
                                    <TableCell>
                                        <Checkbox
                                            aria-label={row.primaryDomain}
                                            checked={selected.includes(row.id)}
                                            onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            type="button"
                                            className="font-medium text-primary hover:underline"
                                            onClick={() => navigate(`/websites/${row.id}`)}
                                        >
                                            {row.primaryDomain}
                                        </button>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {t(`website.type.${row.type}`)}
                                        {row.appName ? ` · ${row.appName}` : ''}
                                        {row.runtimeName ? ` · ${row.runtimeName}` : ''}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={STATUS_VARIANT[row.status.toLowerCase()] ?? 'outline'}>
                                            {t(`website.status.${row.status.toLowerCase()}`)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">{row.sitePath || '-'}</TableCell>
                                    <TableCell className="text-sm">{row.expireDate || '-'}</TableCell>
                                    <TableCell className="text-sm">{row.remark || '-'}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-1">
                                            {row.status === 'Running' ? (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={operating}
                                                    onClick={() => doOperate(row, 'stop')}
                                                >
                                                    {t('website.actions.stop')}
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={operating}
                                                    onClick={() => doOperate(row, 'start')}
                                                >
                                                    {t('website.actions.start')}
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => navigate(`/websites/${row.id}`)}
                                            >
                                                {t('website.actions.config')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => setDeleteTarget(row)}
                                            >
                                                {t('website.actions.delete')}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {total > 0 || page > 1 ? (
                <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                />
            ) : null}

            <CreateWebsiteModal open={createOpen} groups={groupOptions} onOpenChange={setCreateOpen} />
            {deleteTarget && <DeleteWebsiteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} />}

            <ConfirmDialog
                open={batchDeleteOpen}
                onOpenChange={setBatchDeleteOpen}
                title={t('website.actions.delete')}
                description={t('website.batch.deleteContent', { count: selected.length })}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                destructive
                onConfirm={doBatchDelete}
            />
        </div>
    );
}
