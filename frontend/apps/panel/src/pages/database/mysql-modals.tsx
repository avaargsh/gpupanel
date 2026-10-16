import {
    useAddMysqlMutation,
    useChangeMysqlPasswordMutation,
    useDeleteCheckMysqlMutation,
    useDeleteMysqlMutation,
    useLoadDBBaseInfoQuery,
    useLoadMysqlFormatOptionsQuery,
    type DatabaseOption,
    type FormatCollationOption,
    type MysqlDBInfo,
} from '@/api/databaseApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Descriptions } from '../container/descriptions';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 主机授权模式：全部主机（%）或指定主机列表。 */
export function HostModeHelper({
    mode,
    hosts,
    onModeChange,
    onHostsChange,
    idPrefix = 'mysql-host',
}: {
    mode: '%' | 'ip';
    hosts: string;
    onModeChange: (mode: '%' | 'ip') => void;
    onHostsChange: (hosts: string) => void;
    idPrefix?: string;
}) {
    const { t } = useTranslation();
    return (
        <>
            <Field>
                <FieldLabel htmlFor={`${idPrefix}-mode`}>{t('database.mysql.host.label')}</FieldLabel>
                <NativeSelect
                    id={`${idPrefix}-mode`}
                    value={mode}
                    onChange={(e) => onModeChange(e.target.value as '%' | 'ip')}
                >
                    <NativeSelectOption value="%">{t('database.mysql.host.all')}</NativeSelectOption>
                    <NativeSelectOption value="ip">{t('database.mysql.host.specific')}</NativeSelectOption>
                </NativeSelect>
            </Field>
            {mode === 'ip' && (
                <Field>
                    <FieldLabel htmlFor={`${idPrefix}-list`}>{t('database.mysql.host.placeholder')}</FieldLabel>
                    <Input
                        id={`${idPrefix}-list`}
                        value={hosts}
                        placeholder="192.168.1.1,10.0.0.%"
                        onChange={(e) => onHostsChange(e.target.value)}
                    />
                </Field>
            )}
        </>
    );
}

const FALLBACK_FORMATS: FormatCollationOption[] = [
    { format: 'utf8mb4', collations: [] },
    { format: 'utf8mb3', collations: [] },
    { format: 'gbk', collations: [] },
    { format: 'big5', collations: [] },
];

export function MysqlCreateModal({
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
    const [addMysql, { isLoading }] = useAddMysqlMutation();
    const formatQuery = useLoadMysqlFormatOptionsQuery({ database }, { skip: !open || !database });
    const formatOptions = formatQuery.data && formatQuery.data.length ? formatQuery.data : FALLBACK_FORMATS;

    const [name, setName] = useState('');
    const [format, setFormat] = useState('utf8mb4');
    const [collation, setCollation] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [hostMode, setHostMode] = useState<'%' | 'ip'>('%');
    const [hosts, setHosts] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        if (open) {
            setName('');
            setFormat('utf8mb4');
            setCollation('');
            setUsername('');
            setPassword('');
            setHostMode('%');
            setHosts('');
            setDescription('');
        }
    }, [open]);

    const collations = formatOptions.find((f) => f.format === format)?.collations ?? [];

    const submit = async () => {
        if (!name.trim()) {
            toast.error(t('database.mysql.create.nameRequired'));
            return;
        }
        if (!password) {
            toast.error(t('database.mysql.create.passwordRequired'));
            return;
        }
        const permission = hostMode === '%' ? '%' : hosts.trim();
        if (!permission) {
            toast.error(t('database.mysql.host.required'));
            return;
        }
        try {
            await addMysql({
                name: name.trim(),
                from: from || 'local',
                database,
                format,
                collation,
                username: username.trim() || name.trim(),
                password,
                permission,
                description: description.trim(),
            }).unwrap();
            toast.success(t('database.mysql.create.success'));
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
                    <DialogTitle>{t('database.mysql.create.title')}</DialogTitle>
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
                            <FieldLabel htmlFor="mysql-create-name">{t('database.mysql.create.name')}</FieldLabel>
                            <Input
                                id="mysql-create-name"
                                value={name}
                                placeholder={t('database.mysql.create.namePlaceholder')}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mysql-create-format">{t('database.mysql.create.format')}</FieldLabel>
                            <NativeSelect
                                id="mysql-create-format"
                                value={format}
                                onChange={(e) => {
                                    setFormat(e.target.value);
                                    setCollation('');
                                }}
                            >
                                {formatOptions.map((f) => (
                                    <NativeSelectOption key={f.format} value={f.format}>
                                        {f.format}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mysql-create-collation">
                                {t('database.mysql.create.collation')}
                            </FieldLabel>
                            <NativeSelect
                                id="mysql-create-collation"
                                value={collation}
                                onChange={(e) => setCollation(e.target.value)}
                            >
                                <NativeSelectOption value="">
                                    {t('database.mysql.create.collationPlaceholder')}
                                </NativeSelectOption>
                                {collations.map((c) => (
                                    <NativeSelectOption key={c} value={c}>
                                        {c}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mysql-create-username">
                                {t('database.mysql.create.username')}
                            </FieldLabel>
                            <Input
                                id="mysql-create-username"
                                value={username}
                                placeholder={name || t('database.mysql.create.usernamePlaceholder')}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="mysql-create-password">
                                {t('database.mysql.create.password')}
                            </FieldLabel>
                            <Input
                                id="mysql-create-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </Field>
                        <HostModeHelper
                            mode={hostMode}
                            hosts={hosts}
                            onModeChange={setHostMode}
                            onHostsChange={setHosts}
                        />
                        <Field>
                            <FieldLabel htmlFor="mysql-create-desc">{t('database.common.description')}</FieldLabel>
                            <Textarea
                                id="mysql-create-desc"
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

export function MysqlDeleteModal({
    target,
    database,
    type,
    onClose,
}: {
    target: MysqlDBInfo;
    database: string;
    type: string;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [check] = useDeleteCheckMysqlMutation();
    const [del, { isLoading }] = useDeleteMysqlMutation();
    const [resources, setResources] = useState<string[]>([]);
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);

    useEffect(() => {
        let active = true;
        check({ id: target.id, type, database })
            .unwrap()
            .then((res) => active && setResources(res ?? []))
            .catch(() => {
                if (active) setResources([]);
            });
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target.id]);

    const submit = async () => {
        try {
            await del({ id: target.id, type, database, forceDelete, deleteBackup }).unwrap();
            toast.success(t('database.mysql.delete.success'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.mysql.delete.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <p className="text-sm">{t('database.mysql.delete.content', { name: target.name })}</p>
                    {resources.length > 0 && (
                        <Alert>
                            <AlertTitle>{t('database.mysql.delete.resourceHint')}</AlertTitle>
                            <AlertDescription>
                                <div className="flex flex-wrap gap-1.5">
                                    {resources.map((r) => (
                                        <Badge key={r} variant="secondary">
                                            {r}
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
                                {t('database.mysql.delete.force')}
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                    checked={deleteBackup}
                                    onCheckedChange={(checked) => setDeleteBackup(checked === true)}
                                />
                                {t('database.mysql.delete.deleteBackup')}
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

export function MysqlConnectModal({
    open,
    instance,
    onClose,
}: {
    open: boolean;
    instance: DatabaseOption;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const infoQuery = useLoadDBBaseInfoQuery({ type: instance.type, database: instance.database }, { skip: !open });
    const [changePassword, { isLoading }] = useChangeMysqlPasswordMutation();
    const [pwd, setPwd] = useState('');
    const info = infoQuery.data;

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
            toast.success(t('database.mysql.connect.passwordSuccess'));
            setPwd('');
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('database.mysql.connect.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <Descriptions
                        column={2}
                        data={[
                            { key: t('database.mysql.connect.name'), value: info?.name ?? '-' },
                            { key: t('database.mysql.connect.container'), value: info?.containerName ?? '-' },
                            { key: t('database.mysql.connect.port'), value: String(info?.port ?? '-') },
                        ]}
                    />
                    <Separator />
                    <Field>
                        <FieldLabel htmlFor="mysql-connect-password">
                            {t('database.mysql.connect.rootPassword')}
                        </FieldLabel>
                        <Input
                            id="mysql-connect-password"
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
                        {t('database.mysql.connect.change')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
