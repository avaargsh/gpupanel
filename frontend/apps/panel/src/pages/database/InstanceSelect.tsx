import {
    useAddDatabaseMutation,
    useCheckDatabaseMutation,
    useListDatabaseInstancesQuery,
    type DatabaseCreate,
    type DatabaseOption,
} from '@/api/databaseApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Combobox } from '../container/combobox';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

interface InstanceSelectProps {
    /** 实例类型，逗号分隔，如 mysql,mariadb,mysql-cluster */
    types: string;
    /** 新增远程连接时使用的引擎类型 */
    engineType: string;
    value?: string;
    onChange: (option: DatabaseOption | undefined) => void;
}

/**
 * 数据库实例选择器：列出本机已安装（local）与远程连接（remote）的数据库实例。
 * 同时提供「添加远程数据库」入口（/databases/db/check + /databases/db）。
 */
export default function InstanceSelect({ types, engineType, value, onChange }: InstanceSelectProps) {
    const { t } = useTranslation();
    const query = useListDatabaseInstancesQuery({ type: types });
    const instances = useMemo(() => query.data ?? [], [query.data]);
    const [addOpen, setAddOpen] = useState(false);
    const [checkDatabase, { isLoading: checking }] = useCheckDatabaseMutation();
    const [addDatabase, { isLoading: adding }] = useAddDatabaseMutation();

    const [name, setName] = useState('');
    const [version, setVersion] = useState('');
    const [address, setAddress] = useState('');
    const [port, setPort] = useState('');
    const [initialDB, setInitialDB] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [description, setDescription] = useState('');
    const [errors, setErrors] = useState<{ name?: string; address?: string }>({});

    useEffect(() => {
        if (addOpen) {
            setName('');
            setVersion('');
            setAddress('');
            setPort('');
            setInitialDB('');
            setUsername('');
            setPassword('');
            setDescription('');
            setErrors({});
        }
    }, [addOpen]);

    const options = useMemo(
        () =>
            instances.map((item) => ({
                label: `${item.database} · ${item.type}${item.version ? ` ${item.version}` : ''}${item.from === 'remote' ? `（${t('database.instance.remote')}）` : ''}`,
                value: item.database,
            })),
        [instances, t],
    );

    // 首次加载或切换到无选中项的实例类型时，自动选中第一个实例。
    useEffect(() => {
        if (!value && instances.length > 0) {
            onChange(instances[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instances, value]);

    const handleAdd = async () => {
        const nextErrors: { name?: string; address?: string } = {};
        if (!name.trim()) nextErrors.name = t('database.instance.nameRequired');
        if (!address.trim()) nextErrors.address = t('database.instance.addressRequired');
        if (nextErrors.name || nextErrors.address) {
            setErrors(nextErrors);
            return;
        }
        const payload: DatabaseCreate = {
            name: name.trim(),
            type: engineType,
            from: 'remote',
            version: version.trim(),
            address: address.trim(),
            port: Number(port || 0),
            initialDB: initialDB.trim(),
            username: username.trim(),
            password,
            description: description.trim(),
        };
        try {
            const res = await checkDatabase(payload).unwrap();
            if (!res) {
                toast.error(t('database.instance.checkFailed'));
                return;
            }
            await addDatabase(payload).unwrap();
            toast.success(t('database.instance.addSuccess'));
            setAddOpen(false);
            query.refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Combobox
                className="w-[280px] justify-between"
                options={options}
                value={value}
                onChange={(next) => onChange(instances.find((item) => item.database === next))}
                placeholder={t('database.instance.select')}
                emptyText={t('common.empty')}
                disabled={query.isLoading}
            />
            <Button variant="outline" size="icon" aria-label={t('home.refresh')} onClick={() => query.refetch()}>
                <RefreshCwIcon />
            </Button>
            <Button onClick={() => setAddOpen(true)}>
                <PlusIcon data-icon="inline-start" />
                {t('database.instance.addRemote')}
            </Button>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{t('database.instance.addRemote')}</DialogTitle>
                    </DialogHeader>
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleAdd();
                        }}
                    >
                        <FieldGroup>
                            <Field data-invalid={Boolean(errors.name)}>
                                <FieldLabel htmlFor="db-instance-name">{t('database.instance.name')}</FieldLabel>
                                <Input
                                    id="db-instance-name"
                                    value={name}
                                    aria-invalid={Boolean(errors.name)}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                                    }}
                                />
                                {errors.name ? <FieldError>{errors.name}</FieldError> : null}
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="db-instance-version">{t('database.instance.version')}</FieldLabel>
                                <Input
                                    id="db-instance-version"
                                    value={version}
                                    placeholder="8.0 / 15 / 7.0"
                                    onChange={(e) => setVersion(e.target.value)}
                                />
                            </Field>
                            <Field data-invalid={Boolean(errors.address)}>
                                <FieldLabel htmlFor="db-instance-address">{t('database.instance.address')}</FieldLabel>
                                <Input
                                    id="db-instance-address"
                                    value={address}
                                    aria-invalid={Boolean(errors.address)}
                                    onChange={(e) => {
                                        setAddress(e.target.value);
                                        if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
                                    }}
                                />
                                {errors.address ? <FieldError>{errors.address}</FieldError> : null}
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="db-instance-port">{t('database.instance.port')}</FieldLabel>
                                <Input
                                    id="db-instance-port"
                                    type="number"
                                    min={0}
                                    max={65535}
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="db-instance-initial">
                                    {t('database.instance.initialDB')}
                                </FieldLabel>
                                <Input
                                    id="db-instance-initial"
                                    value={initialDB}
                                    onChange={(e) => setInitialDB(e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="db-instance-username">
                                    {t('database.instance.username')}
                                </FieldLabel>
                                <Input
                                    id="db-instance-username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="db-instance-password">
                                    {t('database.instance.password')}
                                </FieldLabel>
                                <Input
                                    id="db-instance-password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="db-instance-desc">{t('database.instance.description')}</FieldLabel>
                                <Input
                                    id="db-instance-desc"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </Field>
                        </FieldGroup>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={checking || adding}>
                                {checking || adding ? <Spinner data-icon="inline-start" /> : null}
                                {t('common.confirm')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
