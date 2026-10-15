import { newInstallTaskID } from './InstallModal';
import EvidenceSheet from './EvidenceSheet';
import { useAppSelector } from '@/store/hooks';
import { useEffect, useState } from 'react';
import {
    Banner,
    Button,
    Input,
    Modal,
    Radio,
    RadioGroup,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    getAppIconUrl,
    useCancelIgnoreAppUpgradeMutation,
    useDeleteCheckQuery,
    useGetInstallParamsQuery,
    useGetUpdateVersionsMutation,
    useIgnoreAppUpgradeMutation,
    useInstalledOpMutation,
    useListIgnoredAppsQuery,
    useSearchInstalledQuery,
    useUpdateAppConfigMutation,
    useUpdateInstallParamsMutation,
    useUpdateInstalledSortMutation,
    type AppInstallDto,
    type AppVersion,
    type IgnoredApp,
} from '@/api/appApi';
import { useDebouncedValue } from '@/pages/database/shared';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);
const uuid = newInstallTaskID;

function statusKey(status: string) {
    const map: Record<string, string> = {
        running: 'running',
        stopped: 'stopped',
        installing: 'installing',
        uninstalling: 'uninstalling',
        upgrading: 'upgrading',
        rebuilding: 'rebuilding',
        error: 'error',
        downloaderr: 'downloadErr',
        starting: 'starting',
    };
    return map[status.toLowerCase()] ?? 'other';
}

function statusColor(status: string) {
    switch (status) {
        case 'Running':
            return 'green';
        case 'Error':
        case 'DownloadErr':
            return 'red';
        case 'Stopped':
            return 'grey';
        default:
            return 'blue';
    }
}

function UninstallModal({ row, onClose }: { row: AppInstallDto; onClose: () => void }) {
    const { t } = useTranslation();
    const { data: resources = [], isLoading } = useDeleteCheckQuery(row.id);
    const [op, { isLoading: submitting }] = useInstalledOpMutation();
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);
    const [deleteDB, setDeleteDb] = useState(false);
    const [deleteImage, setDeleteImage] = useState(false);

    const submit = async () => {
        try {
            await op({ installId: row.id, operate: 'delete', forceDelete, deleteBackup, deleteDB, deleteImage, taskID: uuid() }).unwrap();
            Toast.success(t('apps.uninstall.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('apps.uninstall.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            okButtonProps={{ type: 'danger' }}
            confirmLoading={submitting}
            width={480}
        >
            <Text>{t('apps.uninstall.content', { name: row.name })}</Text>
            {isLoading ? <Spin /> : resources.length > 0 ? (
                <div style={{ marginTop: 10 }}>
                    <Text size="small" type="tertiary">{t('apps.uninstall.resource')}</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {resources.map((r) => <Tag key={`${r.type}-${r.name}`} color="orange">{r.type}: {r.name}</Tag>)}
                    </div>
                </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                <SwitchLine checked={forceDelete} onChange={setForceDelete} label={t('apps.uninstall.force')} />
                <SwitchLine checked={deleteBackup} onChange={setDeleteBackup} label={t('apps.uninstall.deleteBackup')} />
                <SwitchLine checked={deleteDB} onChange={setDeleteDb} label={t('apps.uninstall.deleteDB')} />
                <SwitchLine checked={deleteImage} onChange={setDeleteImage} label={t('apps.uninstall.deleteImage')} />
            </div>
        </Modal>
    );
}

function SwitchLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <Text size="small">{label}</Text>
        </label>
    );
}

function UpgradeModal({ row, onClose }: { row: AppInstallDto; onClose: () => void }) {
    const { t } = useTranslation();
    const [fetchVersions, { isLoading: loadingVersions }] = useGetUpdateVersionsMutation();
    const [op, { isLoading }] = useInstalledOpMutation();
    const [versions, setVersions] = useState<AppVersion[]>([]);
    const [detailId, setDetailId] = useState<number | undefined>();
    const [backup, setBackup] = useState(true);
    const [pullImage, setPullImage] = useState(true);

    useEffect(() => {
        fetchVersions({ appInstallID: row.id })
            .unwrap()
            .then((res) => {
                const list = Array.isArray(res) ? res : [];
                setVersions(list);
                if (list.length) setDetailId(list[0].detailId);
            })
            .catch(() => setVersions([]));
    }, [row.id, fetchVersions]);

    const submit = async () => {
        try {
            await op({ installId: row.id, operate: 'upgrade', detailId, backup, pullImage, taskID: uuid() }).unwrap();
            Toast.success(t('apps.upgrade.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('apps.upgrade.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={460}
        >
            <Text>{t('apps.upgrade.content')}</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {loadingVersions ? (
                    <Spin />
                ) : (
                    <Select
                        value={detailId}
                        onChange={(v) => setDetailId(v as number)}
                        style={{ width: '100%' }}
                        placeholder={t('apps.upgrade.version')}
                        optionList={versions.map((v) => ({ label: v.version, value: v.detailId }))}
                    />
                )}
                <SwitchLine checked={backup} onChange={setBackup} label={t('apps.upgrade.backup')} />
                <SwitchLine checked={pullImage} onChange={setPullImage} label={t('apps.upgrade.pullImage')} />
            </div>
        </Modal>
    );
}

function ParamsModal({ row, onClose }: { row: AppInstallDto; onClose: () => void }) {
    const { t } = useTranslation();
    const { data: config, isLoading } = useGetInstallParamsQuery(row.id);
    const [saveParams, { isLoading: saving }] = useUpdateInstallParamsMutation();
    const [saveConfig] = useUpdateAppConfigMutation();
    const [edit, setEdit] = useState(false);
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [webUI, setWebUI] = useState('');

    useEffect(() => {
        if (!config) return;
        const next: Record<string, unknown> = {};
        config.params.forEach((p) => {
            next[p.key] = p.type === 'number' ? Number(p.value) : p.value;
        });
        setValues(next);
        setWebUI(config.webUI || '');
    }, [config]);

    const submit = async () => {
        try {
            await saveParams({ installId: row.id, params: values }).unwrap();
            if (config && webUI !== config.webUI) {
                await saveConfig({ installID: row.id, webUI }).unwrap();
            }
            Toast.success(t('apps.params.success'));
            setEdit(false);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('apps.params.title')}
            visible
            onCancel={onClose}
            onOk={edit ? submit : () => setEdit(true)}
            okText={edit ? t('common.confirm') : t('apps.params.edit')}
            cancelText={t('common.cancel')}
            confirmLoading={saving}
            width={520}
        >
            {isLoading || !config ? (
                <Spin />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Text size="small" type="tertiary">{t('apps.params.webUI')}</Text>
                        {edit ? <Input value={webUI} onChange={setWebUI} /> : <Text>{config.webUI || '-'}</Text>}
                    </div>
                    {config.params.length === 0 ? (
                        <Text type="tertiary" size="small">{t('apps.params.empty')}</Text>
                    ) : (
                        config.params.map((p) => (
                            <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <Text size="small" type="tertiary">{p.labelZh || p.key}</Text>
                                {!edit ? (
                                    <Text>{p.type === 'password' ? '********' : String(p.showValue && p.showValue !== '' ? p.showValue : p.value ?? '-')}</Text>
                                ) : p.values && p.values.length > 0 ? (
                                    <Select
                                        value={values[p.key] as string}
                                        onChange={(v) => setValues((s) => ({ ...s, [p.key]: v }))}
                                        style={{ width: '100%' }}
                                        optionList={p.values.map((o) => ({ label: o.label, value: o.value }))}
                                    />
                                ) : (
                                    <Input
                                        type={p.type === 'number' ? 'number' : p.type === 'password' ? 'password' : 'text'}
                                        disabled={!p.edit}
                                        value={values[p.key] === undefined || values[p.key] === null ? '' : String(values[p.key])}
                                        onChange={(v) => setValues((s) => ({ ...s, [p.key]: p.type === 'number' ? Number(v) : v }))}
                                    />
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </Modal>
    );
}

function IgnoreModal({ row, onClose, onSaved }: { row: AppInstallDto; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const [fetchVersions, { isLoading: loadingVersions }] = useGetUpdateVersionsMutation();
    const [ignore, { isLoading }] = useIgnoreAppUpgradeMutation();
    const [versions, setVersions] = useState<AppVersion[]>([]);
    const [scope, setScope] = useState<'all' | 'version'>('all');
    const [detailId, setDetailId] = useState<number | undefined>();

    useEffect(() => {
        fetchVersions({ appInstallID: row.id })
            .unwrap()
            .then((res) => {
                const list = Array.isArray(res) ? res : [];
                setVersions(list);
                if (list.length) setDetailId(list[0].detailId);
            })
            .catch(() => setVersions([]));
    }, [row.id, fetchVersions]);

    const submit = async () => {
        try {
            await ignore({
                appID: row.appID,
                appDetailID: scope === 'version' ? detailId : undefined,
                scope,
            }).unwrap();
            Toast.success(t('apps.ignore.success'));
            onSaved();
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('apps.ignore.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={460}
        >
            <Text>{t('apps.ignore.content', { name: row.name })}</Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                <RadioGroup
                    value={scope}
                    direction="horizontal"
                    onChange={(e) => setScope(e.target.value as 'all' | 'version')}
                >
                    <Radio value="all">{t('apps.ignore.all')}</Radio>
                    <Radio value="version">{t('apps.ignore.version')}</Radio>
                </RadioGroup>
                {scope === 'version' &&
                    (loadingVersions ? (
                        <Spin />
                    ) : (
                        <Select
                            value={detailId}
                            onChange={(v) => setDetailId(v as number)}
                            style={{ width: '100%' }}
                            placeholder={t('apps.ignore.versionSelect')}
                            optionList={versions.map((v) => ({ label: v.version, value: v.detailId }))}
                        />
                    ))}
            </div>
        </Modal>
    );
}

function IgnoredListModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const { data = [], isFetching, refetch } = useListIgnoredAppsQuery();
    const [cancel, { isLoading }] = useCancelIgnoreAppUpgradeMutation();

    const columns = [
        { title: t('apps.ignoreList.name'), dataIndex: 'name', key: 'name' },
        {
            title: t('apps.ignoreList.scope'),
            key: 'scope',
            render: (_: unknown, row: IgnoredApp) =>
                row.scope === 'version' ? <Tag>{row.version}</Tag> : <Tag>{t('apps.ignoreList.allVersion')}</Tag>,
        },
        {
            title: t('apps.ignoreList.operate'),
            key: 'operate',
            width: 120,
            render: (_: unknown, row: IgnoredApp) => (
                <Button
                    size="small"
                    theme="borderless"
                    loading={isLoading}
                    onClick={async () => {
                        try {
                            await cancel({ id: row.ID }).unwrap();
                            Toast.success(t('apps.ignoreList.canceled'));
                            refetch();
                        } catch (e) {
                            Toast.error(errText(e));
                        }
                    }}
                >
                    {t('apps.ignoreList.cancel')}
                </Button>
            ),
        },
    ];

    return (
        <Modal
            title={t('apps.ignoreList.title')}
            visible
            onCancel={onClose}
            footer={<Button onClick={onClose}>{t('common.close')}</Button>}
            width={640}
        >
            <Table
                columns={columns}
                dataSource={data}
                loading={isFetching}
                pagination={false}
                rowKey="ID"
                empty={<Text type="tertiary">{t('apps.ignoreList.empty')}</Text>}
            />
        </Modal>
    );
}

function SortModal({ rows, onClose }: { rows: AppInstallDto[]; onClose: () => void }) {
    const { t } = useTranslation();
    const [list, setList] = useState(() => rows.map((r) => ({ id: r.id, name: r.name })));
    const [save, { isLoading }] = useUpdateInstalledSortMutation();

    const move = (index: number, dir: -1 | 1) => {
        setList((s) => {
            const next = [...s];
            const target = index + dir;
            if (target < 0 || target >= next.length) return s;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const submit = async () => {
        try {
            await save({ items: list.map((r, i) => ({ installID: r.id, sortOrder: i })) }).unwrap();
            Toast.success(t('apps.sort.success'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={t('apps.sort.title')}
            visible
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            width={520}
        >
            <Text size="small" type="tertiary">
                {t('apps.sort.hint')}
            </Text>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {list.map((r, i) => (
                    <div
                        key={r.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            border: '1px solid var(--semi-color-border)',
                            borderRadius: 6,
                        }}
                    >
                        <Text>{r.name}</Text>
                        <Space spacing={4}>
                            <Button size="small" theme="borderless" disabled={i === 0} onClick={() => move(i, -1)}>
                                ↑
                            </Button>
                            <Button
                                size="small"
                                theme="borderless"
                                disabled={i === list.length - 1}
                                onClick={() => move(i, 1)}
                            >
                                ↓
                            </Button>
                        </Space>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

export default function InstalledTab({ upgradeOnly = false }: { upgradeOnly?: boolean }) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const [evidenceId, setEvidenceId] = useState<number | null>(null);
    const [uninstallRow, setUninstallRow] = useState<AppInstallDto | null>(null);
    const [upgradeRow, setUpgradeRow] = useState<AppInstallDto | null>(null);
    const [paramsRow, setParamsRow] = useState<AppInstallDto | null>(null);
    const [ignoreRow, setIgnoreRow] = useState<AppInstallDto | null>(null);
    const [ignoredOpen, setIgnoredOpen] = useState(false);
    const [sortOpen, setSortOpen] = useState(false);

    useEffect(() => {
        setPage(1);
    }, [name]);

    const listQuery = useSearchInstalledQuery({ page, pageSize, name, tags: [], update: upgradeOnly, sync: false });
    const rows = listQuery.currentData?.items ?? [];
    const [op, { isLoading: operating }] = useInstalledOpMutation();

    const doOperate = (row: AppInstallDto, operate: string) => {
        if (row.status.toUpperCase() === 'UNKNOWN') return Toast.warning('先核对未知安装状态 / Review UNKNOWN installation first');
        const label = operate === 'delete' ? 'uninstall' : operate;
        Modal.confirm({
            title: t(`apps.actions.${label}` as never),
            content: t('apps.operateConfirm', { name: row.name, operate: t(`apps.actions.${label}` as never) }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),

            onOk: async () => {
                try {
                    await op({ installId: row.id, operate, taskID: uuid() }).unwrap();
                    Toast.success(t('apps.install.success'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const columns = [
        {
            title: t('apps.table.name'),
            dataIndex: 'name',
            key: 'name',
            render: (v: string, row: AppInstallDto) => (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <img src={getAppIconUrl(row.appKey)} alt={row.appName} style={{ width: 24, height: 24, objectFit: 'contain' }} />
                    <Text>{v}</Text>
                </div>
            ),
        },
        { title: t('apps.table.version'), dataIndex: 'version', key: 'version', width: 110, render: (v: string) => v || '-' },
        {
            title: t('apps.table.status'),
            dataIndex: 'status',
            key: 'status',
            width: 120,
            render: (v: string) => <Tag color={v.toUpperCase() === 'UNKNOWN' ? 'orange' : statusColor(v)}>{v.toUpperCase() === 'UNKNOWN' ? 'UNKNOWN' : t(`apps.status.${statusKey(v)}`)}</Tag>,
        },
        { title: t('apps.table.webUI'), dataIndex: 'httpPort', key: 'httpPort', width: 110, render: (v: number) => (v ? String(v) : '-') },
        { title: t('apps.table.path'), dataIndex: 'path', key: 'path', width: 200, render: (v: string) => v || '-' },
        {
            title: t('apps.table.operate'),
            key: 'operate',
            width: 320,
            render: (_: unknown, row: AppInstallDto) => (
                <Space spacing={2} wrap>
                    <Button size="small" theme="borderless" disabled={node !== 'local'} onClick={() => setEvidenceId(row.id)}>证据 / Evidence</Button>
                    {row.status.toUpperCase() === 'UNKNOWN' ? <Text type="warning">UNKNOWN · 请人工核对 / Manual review required</Text> : <>
                    <Button size="small" theme="borderless" loading={operating} onClick={() => doOperate(row, 'start')}>{t('apps.actions.start')}</Button>
                    <Button size="small" theme="borderless" loading={operating} onClick={() => doOperate(row, 'stop')}>{t('apps.actions.stop')}</Button>
                    <Button size="small" theme="borderless" loading={operating} onClick={() => doOperate(row, 'restart')}>{t('apps.actions.restart')}</Button>
                    <Button size="small" theme="borderless" loading={operating} onClick={() => doOperate(row, 'rebuild')}>{t('apps.actions.rebuild')}</Button>
                    <Button size="small" theme="borderless" onClick={() => setParamsRow(row)}>{t('apps.actions.params')}</Button>
                    {!upgradeOnly && (
                        <Button size="small" theme="borderless" onClick={() => setUpgradeRow(row)}>{t('apps.actions.upgrade')}</Button>
                    )}
                    {upgradeOnly && (
                        <Button size="small" theme="borderless" onClick={() => setIgnoreRow(row)}>{t('apps.actions.ignore')}</Button>
                    )}
                    <Button size="small" type="danger" theme="borderless" onClick={() => setUninstallRow(row)}>
                        {t('apps.actions.uninstall')}
                    </Button>
                </>}
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space wrap>
                <Input placeholder={t('apps.store.searchPlaceholder')} value={nameInput} onChange={setNameInput} style={{ width: 220 }} showClear />
                <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>
                    {t('apps.actions.refresh')}
                </Button>
                {upgradeOnly && (
                    <Button onClick={() => setIgnoredOpen(true)}>{t('apps.actions.ignoredList')}</Button>
                )}
                {!upgradeOnly && <Button onClick={() => setSortOpen(true)}>{t('apps.actions.sort')}</Button>}
            </Space>

            {listQuery.isError ? <Banner type="danger" description="列表加载失败，请重试 / List failed; retry" /> : null}
            <Table
                rowKey="id"
                columns={columns}
                dataSource={rows}
                loading={listQuery.isLoading || operating}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: listQuery.data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                    pageSizeOpts: [10, 20, 50],
                }}
                empty={<Text type="tertiary">{t('apps.installed.empty')}</Text>}
            />

            {evidenceId !== null && <EvidenceSheet key={`${node}:${evidenceId}`} id={evidenceId} onClose={() => setEvidenceId(null)} />}
            {uninstallRow && <UninstallModal row={uninstallRow} onClose={() => setUninstallRow(null)} />}
            {upgradeRow && <UpgradeModal row={upgradeRow} onClose={() => setUpgradeRow(null)} />}
            {paramsRow && <ParamsModal row={paramsRow} onClose={() => setParamsRow(null)} />}
            {ignoreRow && (
                <IgnoreModal row={ignoreRow} onClose={() => setIgnoreRow(null)} onSaved={() => listQuery.refetch()} />
            )}
            {ignoredOpen && <IgnoredListModal onClose={() => setIgnoredOpen(false)} />}
            {sortOpen && (
                <SortModal
                    rows={rows}
                    onClose={() => {
                        setSortOpen(false);
                        listQuery.refetch();
                    }}
                />
            )}
        </div>
    );
}
