import {
    useSearchPostgresqlQuery,
    useUpdatePostgresqlDescriptionMutation,
    type DatabaseOption,
    type PostgresqlDBInfo,
} from '@/api/databaseApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TablePagination } from '../container/table-pagination';
import InstanceSelect from './InstanceSelect';
import { DescriptionCell, useDebouncedValue } from './shared';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const FORMAT_OPTIONS = ['UTF8', 'SQL_ASCII', 'LATIN1', 'GBK', 'GB18030'];

import { PgCreateModal, PgDeleteModal, PgPasswordModal } from './postgresql-modals';

export default function DatabasePostgresql() {
    const { t } = useTranslation();
    const [instance, setInstance] = useState<DatabaseOption>();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<PostgresqlDBInfo | null>(null);
    const [pwdOpen, setPwdOpen] = useState(false);

    const database = instance?.database ?? '';
    const engineType = instance?.type ?? 'postgresql';

    useEffect(() => {
        setPage(1);
    }, [instance?.database, info]);

    const listQuery = useSearchPostgresqlQuery(
        { database, page, pageSize, info, orderBy: 'createdAt', order: 'null' },
        { skip: !instance },
    );
    const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
    const total = listQuery.data?.total ?? 0;
    const [updateDescription] = useUpdatePostgresqlDescriptionMutation();

    return (
        <div className="flex flex-col gap-4">
            <InstanceSelect
                types="postgresql,postgresql-cluster"
                engineType="postgresql"
                value={instance?.database}
                onChange={setInstance}
            />

            {!instance ? (
                <Card>
                    <CardContent>
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('database.common.noInstance')}</EmptyTitle>
                                <EmptyDescription>{t('database.common.noInstanceDesc')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>{t('database.pg.title')}</CardTitle>
                        <CardAction>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" onClick={() => setPwdOpen(true)}>
                                    {t('database.pg.passwordTitle')}
                                </Button>
                                <Button onClick={() => setCreateOpen(true)}>
                                    <PlusIcon data-icon="inline-start" />
                                    {t('database.pg.create.title')}
                                </Button>
                            </div>
                        </CardAction>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Input
                                className="w-[240px]"
                                placeholder={t('database.common.search')}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                            <Button variant="outline" onClick={() => listQuery.refetch()}>
                                <RefreshCwIcon data-icon="inline-start" />
                                {t('home.refresh')}
                            </Button>
                        </div>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('database.pg.table.name')}</TableHead>
                                    <TableHead className="w-[100px]">{t('database.common.from')}</TableHead>
                                    <TableHead className="w-[110px]">{t('database.pg.table.format')}</TableHead>
                                    <TableHead className="w-[160px]">{t('database.pg.table.username')}</TableHead>
                                    <TableHead className="w-[100px]">{t('database.pg.table.superUser')}</TableHead>
                                    <TableHead className="w-[180px]">{t('database.common.description')}</TableHead>
                                    <TableHead className="w-[200px]">{t('database.common.createdAt')}</TableHead>
                                    <TableHead className="w-[90px]">{t('database.common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="py-8 text-center text-sm text-muted-foreground"
                                        >
                                            {t('database.common.empty')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell className="text-sm font-medium">{row.name}</TableCell>
                                            <TableCell>
                                                <Badge variant={row.from === 'local' ? 'default' : 'secondary'}>
                                                    {row.from === 'local'
                                                        ? t('database.common.local')
                                                        : t('database.common.remote')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">{row.format || '-'}</TableCell>
                                            <TableCell className="text-sm">{row.username}</TableCell>
                                            <TableCell>
                                                {row.superUser ? (
                                                    <Badge variant="outline">{t('database.pg.table.yes')}</Badge>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <DescriptionCell
                                                    value={row.description}
                                                    onSave={async (next) => {
                                                        try {
                                                            await updateDescription({
                                                                id: row.id,
                                                                description: next,
                                                            }).unwrap();
                                                            toast.success(t('database.common.descriptionSaved'));
                                                        } catch (e) {
                                                            toast.error(errText(e));
                                                        }
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell className="text-sm">{row.createdAt}</TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => setDeleteTarget(row)}
                                                >
                                                    {t('database.common.delete')}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>

                        {total > 0 || page > 1 ? (
                            <TablePagination
                                page={page}
                                pageSize={pageSize}
                                total={total}
                                onPageChange={setPage}
                                onPageSizeChange={setPageSize}
                            />
                        ) : null}
                    </CardContent>
                </Card>
            )}

            {instance && (
                <PgCreateModal
                    open={createOpen}
                    database={instance.database}
                    from={instance.from}
                    onOpenChange={setCreateOpen}
                    onCreated={() => listQuery.refetch()}
                />
            )}
            {instance && deleteTarget && (
                <PgDeleteModal
                    target={deleteTarget}
                    database={instance.database}
                    type={engineType}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
            {instance && pwdOpen && <PgPasswordModal instance={instance} onClose={() => setPwdOpen(false)} />}
        </div>
    );
}
