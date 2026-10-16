import {
    useChangeRedisPasswordMutation,
    useLoadRedisConfQuery,
    useLoadRedisPersistenceQuery,
    useLoadRedisStatusQuery,
    useUpdateRedisConfMutation,
    useUpdateRedisPersistenceMutation,
    type DatabaseOption,
} from '@/api/databaseApi';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { RefreshCwIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Descriptions } from '../container/descriptions';
import InstanceSelect from './InstanceSelect';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

function RedisStatusPanel({ instance }: { instance: DatabaseOption }) {
    const { t } = useTranslation();
    const type = instance.type;
    const database = instance.database;
    const statusQuery = useLoadRedisStatusQuery({ type, database });
    const s = statusQuery.data;

    if (statusQuery.isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('database.redis.status')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>{t('database.redis.unavailable')}</EmptyTitle>
                            <EmptyDescription>{t('database.overview.backendOffline')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('database.redis.status')}</CardTitle>
                <CardAction>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('home.refresh')}
                        onClick={() => statusQuery.refetch()}
                    >
                        <RefreshCwIcon />
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent>
                {statusQuery.isLoading ? (
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Spinner />
                        {t('common.loading')}
                    </span>
                ) : (
                    <Descriptions
                        column={2}
                        data={[
                            { key: 'tcp_port', value: s?.tcp_port ?? '-' },
                            { key: t('database.redis.uptime'), value: s?.uptime_in_days ?? '-' },
                            { key: t('database.redis.clients'), value: s?.connected_clients ?? '-' },
                            { key: t('database.redis.memoryUsed'), value: s?.used_memory ?? '-' },
                            { key: t('database.redis.memoryRss'), value: s?.used_memory_rss ?? '-' },
                            { key: t('database.redis.memoryPeak'), value: s?.used_memory_peak ?? '-' },
                            { key: t('database.redis.fragmentation'), value: s?.mem_fragmentation_ratio ?? '-' },
                            { key: t('database.redis.opsPerSec'), value: s?.instantaneous_ops_per_sec ?? '-' },
                            { key: t('database.redis.connections'), value: s?.total_connections_received ?? '-' },
                            { key: t('database.redis.commands'), value: s?.total_commands_processed ?? '-' },
                            { key: t('database.redis.keyspaceHits'), value: s?.keyspace_hits ?? '-' },
                            { key: t('database.redis.keyspaceMisses'), value: s?.keyspace_misses ?? '-' },
                        ]}
                    />
                )}
            </CardContent>
        </Card>
    );
}

function RedisConfPanel({ instance }: { instance: DatabaseOption }) {
    const { t } = useTranslation();
    const type = instance.type;
    const database = instance.database;
    const confQuery = useLoadRedisConfQuery({ type, database });
    const [update, { isLoading }] = useUpdateRedisConfMutation();
    const [timeout, setTimeoutValue] = useState('');
    const [maxclients, setMaxclients] = useState('');
    const [maxmemory, setMaxmemory] = useState('');

    useEffect(() => {
        if (confQuery.data) {
            setTimeoutValue(String(confQuery.data.timeout ?? ''));
            setMaxclients(String(confQuery.data.maxclients ?? ''));
            setMaxmemory(String(confQuery.data.maxmemory ?? ''));
        }
    }, [confQuery.data]);

    const submit = async () => {
        try {
            await update({ database, timeout, maxclients, maxmemory, dbType: type }).unwrap();
            toast.success(t('database.redis.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('database.redis.conf')}</CardTitle>
                <CardAction>
                    <Button disabled={isLoading || confQuery.isLoading} onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <Field>
                    <FieldLabel htmlFor="redis-conf-timeout">timeout</FieldLabel>
                    <Input id="redis-conf-timeout" value={timeout} onChange={(e) => setTimeoutValue(e.target.value)} />
                </Field>
                <Field>
                    <FieldLabel htmlFor="redis-conf-maxclients">maxclients</FieldLabel>
                    <Input
                        id="redis-conf-maxclients"
                        value={maxclients}
                        onChange={(e) => setMaxclients(e.target.value)}
                    />
                </Field>
                <Field>
                    <FieldLabel htmlFor="redis-conf-maxmemory">maxmemory</FieldLabel>
                    <Input id="redis-conf-maxmemory" value={maxmemory} onChange={(e) => setMaxmemory(e.target.value)} />
                </Field>
            </CardContent>
        </Card>
    );
}

function RedisPersistencePanel({ instance }: { instance: DatabaseOption }) {
    const { t } = useTranslation();
    const type = instance.type;
    const database = instance.database;
    const persistenceQuery = useLoadRedisPersistenceQuery({ type, database });
    const [update, { isLoading: saving }] = useUpdateRedisPersistenceMutation();

    const [appendonly, setAppendonly] = useState('no');
    const [appendfsync, setAppendfsync] = useState('everysec');
    const [save, setSave] = useState('');

    useEffect(() => {
        if (persistenceQuery.data) {
            setAppendonly(persistenceQuery.data.appendonly || 'no');
            setAppendfsync(persistenceQuery.data.appendfsync || 'everysec');
            setSave(persistenceQuery.data.save || '');
        }
    }, [persistenceQuery.data]);

    const saveAof = async () => {
        try {
            await update({ database, appendonly, appendfsync, save: '', type: 'aof', dbType: type }).unwrap();
            toast.success(t('database.redis.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const saveRdb = async () => {
        try {
            await update({ database, appendonly: '', appendfsync: '', save, type: 'rbd', dbType: type }).unwrap();
            toast.success(t('database.redis.saved'));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('database.redis.persistence')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                    <span className="text-sm font-semibold">AOF</span>
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                        <Field>
                            <FieldLabel htmlFor="redis-appendonly">appendonly</FieldLabel>
                            <NativeSelect
                                id="redis-appendonly"
                                value={appendonly}
                                onChange={(e) => setAppendonly(e.target.value)}
                            >
                                <NativeSelectOption value="yes">yes</NativeSelectOption>
                                <NativeSelectOption value="no">no</NativeSelectOption>
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="redis-appendfsync">appendfsync</FieldLabel>
                            <NativeSelect
                                id="redis-appendfsync"
                                value={appendfsync}
                                onChange={(e) => setAppendfsync(e.target.value)}
                            >
                                {['always', 'everysec', 'no'].map((option) => (
                                    <NativeSelectOption key={option} value={option}>
                                        {option}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Button disabled={saving} onClick={saveAof}>
                            {saving ? <Spinner data-icon="inline-start" /> : null}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <span className="text-sm font-semibold">RDB</span>
                    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
                        <Field>
                            <FieldLabel htmlFor="redis-save">save</FieldLabel>
                            <Input
                                id="redis-save"
                                value={save}
                                placeholder="900 1,300 10,60 10000"
                                onChange={(e) => setSave(e.target.value)}
                            />
                        </Field>
                        <Button disabled={saving} onClick={saveRdb}>
                            {saving ? <Spinner data-icon="inline-start" /> : null}
                            {t('common.confirm')}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function RedisPasswordPanel({ instance }: { instance: DatabaseOption }) {
    const { t } = useTranslation();
    const [change, { isLoading }] = useChangeRedisPasswordMutation();
    const [pwd, setPwd] = useState('');

    const submit = async () => {
        if (!pwd) return;
        try {
            await change({ database: instance.database, value: pwd }).unwrap();
            toast.success(t('database.redis.passwordSuccess'));
            setPwd('');
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('database.redis.password')}</CardTitle>
            </CardHeader>
            <CardContent>
                <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                    }}
                >
                    <Field className="min-w-[200px] flex-1">
                        <FieldLabel htmlFor="redis-password">{t('database.redis.password')}</FieldLabel>
                        <Input
                            id="redis-password"
                            type="password"
                            value={pwd}
                            onChange={(e) => setPwd(e.target.value)}
                        />
                    </Field>
                    <Button type="submit" disabled={isLoading || !pwd}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

export default function DatabaseRedis() {
    const { t } = useTranslation();
    const [instance, setInstance] = useState<DatabaseOption>();

    return (
        <div className="flex flex-col gap-4">
            <InstanceSelect types="redis" engineType="redis" value={instance?.database} onChange={setInstance} />

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
                <div className="flex flex-col gap-4">
                    <RedisStatusPanel instance={instance} />
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <RedisConfPanel instance={instance} />
                        <RedisPasswordPanel instance={instance} />
                    </div>
                    <RedisPersistencePanel instance={instance} />
                </div>
            )}
        </div>
    );
}
