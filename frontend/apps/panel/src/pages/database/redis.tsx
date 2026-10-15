import { useEffect, useState, type ReactNode } from 'react';
import { Button, Card, Descriptions, Empty, Input, Select, Space, Toast, Typography } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useChangeRedisPasswordMutation,
    useLoadRedisConfQuery,
    useLoadRedisPersistenceQuery,
    useLoadRedisStatusQuery,
    useUpdateRedisConfMutation,
    useUpdateRedisPersistenceMutation,
    type DatabaseOption,
} from '@/api/databaseApi';
import InstanceSelect from './InstanceSelect';

const { Text } = Typography;

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Text size="small" type="tertiary">
                {label}
            </Text>
            {children}
        </div>
    );
}

function RedisStatusPanel({ instance }: { instance: DatabaseOption }) {
    const { t } = useTranslation();
    const type = instance.type;
    const database = instance.database;
    const statusQuery = useLoadRedisStatusQuery({ type, database });
    const s = statusQuery.data;

    if (statusQuery.isError) {
        return (
            <Card title={t('database.redis.status')}>
                <Empty title={t('database.redis.unavailable')} description={t('database.overview.backendOffline')} style={{ padding: '12px 0' }} />
            </Card>
        );
    }

    return (
        <Card
            title={t('database.redis.status')}
            headerExtraContent={<Button icon={<IconRefresh />} theme="borderless" onClick={() => statusQuery.refetch()} />}
            loading={statusQuery.isLoading}
        >
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
            Toast.success(t('database.redis.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Card
            title={t('database.redis.conf')}
            headerExtraContent={
                <Button type="primary" loading={isLoading} disabled={confQuery.isLoading} onClick={submit}>
                    {t('common.confirm')}
                </Button>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label="timeout">
                    <Input value={timeout} onChange={setTimeoutValue} />
                </Field>
                <Field label="maxclients">
                    <Input value={maxclients} onChange={setMaxclients} />
                </Field>
                <Field label="maxmemory">
                    <Input value={maxmemory} onChange={setMaxmemory} />
                </Field>
            </div>
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
            Toast.success(t('database.redis.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };
    const saveRdb = async () => {
        try {
            await update({ database, appendonly: '', appendfsync: '', save, type: 'rbd', dbType: type }).unwrap();
            Toast.success(t('database.redis.saved'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Card title={t('database.redis.persistence')} loading={persistenceQuery.isLoading}>
            <Text strong>AOF</Text>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end', marginTop: 8 }}>
                <Field label="appendonly">
                    <Select value={appendonly} onChange={(v) => setAppendonly(v as string)} optionList={[{ label: 'yes', value: 'yes' }, { label: 'no', value: 'no' }]} style={{ width: '100%' }} />
                </Field>
                <Field label="appendfsync">
                    <Select
                        value={appendfsync}
                        onChange={(v) => setAppendfsync(v as string)}
                        optionList={['always', 'everysec', 'no'].map((v) => ({ label: v, value: v }))}
                        style={{ width: '100%' }}
                    />
                </Field>
                <Button type="primary" loading={saving} onClick={saveAof}>
                    {t('common.confirm')}
                </Button>
            </div>

            <div style={{ height: 16 }} />
            <Text strong>RDB</Text>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginTop: 8 }}>
                <Field label="save">
                    <Input value={save} onChange={setSave} placeholder="900 1,300 10,60 10000" />
                </Field>
                <Button type="primary" loading={saving} onClick={saveRdb}>
                    {t('common.confirm')}
                </Button>
            </div>
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
            Toast.success(t('database.redis.passwordSuccess'));
            setPwd('');
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Card title={t('database.redis.password')}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
                <Field label={t('database.redis.password')}>
                    <Input mode="password" value={pwd} onChange={setPwd} />
                </Field>
                <Button type="primary" loading={isLoading} disabled={!pwd} onClick={submit}>
                    {t('common.confirm')}
                </Button>
            </div>
        </Card>
    );
}

export default function DatabaseRedis() {
    const { t } = useTranslation();
    const [instance, setInstance] = useState<DatabaseOption>();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space wrap>
                <InstanceSelect types="redis,redis-cluster" engineType="redis" value={instance?.database} onChange={setInstance} />
            </Space>

            {!instance ? (
                <Card>
                    <Empty title={t('database.common.noInstance')} description={t('database.common.noInstanceDesc')} style={{ padding: '24px 0' }} />
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <RedisStatusPanel instance={instance} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <RedisConfPanel instance={instance} />
                        <RedisPasswordPanel instance={instance} />
                    </div>
                    <RedisPersistencePanel instance={instance} />
                </div>
            )}
        </div>
    );
}
