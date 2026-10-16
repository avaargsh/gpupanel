import {
    useAddPostgresqlMutation,
    useChangePostgresqlPasswordMutation,
    useDeleteCheckPostgresqlMutation,
    useDeletePostgresqlMutation,
    type DatabaseOption,
    type DBResource,
    type PostgresqlDBInfo,
} from '@/api/databaseApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const FORMAT_OPTIONS = ['UTF8', 'SQL_ASCII', 'LATIN1', 'GBK', 'GB18030'];

export function PgCreateModal({
    open,
    database,
    from,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    database: string;
    from: string;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const { t } = useTranslation();
    const [addPg, { isLoading }] = useAddPostgresqlMutation();
    const [name, setName] = useState('');
    const [format, setFormat] = useState('UTF8');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [superUser, setSuperUser] = useState(false);
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setFormat('UTF8');
            setUsername('');
            setPassword('');
            setSuperUser(false);
            setDescription('');
        }
    }, [open]);

    const submit = async () => {
        if (!name.trim()) {
            toast.error(t('database.pg.create.nameRequired'));
            return;
        }
        if (!username.trim()) {
            toast.error(t('database.pg.create.usernameRequired'));
            return;
        }
        if (!password) {
            toast.error(t('database.pg.create.passwordRequired'));
            return;
        }
        try {
            await addPg({
                name: name.trim(),
                from: from || 'local',
                database,
                format,
                username: username.trim(),
                password,
                superUser,
                description: description.trim(),
            }).unwrap();
            toast.success(t('database.pg.create.success'));
            onCreated();
            onOpenChange(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.pg.create.title')}</DialogTitle>
                </DialogHeader>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                    }}
                >
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="pg-create-name">{t('database.pg.create.name')}</FieldLabel>
                            <Input
                                id="pg-create-name"
                                value={name}
                                placeholder={t('database.pg.create.namePlaceholder')}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="pg-create-format">{t('database.pg.create.format')}</FieldLabel>
                            <NativeSelect
                                id="pg-create-format"
                                value={format}
                                onChange={(e) => setFormat(e.target.value)}
                            >
                                {FORMAT_OPTIONS.map((option) => (
                                    <NativeSelectOption key={option} value={option}>
                                        {option}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="pg-create-username">{t('database.pg.create.username')}</FieldLabel>
                            <Input
                                id="pg-create-username"
                                value={username}
                                placeholder={name || t('database.pg.create.usernamePlaceholder')}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="pg-create-password">{t('database.pg.create.password')}</FieldLabel>
                            <Input
                                id="pg-create-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </Field>
                        <Field orientation="horizontal">
                            <Checkbox
                                id="pg-create-superuser"
                                checked={superUser}
                                onCheckedChange={(checked) => setSuperUser(checked === true)}
                            />
                            <FieldLabel htmlFor="pg-create-superuser">{t('database.pg.create.superUser')}</FieldLabel>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="pg-create-desc">{t('database.common.description')}</FieldLabel>
                            <Input
                                id="pg-create-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function PgDeleteModal({
    target,
    database,
    type,
    onClose,
}: {
    target: PostgresqlDBInfo;
    database: string;
    type: string;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [check] = useDeleteCheckPostgresqlMutation();
    const [del, { isLoading }] = useDeletePostgresqlMutation();
    const [resources, setResources] = useState<DBResource[]>([]);
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);

    useEffect(() => {
        let active = true;
        setResources([]);
        setForceDelete(false);
        setDeleteBackup(false);
        check({ id: target.id, type, database })
            .unwrap()
            .then((res) => active && setResources(res ?? []))
            .catch(() => active && setResources([]));
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target.id]);

    const submit = async () => {
        try {
            await del({ id: target.id, type, database, forceDelete, deleteBackup }).unwrap();
            toast.success(t('database.pg.delete.success'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.pg.delete.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <p className="text-sm">{t('database.pg.delete.content', { name: target.name })}</p>
                    {resources.length > 0 && (
                        <Alert>
                            <AlertTitle>{t('database.pg.delete.resourceHint')}</AlertTitle>
                            <AlertDescription>
                                <div className="flex flex-wrap gap-1.5">
                                    {resources.map((r) => (
                                        <Badge key={`${r.type}:${r.name}`} variant="secondary">
                                            {r.name}
                                        </Badge>
                                    ))}
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}
                    {resources.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={forceDelete}
                                    onCheckedChange={(checked) => setForceDelete(checked === true)}
                                />
                                {t('database.pg.delete.force')}
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={deleteBackup}
                                    onCheckedChange={(checked) => setDeleteBackup(checked === true)}
                                />
                                {t('database.pg.delete.deleteBackup')}
                            </label>
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="destructive" disabled={isLoading} onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function PgPasswordModal({ instance, onClose }: { instance: DatabaseOption; onClose: () => void }) {
    const { t } = useTranslation();
    const [changePassword, { isLoading }] = useChangePostgresqlPasswordMutation();
    const [pwd, setPwd] = useState('');

    const submit = async () => {
        if (!pwd) return;
        try {
            await changePassword({
                id: 0,
                from: instance.from,
                type: instance.type,
                database: instance.database,
                value: pwd,
            }).unwrap();
            toast.success(t('database.pg.passwordSuccess'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.pg.passwordTitle')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">{t('database.pg.passwordHint')}</p>
                    <Field>
                        <FieldLabel htmlFor="pg-password">{t('database.pg.password')}</FieldLabel>
                        <Input id="pg-password" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
                    </Field>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={isLoading || !pwd} onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
