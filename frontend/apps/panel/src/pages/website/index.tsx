import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    useCreateWebsiteMutation,
    useDeleteWebsiteMutation,
    useListWebsiteGroupsQuery,
    useOperateWebsiteMutation,
    useSearchWebsitesQuery,
    type GroupInfo,
    type WebsiteCreate,
    type WebsiteRes,
} from '@/api/websiteApi';
import { useDebouncedValue } from '@/pages/database/shared';

const { Text } = Typography;

const TYPES = ['deployment', 'runtime', 'static', 'proxy', 'subsite', 'stream'];
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const statusColor = (status: string) => {
    switch (status) {
        case 'Running':
            return 'green';
        case 'Stopped':
            return 'grey';
        case 'Creating':
            return 'blue';
        default:
            return 'orange';
    }
};

function CheckLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <Text size="small">{label}</Text>
        </label>
    );
}

function CreateWebsiteModal({ groups, onClose }: { groups: GroupInfo[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [create, { isLoading }] = useCreateWebsiteMutation();
    const [type, setType] = useState('static');
    const [groupId, setGroupId] = useState<number>(groups[0]?.id ?? 0);
    const [alias, setAlias] = useState('');
    const [primaryDomain, setPrimaryDomain] = useState('');
    const [otherDomains, setOtherDomains] = useState('');
    const [remark, setRemark] = useState('');
    const [siteDir, setSiteDir] = useState('');
    const [ipv6, setIpv6] = useState(false);

    const submit = async () => {
        if (!alias.trim()) return Toast.error(t('website.create.aliasRequired'));
        if (!primaryDomain.trim()) return Toast.error(t('website.create.primaryDomainRequired'));
        const domains = [
            { domain: primaryDomain.trim(), port: 80, ssl: false },
            ...otherDomains
                .split(',')
                .map((d) => d.trim())
                .filter(Boolean)
                .map((domain) => ({ domain, port: 80, ssl: false })),
        ];
        const payload: WebsiteCreate = {
            type,
            alias: alias.trim(),
            remark: remark.trim(),
            appType: 'new',
            webSiteGroupID: groupId,
            IPV6: ipv6,
            domains,
            siteDir: siteDir.trim(),
        };
        try {
            await create(payload).unwrap();
            Toast.success(t('website.create.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('website.create.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={520}
            maskClosable={false}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Text size="small" type="tertiary">{t('website.create.type')}</Text>
                <Select value={type} onChange={(v) => setType(v as string)} optionList={TYPES.map((v) => ({ label: t(`website.type.${v}`), value: v }))} style={{ width: '100%' }} />
                <Text size="small" type="tertiary">{t('website.create.group')}</Text>
                <Select value={groupId} onChange={(v) => setGroupId(v as number)} optionList={groups.map((g) => ({ label: g.name, value: g.id }))} style={{ width: '100%' }} />
                <Text size="small" type="tertiary">{t('website.create.alias')}</Text>
                <Input value={alias} onChange={setAlias} />
                <Text size="small" type="tertiary">{t('website.create.primaryDomain')}</Text>
                <Input value={primaryDomain} onChange={setPrimaryDomain} placeholder="example.com" />
                <Text size="small" type="tertiary">{t('website.create.domains')}</Text>
                <Input value={otherDomains} onChange={setOtherDomains} placeholder={t('website.create.domainsPlaceholder')} />
                <Text size="small" type="tertiary">{t('website.create.siteDir')}</Text>
                <Input value={siteDir} onChange={setSiteDir} placeholder="/opt/gpupanel/www/sites" />
                <Text size="small" type="tertiary">{t('website.create.remark')}</Text>
                <Input value={remark} onChange={setRemark} />
                <CheckLine checked={ipv6} onChange={setIpv6} label={t('website.create.ipv6')} />
            </div>
        </Modal>
    );
}

function DeleteWebsiteModal({ target, onClose }: { target: WebsiteRes; onClose: () => void }) {
    const { t } = useTranslation();
    const [del, { isLoading }] = useDeleteWebsiteMutation();
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);
    const [deleteDB, setDeleteDb] = useState(false);

    const submit = async () => {
        try {
            await del({ id: target.id, deleteApp: false, deleteBackup, forceDelete, deleteDB }).unwrap();
            Toast.success(t('website.delete.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('website.delete.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            okButtonProps={{ type: 'danger' }}
            confirmLoading={isLoading}
            width={460}
        >
            <Text>{t('website.delete.content', { name: target.primaryDomain })}</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <CheckLine checked={forceDelete} onChange={setForceDelete} label={t('website.delete.force')} />
                <CheckLine checked={deleteBackup} onChange={setDeleteBackup} label={t('website.delete.deleteBackup')} />
                <CheckLine checked={deleteDB} onChange={setDeleteDb} label={t('website.delete.deleteDB')} />
            </div>
        </Modal>
    );
}

export default function WebsitesPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [type, setType] = useState('');
    const [groupId, setGroupId] = useState(0);
    const [selected, setSelected] = useState<number[]>([]);
    const [createOpen, setCreateOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<WebsiteRes | null>(null);

    const groupsQuery = useListWebsiteGroupsQuery('website');
    const groups = groupsQuery.data ?? [];

    useEffect(() => {
        setPage(1);
    }, [name, type, groupId]);

    const listQuery = useSearchWebsitesQuery({
        page,
        pageSize,
        name,
        type,
        websiteGroupId: groupId,
        orderBy: 'createdAt',
        order: 'null',
    });
    const rows = listQuery.data?.items ?? [];

    const [operate, { isLoading: operating }] = useOperateWebsiteMutation();
    const [remove] = useDeleteWebsiteMutation();

    const doOperate = async (row: WebsiteRes, op: string) => {
        try {
            await operate({ id: row.id, operate: op }).unwrap();
            Toast.success(t('website.batch.success'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doBatchOperate = async (op: string) => {
        if (!selected.length) return;
        try {
            await Promise.all(selected.map((id) => operate({ id, operate: op }).unwrap()));
            Toast.success(t('website.batch.success'));
            setSelected([]);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doBatchDelete = () => {
        if (!selected.length) return;
        Modal.confirm({
            title: t('website.actions.delete'),
            content: t('website.batch.deleteContent', { count: selected.length }),
            okButtonProps: { type: 'danger' },
            onOk: async () => {
                try {
                    await Promise.all(selected.map((id) => remove({ id, deleteApp: false, deleteBackup: false, forceDelete: true, deleteDB: false }).unwrap()));
                    Toast.success(t('website.batch.success'));
                    setSelected([]);
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        {
            title: t('website.table.domain'),
            dataIndex: 'primaryDomain',
            key: 'primaryDomain',
            render: (v: string, row: WebsiteRes) => (
                <Button theme="borderless" size="small" style={{ padding: 0 }} onClick={() => navigate(`/websites/${row.id}`)}>
                    {v}
                </Button>
            ),
        },
        {
            title: t('website.table.type'),
            dataIndex: 'type',
            key: 'type',
            width: 160,
            render: (v: string, row: WebsiteRes) => (
                <Text size="small">
                    {t(`website.type.${v}`)}
                    {row.appName ? ` · ${row.appName}` : ''}
                    {row.runtimeName ? ` · ${row.runtimeName}` : ''}
                </Text>
            ),
        },
        {
            title: t('website.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (v: string) => <Tag color={statusColor(v)}>{t(`website.status.${v.toLowerCase()}`)}</Tag>,
        },
        { title: t('website.table.sitePath'), dataIndex: 'sitePath', key: 'sitePath', width: 180, render: (v: string) => v || '-' },
        { title: t('website.table.expireDate'), dataIndex: 'expireDate', key: 'expireDate', width: 160, render: (v: string) => v || '-' },
        { title: t('website.table.remark'), dataIndex: 'remark', key: 'remark', width: 140, render: (v: string) => v || '-' },
        {
            title: t('website.table.operate'),
            key: 'operate',
            width: 180,
            render: (_: unknown, row: WebsiteRes) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    {row.status === 'Running' ? (
                        <Button size="small" theme="borderless" loading={operating} onClick={() => doOperate(row, 'stop')}>
                            {t('website.actions.stop')}
                        </Button>
                    ) : (
                        <Button size="small" theme="borderless" loading={operating} onClick={() => doOperate(row, 'start')}>
                            {t('website.actions.start')}
                        </Button>
                    )}
                    <Button size="small" theme="borderless" onClick={() => navigate(`/websites/${row.id}`)}>
                        {t('website.actions.config')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteTarget(row)}>
                        {t('website.actions.delete')}
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Input placeholder={t('common.search')} value={nameInput} onChange={setNameInput} style={{ width: 220 }} showClear />
                <Select
                    value={type}
                    onChange={(v) => setType((v as string) ?? '')}
                    style={{ width: 160 }}
                    optionList={[{ label: t('common.empty'), value: '' }, ...TYPES.map((v) => ({ label: t(`website.type.${v}`), value: v }))]}
                />
                <Select
                    value={groupId}
                    onChange={(v) => setGroupId((v as number) ?? 0)}
                    style={{ width: 160 }}
                    optionList={[{ label: t('common.empty'), value: 0 }, ...groups.map((g) => ({ label: g.name, value: g.id }))]}
                />
                <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>
                    {t('website.actions.refresh')}
                </Button>
                <Button type="primary" icon={<IconPlus />} onClick={() => setCreateOpen(true)}>
                    {t('website.actions.create')}
                </Button>
                <Button onClick={() => navigate('/openresty')}>{t('openresty.entrance')}</Button>
                {selected.length > 0 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Button onClick={() => doBatchOperate('start')}>{t('website.actions.start')}</Button>
                        <Button onClick={() => doBatchOperate('stop')}>{t('website.actions.stop')}</Button>
                        <Button type="danger" onClick={doBatchDelete}>{t('website.actions.delete')}</Button>
                    </div>
                )}
            </div>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={listQuery.isLoading}
                rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected((keys ?? []) as number[]) }}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: listQuery.data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                    pageSizeOpts: [10, 20, 50, 100],
                }}
                empty={<Text type="tertiary">{t('common.empty')}</Text>}
            />

            {createOpen && (
                <CreateWebsiteModal groups={groups.length ? groups : [{ id: 1, name: 'Default', type: 'website' }]} onClose={() => setCreateOpen(false)} />
            )}
            {deleteTarget && <DeleteWebsiteModal target={deleteTarget} onClose={() => setDeleteTarget(null)} />}
        </div>
    );
}
