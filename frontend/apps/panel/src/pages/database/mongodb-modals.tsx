import {
    useAddMongodbMutation,
    useChangeMongodbRootPasswordMutation,
    useDeleteCheckMongodbMutation,
    useDeleteMongodbMutation,
    type DatabaseOption,
    type DBResource,
    type MongodbDBInfo,
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

const PERMISSIONS = ['dbOwner', 'read', 'readWrite', 'userAdmin'] as const;

export function MongoCreateModal({
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
    const [addMongo, { isLoading }] = useAddMongodbMutation();
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [permission, setPermission] = useState<(typeof PERMISSIONS)[number]>('dbOwner');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setUsername('');
            setPassword('');
            setPermission('dbOwner');
            setDescription('');
        }
    }, [open]);

    const submit = async () => {
        if (!name.trim()) {
            toast.error(t('database.mongo.create.nameRequired'));
            return;
        }
        if (!username.trim()) {
            toast.error(t('database.mongo.create.usernameRequired'));
            return;
        }
        if (!password) {
            toast.error(t('database.mongo.create.passwordRequired'));
            return;
        }
        try {
            await addMongo({
                name: name.trim(),
                from: from || 'local',
                database,
                username: username.trim(),
                password,
                permission,
                description: description.trim(),
            }).unwrap();
            toast.success(t('database.mongo.create.success'));
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
                    <DialogTitle>{t('database.mongo.create.title')}</DialogTitle>
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
                            <FieldLabel htmlFor="mongo-create-name">{t('database.mongo.create.name')}</FieldLabel>
                            <Input
                                id="mongo-create-name"
                                value={name}
                                placeholder={t('database.mongo.create.namePlaceholder')}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mongo-create-username">
                                {t('database.mongo.create.username')}
                            </FieldLabel>
                            <Input
                                id="mongo-create-username"
                                value={username}
                                placeholder={name || t('database.mongo.create.usernamePlaceholder')}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mongo-create-password">
                                {t('database.mongo.create.password')}
                            </FieldLabel>
                            <Input
                                id="mongo-create-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mongo-create-permission">
                                {t('database.mongo.create.permission')}
                            </FieldLabel>
                            <NativeSelect
                                id="mongo-create-permission"
                                value={permission}
                                onChange={(e) => setPermission(e.target.value as (typeof PERMISSIONS)[number])}
                            >
                                {PERMISSIONS.map((option) => (
                                    <NativeSelectOption key={option} value={option}>
                                        {option}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mongo-create-desc">{t('database.common.description')}</FieldLabel>
                            <Input
                                id="mongo-create-desc"
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

export function MongoDeleteModal({
    target,
    database,
    type,
    onClose,
}: {
    target: MongodbDBInfo;
    database: string;
    type: string;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [check] = useDeleteCheckMongodbMutation();
    const [del, { isLoading }] = useDeleteMongodbMutation();
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
            toast.success(t('database.mongo.delete.success'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.mongo.delete.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <p className="text-sm">{t('database.mongo.delete.content', { name: target.name })}</p>
                    {resources.length > 0 && (
                        <Alert>
                            <AlertTitle>{t('database.mongo.delete.resourceHint')}</AlertTitle>
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
                                {t('database.mongo.delete.force')}
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={deleteBackup}
                                    onCheckedChange={(checked) => setDeleteBackup(checked === true)}
                                />
                                {t('database.mongo.delete.deleteBackup')}
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

export function MongoRootPasswordModal({ instance, onClose }: { instance: DatabaseOption; onClose: () => void }) {
    const { t } = useTranslation();
    const [change, { isLoading }] = useChangeMongodbRootPasswordMutation();
    const [pwd, setPwd] = useState('');

    const submit = async () => {
        if (!pwd) return;
        try {
            await change({
                id: 0,
                from: instance.from,
                type: instance.type,
                database: instance.database,
                value: pwd,
            }).unwrap();
            toast.success(t('database.mongo.passwordSuccess'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.mongo.passwordTitle')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-muted-foreground">{t('database.mongo.passwordHint')}</p>
                    <Field>
                        <FieldLabel htmlFor="mongo-password">{t('database.mongo.password')}</FieldLabel>
                        <Input
                            id="mongo-password"
                            type="password"
                            value={pwd}
                            onChange={(e) => setPwd(e.target.value)}
                        />
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
