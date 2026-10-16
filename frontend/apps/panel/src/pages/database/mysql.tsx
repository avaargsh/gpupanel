import {
    useMysqlGrantSummaryQuery,
    useSearchMysqlQuery,
    useUpdateMysqlDescriptionMutation,
    type DatabaseOption,
    type MysqlDBInfo,
    type MysqlUser,
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
import { MysqlConnectModal, MysqlCreateModal, MysqlDeleteModal } from './mysql-modals';
import { MysqlUsersDrawer } from './mysql-users';
import { DescriptionCell, useDebouncedValue } from './shared';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/**
 * MySQL 数据库列表：选择实例、搜索、分页，展示授权用户与备注，
 * 并提供创建 / 删除 / 用户管理 / 连接信息等操作入口。
 */
export default function DatabaseMysql() {
    const { t } = useTranslation();
    const [instance, setInstance] = useState<DatabaseOption>();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [orderBy] = useState<'name' | 'createdAt'>('createdAt');
    const [order] = useState<'ascending' | 'descending' | 'null'>('null');

    const [createOpen, setCreateOpen] = useState(false);
    const [usersOpen, setUsersOpen] = useState(false);
    const [connectOpen, setConnectOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<MysqlDBInfo | null>(null);

    const database = instance?.database ?? '';
    const engineType = instance?.type ?? 'mysql';

    useEffect(() => {
        setPage(1);
    }, [instance?.database, info]);

    const listQuery = useSearchMysqlQuery({ database, page, pageSize, info, orderBy, order }, { skip: !instance });
    const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
    const rowNames = useMemo(() => rows.map((r) => r.name), [rows]);

    const summaryQuery = useMysqlGrantSummaryQuery(
        { database, dbs: rowNames },
        { skip: !instance || rowNames.length === 0 },
    );
    const summary = summaryQuery.data ?? {};
    const total = listQuery.data?.total ?? 0;

    const [updateDescription] = useUpdateMysqlDescriptionMutation();

    const renderAuthorized = (users: MysqlUser[]) => {
        if (!users.length) return <span className="text-sm text-muted-foreground">-</span>;
        return (
            <div className="flex flex-wrap gap-1">
                {users.map((u) => (
                    <Badge key={`${u.username}@${u.host}`} variant="secondary">
                        {`${u.username}@${u.host}`}
                    </Badge>
                ))}
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <InstanceSelect
                types="mysql,mariadb,mysql-cluster"
                engineType="mysql"
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
            ) : listQuery.isError ? (
                <Card>
                    <CardContent>
                        <Empty>
                            <EmptyHeader>
                                <EmptyTitle>{t('database.common.empty')}</EmptyTitle>
                                <EmptyDescription>{t('database.overview.backendOffline')}</EmptyDescription>
                            </EmptyHeader>
                        </Empty>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>{t('database.mysql.title')}</CardTitle>
                        <CardAction>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" onClick={() => setUsersOpen(true)}>
                                    {t('database.mysql.users.title')}
                                </Button>
                                <Button variant="outline" onClick={() => setConnectOpen(true)}>
                                    {t('database.mysql.connect.title')}
                                </Button>
                                <Button onClick={() => setCreateOpen(true)}>
                                    <PlusIcon data-icon="inline-start" />
                                    {t('database.mysql.create.title')}
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
                                    <TableHead>{t('database.mysql.table.name')}</TableHead>
                                    <TableHead className="w-[100px]">{t('database.common.from')}</TableHead>
                                    <TableHead className="w-[110px]">{t('database.mysql.table.format')}</TableHead>
                                    <TableHead className="w-[220px]">{t('database.mysql.table.authorized')}</TableHead>
                                    <TableHead className="w-[180px]">{t('database.common.description')}</TableHead>
                                    <TableHead className="w-[200px]">{t('database.common.createdAt')}</TableHead>
                                    <TableHead className="w-[90px]">{t('database.common.actions')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={7}
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
                                            <TableCell>{renderAuthorized(summary[row.name] ?? [])}</TableCell>
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
                <MysqlCreateModal
                    open={createOpen}
                    database={instance.database}
                    from={instance.from}
                    onOpenChange={setCreateOpen}
                    onCreated={() => listQuery.refetch()}
                />
            )}
            {instance && (
                <MysqlUsersDrawer open={usersOpen} database={instance.database} onClose={() => setUsersOpen(false)} />
            )}
            {instance && connectOpen && (
                <MysqlConnectModal open instance={instance} onClose={() => setConnectOpen(false)} />
            )}
            {instance && deleteTarget && (
                <MysqlDeleteModal
                    target={deleteTarget}
                    database={instance.database}
                    type={engineType}
                    onClose={() => setDeleteTarget(null)}
                />
            )}
        </div>
    );
}
