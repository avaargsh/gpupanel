import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal, Select, Space, Toast } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useAddDatabaseMutation,
    useCheckDatabaseMutation,
    useListDatabaseInstancesQuery,
    type DatabaseCreate,
    type DatabaseOption,
} from '@/api/databaseApi';

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

    const optionList = useMemo(
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

    const handleAdd = async (values: Record<string, unknown>) => {
        const payload: DatabaseCreate = {
            name: String(values.name ?? ''),
            type: engineType,
            from: 'remote',
            version: String(values.version ?? ''),
            address: String(values.address ?? ''),
            port: Number(values.port ?? 0),
            initialDB: String(values.initialDB ?? ''),
            username: String(values.username ?? ''),
            password: String(values.password ?? ''),
            description: String(values.description ?? ''),
        };
        try {
            const ok = await checkDatabase(payload).unwrap();
            if (!ok) {
                Toast.error(t('database.instance.checkFailed'));
                return;
            }
            await addDatabase(payload).unwrap();
            Toast.success(t('database.instance.addSuccess'));
            setAddOpen(false);
            query.refetch();
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    return (
        <Space>
            <Select
                placeholder={t('database.instance.select')}
                value={value || undefined}
                optionList={optionList}
                loading={query.isLoading}
                filter
                style={{ width: 320 }}
                onChange={(v) => onChange(instances.find((i) => i.database === v))}
            />
            <Button icon={<IconRefresh />} theme="borderless" onClick={() => query.refetch()} />
            <Button icon={<IconPlus />} onClick={() => setAddOpen(true)}>
                {t('database.instance.addRemote')}
            </Button>

            <Modal title={t('database.instance.addRemote')} visible={addOpen} onCancel={() => setAddOpen(false)} footer={null} maskClosable={false}>
                <Form onSubmit={handleAdd}>
                    <Form.Input field="name" label={t('database.instance.name')} rules={[{ required: true, message: t('database.instance.nameRequired') }]} />
                    <Form.Input field="version" label={t('database.instance.version')} placeholder="8.0 / 15 / 7.0" />
                    <Form.Input field="address" label={t('database.instance.address')} rules={[{ required: true, message: t('database.instance.addressRequired') }]} />
                    <Form.InputNumber field="port" label={t('database.instance.port')} min={0} max={65535} />
                    <Form.Input field="initialDB" label={t('database.instance.initialDB')} />
                    <Form.Input field="username" label={t('database.instance.username')} />
                    <Form.Input field="password" label={t('database.instance.password')} mode="password" />
                    <Form.Input field="description" label={t('database.instance.description')} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                        <Button onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
                        <Button htmlType="submit" type="primary" loading={checking || adding}>
                            {t('common.confirm')}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </Space>
    );
}
