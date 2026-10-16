import {
    useChangeMysqlUserPasswordMutation,
    useCreateMysqlUserMutation,
    useDeleteMysqlUserMutation,
    useSearchMysqlUsersQuery,
    type MysqlUser,
} from '@/api/databaseApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '../container/confirm-dialog';
import { HostModeHelper } from './mysql-modals';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/**
 * MySQL 用户管理抽屉：列出实例下的账号，支持新增用户、修改密码与删除。
 * 删除使用受控确认弹窗，保留二次确认语义。
 */
export function MysqlUsersDrawer({
    open,
    database,
    onClose,
}: {
    open: boolean;
    database: string;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const usersQuery = useSearchMysqlUsersQuery({ database }, { skip: !open || !database });
    const users = usersQuery.data ?? [];

    const [createUser, { isLoading: creating }] = useCreateMysqlUserMutation();
    const [deleteUser] = useDeleteMysqlUserMutation();
    const [changePassword, { isLoading: changing }] = useChangeMysqlUserPasswordMutation();

    const [addOpen, setAddOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [hostMode, setHostMode] = useState<'%' | 'ip'>('%');
    const [hosts, setHosts] = useState('');
    const [pwdUser, setPwdUser] = useState<MysqlUser | null>(null);
    const [pwdValue, setPwdValue] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<MysqlUser | null>(null);

    const openAdd = () => {
        setNewName('');
        setNewPassword('');
        setHostMode('%');
        setHosts('');
        setAddOpen(true);
    };

    const submitAdd = async () => {
        if (!newName.trim()) {
            toast.error(t('database.mysql.users.nameRequired'));
            return;
        }
        if (!newPassword) {
            toast.error(t('database.mysql.create.passwordRequired'));
            return;
        }
        const host = hostMode === '%' ? '%' : hosts.trim();
        if (!host) {
            toast.error(t('database.mysql.host.required'));
            return;
        }
        try {
            await createUser({
                database,
                username: newName.trim(),
                password: newPassword,
                host,
                description: '',
            }).unwrap();
            toast.success(t('database.mysql.users.addSuccess'));
            setAddOpen(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const submitPassword = async () => {
        if (!pwdUser || !pwdValue) return;
        try {
            await changePassword({
                database,
                username: pwdUser.username,
                host: pwdUser.host,
                password: pwdValue,
            }).unwrap();
            toast.success(t('database.mysql.users.passwordSuccess'));
            setPwdUser(null);
            setPwdValue('');
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteUser({ database, username: deleteTarget.username, host: deleteTarget.host }).unwrap();
            toast.success(t('database.mysql.users.deleteSuccess'));
            setDeleteTarget(null);
        } catch (e) {
            toast.error(errText(e));
            throw new Error(errText(e));
        }
    };

    return (
        <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
            <SheetContent className="sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>{t('database.mysql.users.title')}</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 overflow-y-auto p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => usersQuery.refetch()}>
                            <RefreshCwIcon data-icon="inline-start" />
                            {t('home.refresh')}
                        </Button>
                        <Button onClick={openAdd}>
                            <PlusIcon data-icon="inline-start" />
                            {t('database.mysql.users.add')}
                        </Button>
                    </div>

                    {usersQuery.isFetching ? (
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="sr-only">{t('database.mysql.users.title')}</span>
                            <RefreshCwIcon className="animate-spin" />
                        </span>
                    ) : null}

                    <Table>
                        <caption className="sr-only">{t('database.mysql.users.title')}</caption>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('database.mysql.users.username')}</TableHead>
                                <TableHead>{t('database.mysql.users.host')}</TableHead>
                                <TableHead>{t('database.mysql.users.auth')}</TableHead>
                                <TableHead className="w-[190px]">{t('database.common.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                        {t('database.common.empty')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={`${user.username}@${user.host}`}>
                                        <TableCell className="text-sm">{user.username}</TableCell>
                                        <TableCell className="text-sm">{user.host}</TableCell>
                                        <TableCell>
                                            {user.host === '%' ? (
                                                <Badge variant="default">{t('database.mysql.users.allHosts')}</Badge>
                                            ) : (
                                                <Badge variant="secondary">{user.host}</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap items-center gap-1">
                                                <Button variant="ghost" size="sm" onClick={() => setPwdUser(user)}>
                                                    {t('database.mysql.users.changePassword')}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => setDeleteTarget(user)}
                                                >
                                                    {t('database.common.delete')}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </SheetContent>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('database.mysql.users.add')}</DialogTitle>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submitAdd();
                        }}
                    >
                        <div className="flex flex-col gap-4">
                            <Field>
                                <FieldLabel htmlFor="mysql-user-name">{t('database.mysql.users.username')}</FieldLabel>
                                <Input
                                    id="mysql-user-name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="mysql-user-password">
                                    {t('database.mysql.create.password')}
                                </FieldLabel>
                                <Input
                                    id="mysql-user-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </Field>
                            <div className="flex flex-col gap-4">
                                <HostModeHelper
                                    mode={hostMode}
                                    hosts={hosts}
                                    onModeChange={setHostMode}
                                    onHostsChange={setHosts}
                                    idPrefix="mysql-user"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? <Spinner data-icon="inline-start" /> : null}
                                {t('common.confirm')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(pwdUser)} onOpenChange={(next) => !next && setPwdUser(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('database.mysql.users.changePassword')}</DialogTitle>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void submitPassword();
                        }}
                    >
                        <Field>
                            <FieldLabel htmlFor="mysql-user-newpassword">
                                {t('database.mysql.create.password')}
                            </FieldLabel>
                            <Input
                                id="mysql-user-newpassword"
                                type="password"
                                value={pwdValue}
                                onChange={(e) => setPwdValue(e.target.value)}
                            />
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setPwdUser(null)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={changing || !pwdValue}>
                                {changing ? <Spinner data-icon="inline-start" /> : null}
                                {t('common.confirm')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={Boolean(deleteTarget)}
                onOpenChange={(next) => {
                    if (!next) setDeleteTarget(null);
                }}
                title={t('database.mysql.users.deleteTitle')}
                description={t('database.mysql.users.deleteContent', {
                    name: deleteTarget ? `${deleteTarget.username}@${deleteTarget.host}` : '',
                })}
                confirmText={t('common.confirm')}
                cancelText={t('common.cancel')}
                destructive
                onConfirm={handleDelete}
            />
        </Sheet>
    );
}
