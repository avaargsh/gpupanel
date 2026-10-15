import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Input, Modal, Select, Space, Switch, Table, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconMinus, IconPlus, IconRefresh, IconSearch, IconTick } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateScriptMutation,
    useDeleteScriptsMutation,
    useListCronjobGroupsQuery,
    useSearchScriptsQuery,
    useUpdateScriptMutation,
    type ScriptInfo,
} from '@/api/cronjobApi';
import { useDebouncedValue } from '@/pages/database/shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

interface SheetProps {
    target: ScriptInfo | null;
    groups: { id: number; name: string }[];
    onClose: () => void;
}

function ScriptSheet({ target, groups, onClose }: SheetProps) {
    const { t } = useTranslation();
    const [name, setName] = useState(target?.name ?? '');
    const [groupID, setGroupID] = useState(target?.groupID ?? 0);
    const [isInteractive, setIsInteractive] = useState(target?.isInteractive ?? false);
    const [description, setDescription] = useState(target?.description ?? '');
    const [script, setScript] = useState(target?.script ?? '');
    const [create, { isLoading: creating }] = useCreateScriptMutation();
    const [update, { isLoading: updating }] = useUpdateScriptMutation();

    const submit = async () => {
        if (!name.trim()) return Toast.warning(t('cronjob.library.nameRequired'));
        if (!script.trim()) return Toast.warning(t('cronjob.library.contentRequired'));
        const payload = { name: name.trim(), groupID, isInteractive, description, script };
        try {
            if (target) {
                await update({ id: target.id, ...payload }).unwrap();
            } else {
                await create(payload).unwrap();
            }
            Toast.success(t('cronjob.saveSuccess'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={target ? t('cronjob.library.edit') : t('cronjob.library.create')}
            visible
            width={640}
            confirmLoading={creating || updating}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onOk={submit}
            onCancel={onClose}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label={t('cronjob.library.name')}>
                    <Input value={name} onChange={setName} disabled={!!target && target.isSystem} />
                </Field>
                <Field label={t('cronjob.library.group')}>
                    <Select
                        value={groupID}
                        style={{ width: '100%' }}
                        showClear
                        optionList={groups.map((g) => ({ label: g.name === 'Default' ? t('cronjob.operate.default') : g.name, value: g.id }))}
                        onChange={(v) => setGroupID(Number(v ?? 0))}
                    />
                </Field>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <Switch checked={isInteractive} onChange={setIsInteractive} size="small" />
                    <Text size="small">{t('cronjob.library.interactive')}</Text>
                </label>
                <Field label={t('cronjob.library.description')}>
                    <Input value={description} onChange={setDescription} />
                </Field>
                <Field label={t('cronjob.library.content')}>
                    <TextArea value={script} onChange={setScript} autosize={{ minRows: 10, maxRows: 22 }} />
                </Field>
            </div>
        </Modal>
    );
}

export default function ScriptLibraryTab() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [groupID, setGroupID] = useState<number | undefined>(undefined);
    const [selected, setSelected] = useState<number[]>([]);
    const [sheetTarget, setSheetTarget] = useState<ScriptInfo | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [viewing, setViewing] = useState<ScriptInfo | null>(null);

    useEffect(() => {
        setPage(1);
    }, [info, groupID]);

    const { data: groups = [] } = useListCronjobGroupsQuery('script');
    const { data, isFetching, refetch } = useSearchScriptsQuery({
        page,
        pageSize,
        info,
        groupID: groupID ?? 0,
        orderBy: 'createdAt',
        order: 'descending',
    });
    const [deleteScripts] = useDeleteScriptsMutation();

    const groupName = useMemo(() => {
        const map = new Map(groups.map((g) => [g.id, g.name]));
        return (id: number) => {
            const name = map.get(id);
            if (!name) return '-';
            return name === 'Default' ? t('cronjob.operate.default') : name;
        };
    }, [groups, t]);

    const rows = data?.items ?? [];

    const onDelete = (targets: ScriptInfo[]) =>
        Modal.confirm({
            title: t('cronjob.actions.delete'),
            content: t('cronjob.library.deleteConfirm', { name: targets.map((s) => s.name).join('、') }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await deleteScripts({ ids: targets.map((s) => s.id) }).unwrap();
                    Toast.success(t('cronjob.library.deleteSuccess'));
                    setSelected([]);
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });

    const columns = [
        {
            title: t('cronjob.library.name'),
            dataIndex: 'name',
            key: 'name',
            render: (v: string, row: ScriptInfo) => (
                <Button theme="borderless" size="small" onClick={() => setViewing(row)}>
                    {v}
                </Button>
            ),
        },
        {
            title: t('cronjob.library.interactive'),
            dataIndex: 'isInteractive',
            key: 'isInteractive',
            width: 100,
            render: (v: boolean) => (v ? <IconTick /> : <IconMinus />),
        },
        { title: t('cronjob.columns.group'), key: 'group', width: 140, render: (_: unknown, row: ScriptInfo) => (row.isSystem ? t('cronjob.library.system') : groupName(row.groupID)) },
        { title: t('cronjob.library.description'), dataIndex: 'description', key: 'description' },
        { title: t('cronjob.library.date'), dataIndex: 'createdAt', key: 'createdAt', width: 180 },
        {
            title: t('cronjob.columns.operate'),
            key: 'operate',
            width: 160,
            render: (_: unknown, row: ScriptInfo) => (
                <Space>
                    <Button
                        size="small"
                        theme="borderless"
                        onClick={() => {
                            setSheetTarget(row);
                            setSheetOpen(true);
                        }}
                    >
                        {t('cronjob.actions.edit')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => onDelete([row])}>
                        {t('cronjob.actions.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input prefix={<IconSearch />} placeholder={t('cronjob.library.searchPlaceholder')} value={searchInput} onChange={setSearchInput} style={{ width: 220 }} showClear />
                <Select
                    value={groupID}
                    onChange={(v) => setGroupID(v ? Number(v) : undefined)}
                    placeholder={t('cronjob.groupFilter')}
                    style={{ width: 160 }}
                    showClear
                    optionList={groups.map((g) => ({ label: g.name === 'Default' ? t('cronjob.operate.default') : g.name, value: g.id }))}
                />
                <Button
                    icon={<IconPlus />}
                    theme="solid"
                    type="primary"
                    onClick={() => {
                        setSheetTarget(null);
                        setSheetOpen(true);
                    }}
                >
                    {t('cronjob.library.create')}
                </Button>
                <Button icon={<IconRefresh />} loading={isFetching} onClick={() => refetch()}>
                    {t('cronjob.actions.refresh')}
                </Button>
                {selected.length > 0 && (
                    <Button icon={<IconDelete />} type="danger" onClick={() => onDelete(rows.filter((r) => selected.includes(r.id)))}>
                        {t('cronjob.library.delete')}
                    </Button>
                )}
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={isFetching}
                rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected((keys ?? []).map(Number)) }}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (size: number) => {
                        setPageSize(size);
                        setPage(1);
                    },
                }}
                empty={<Text type="tertiary">{t('cronjob.library.empty')}</Text>}
            />

            {sheetOpen && <ScriptSheet target={sheetTarget} groups={groups} onClose={() => setSheetOpen(false)} />}
            {viewing && (
                <Modal title={viewing.name} visible footer={null} onCancel={() => setViewing(null)} width={640}>
                    <pre style={{ margin: 0, maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>{viewing.script}</pre>
                </Modal>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Text size="small" type="tertiary">
                {label}
            </Text>
            {children}
        </div>
    );
}
