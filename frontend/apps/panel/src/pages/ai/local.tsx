import { useEffect, useState } from 'react';
import { Button, Input, Modal, Space, Switch, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCloseOllamaModelMutation,
    useCreateOllamaModelMutation,
    useDeleteOllamaModelsMutation,
    useLoadOllamaModelMutation,
    useRecreateOllamaModelMutation,
    useSearchOllamaModelsQuery,
    useSyncOllamaModelsMutation,
    type OllamaModelInfo,
} from '@/api/aiApi';
import { useDebouncedValue } from '@/pages/database/shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

function statusTag(status: string) {
    const s = (status || '').toLowerCase();
    const color = s.includes('error') || s.includes('err') ? 'red' : s.includes('stop') ? 'grey' : s.includes('download') ? 'orange' : 'green';
    return <Tag size="small" color={color}>{status || '-'}</Tag>;
}

function LoadModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [create, { isLoading }] = useCreateOllamaModelMutation();
    const [name, setName] = useState('');

    const submit = async () => {
        if (!name.trim()) return Toast.warning(t('ai.local.createNameRequired'));
        try {
            await create({ name, taskID: uuid() }).unwrap();
            Toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('ai.local.createTitle')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={440}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Text size="small" type="tertiary">{t('ai.local.createName')}</Text>
                <Input value={name} onChange={setName} placeholder={t('ai.local.createHelper')} />
            </div>
        </Modal>
    );
}

function DetailModal({ name, onClose }: { name: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [load, { isLoading }] = useLoadOllamaModelMutation();
    const [detail, setDetail] = useState('');

    useEffect(() => {
        load({ name })
            .unwrap()
            .then((res) => setDetail(typeof res === 'string' ? res : JSON.stringify(res, null, 2)))
            .catch((e) => setDetail(errText(e)));
    }, [name, load]);

    return (
        <Modal title={t('ai.local.detailTitle')} visible onCancel={onClose} footer={null} width={560}>
            {isLoading ? (
                <Text type="tertiary">{t('common.loading')}</Text>
            ) : (
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, margin: 0 }}>{detail || t('ai.local.detailEmpty')}</pre>
            )}
        </Modal>
    );
}

function DeleteModal({ row, onClose }: { row: OllamaModelInfo; onClose: () => void }) {
    const { t } = useTranslation();
    const [remove, { isLoading }] = useDeleteOllamaModelsMutation();
    const [force, setForce] = useState(false);

    const submit = async () => {
        try {
            await remove({ ids: [row.id], forceDelete: force }).unwrap();
            Toast.success(t('common.confirm'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('ai.actions.delete')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            okButtonProps={{ type: 'danger' }}
            confirmLoading={isLoading}
            width={440}
        >
            <Text>{t('ai.local.deleteConfirm', { name: row.name })}</Text>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                <Switch checked={force} onChange={setForce} size="small" />
                <Text size="small">{t('ai.local.force')}</Text>
            </label>
        </Modal>
    );
}

export default function LocalTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [showLoad, setShowLoad] = useState(false);
    const [detailName, setDetailName] = useState<string | null>(null);
    const [deleteRow, setDeleteRow] = useState<OllamaModelInfo | null>(null);

    useEffect(() => {
        setPage(1);
    }, [name]);

    const listQuery = useSearchOllamaModelsQuery({ page, pageSize, info: name });
    const rows = listQuery.data?.items ?? [];
    const [sync, { isLoading: syncing }] = useSyncOllamaModelsMutation();
    const [recreate] = useRecreateOllamaModelMutation();
    const [close] = useCloseOllamaModelMutation();

    const onSync = async () => {
        try {
            const res = await sync().unwrap();
            Toast.success(t('ai.local.createTitle') + `: ${res?.length ?? 0}`);
            listQuery.refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onRecreate = (row: OllamaModelInfo) => {
        Modal.confirm({
            title: t('ai.actions.recreate'),
            content: t('ai.local.deleteConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await recreate({ name: row.name, taskID: uuid() }).unwrap();
                    Toast.success(t('common.confirm'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const onCloseModel = (row: OllamaModelInfo) => {
        Modal.confirm({
            title: t('ai.actions.close'),
            content: t('ai.local.closeConfirm', { name: row.name }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await close({ name: row.name }).unwrap();
                    Toast.success(t('common.confirm'));
                    listQuery.refetch();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        { title: t('ai.table.name'), dataIndex: 'name', key: 'name' },
        { title: t('ai.local.size'), dataIndex: 'size', key: 'size', width: 120, render: (v: string) => v || '-' },
        { title: t('ai.local.source'), dataIndex: 'from', key: 'from', width: 120, render: (v: string) => v || '-' },
        { title: t('ai.table.status'), dataIndex: 'status', key: 'status', width: 120, render: (v: string, row: OllamaModelInfo) => statusTag(row.message && !v ? row.message : v) },
        {
            title: t('ai.table.operate'),
            key: 'operate',
            width: 260,
            render: (_: unknown, row: OllamaModelInfo) => (
                <Space>
                    <Button size="small" theme="borderless" onClick={() => setDetailName(row.name)}>
                        {t('ai.actions.detail')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => onRecreate(row)}>
                        {t('ai.actions.recreate')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => onCloseModel(row)}>
                        {t('ai.actions.close')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRow(row)}>
                        {t('ai.actions.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Tag size="large">Ollama</Tag>
                <Input
                    prefix={<IconSearch />}
                    placeholder={t('ai.local.searchPlaceholder')}
                    value={nameInput}
                    onChange={setNameInput}
                    style={{ width: 220 }}
                    showClear
                />
                <Button icon={<IconPlus />} theme="solid" type="primary" onClick={() => setShowLoad(true)}>
                    {t('ai.actions.create')}
                </Button>
                <Button icon={<IconRefresh />} loading={syncing} onClick={onSync}>
                    {t('ai.actions.sync')}
                </Button>
                <Button onClick={() => listQuery.refetch()}>{t('ai.actions.refresh')}</Button>
                <Text type="tertiary" size="small">{t('ai.local.deferred')}</Text>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={listQuery.isLoading}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: listQuery.data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                    pageSizeOpts: [10, 20, 50],
                }}
                empty={<Text type="tertiary">{t('ai.local.empty')}</Text>}
            />

            {showLoad && <LoadModal onClose={() => setShowLoad(false)} />}
            {detailName && <DetailModal name={detailName} onClose={() => setDetailName(null)} />}
            {deleteRow && <DeleteModal row={deleteRow} onClose={() => setDeleteRow(null)} />}
        </div>
    );
}
