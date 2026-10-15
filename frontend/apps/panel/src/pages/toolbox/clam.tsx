import { useMemo, useState } from 'react';
import {
    Button,
    Checkbox,
    Input,
    InputNumber,
    Modal,
    Select,
    SideSheet,
    Space,
    Switch,
    Table,
    Tag,
    TextArea,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { IconFile, IconPlus, IconRefresh, IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateClamMutation,
    useDeleteClamMutation,
    useGetClamBaseQuery,
    useHandleClamScanMutation,
    useLazySearchClamFileQuery,
    useSearchClamQuery,
    useSearchClamRecordQuery,
    useUpdateClamBaseInfoMutation,
    useUpdateClamFileMutation,
    useUpdateClamMutation,
    useUpdateClamStatusMutation,
    type ClamInfo,
    type ClamRecord,
} from '@/api/toolboxApi';
import { useDebouncedValue } from '@/pages/database/shared';
import { defaultSpecObj, specToText, transObjToSpec, transSpecToObj, weekLabel, weekOptions } from '@/pages/cronjob/helper';
import { ConfigEditorModal, Field, errText } from './shared';

const { Text } = Typography;

const specTypeOptions = ['perMonth', 'perWeek', 'perDay', 'perHour', 'perNDay', 'perNHour', 'perNMinute', 'perNSecond'];
const INFECTED_STRATEGIES = ['none', 'move', 'copy'];

function SpecEditor({ value, onChange }: { value: { specType: string; week: number; day: number; hour: number; minute: number; second: number }; onChange: (v: ReturnType<typeof defaultSpecObj>) => void }) {
    const { t } = useTranslation();
    const type = value.specType;
    const patch = (p: Partial<typeof value>) => onChange({ ...value, ...p });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Select
                value={type}
                onChange={(v) => onChange(defaultSpecObj(String(v)))}
                style={{ width: '100%' }}
                optionList={specTypeOptions.map((s) => ({ label: t('cronjob.' + s), value: s }))}
            />
            <Space wrap>
                {type === 'perWeek' && (
                    <Select
                        value={value.week}
                        onChange={(v) => patch({ week: Number(v) })}
                        style={{ width: 140 }}
                        optionList={weekOptions.map((w) => ({ label: weekLabel(t, w), value: w }))}
                    />
                )}
                {['perMonth', 'perWeek', 'perNDay'].includes(type) && (
                    <InputNumber value={value.day} min={1} max={31} onNumberChange={(v) => patch({ day: Number(v) || 1 })} addonAfter={t('cronjob.day')} style={{ width: 160 }} />
                )}
                {['perMonth', 'perWeek', 'perDay', 'perNDay', 'perNHour'].includes(type) && (
                    <InputNumber value={value.hour} min={0} max={23} onNumberChange={(v) => patch({ hour: Number(v) || 0 })} addonAfter={t('cronjob.hour')} style={{ width: 160 }} />
                )}
                {type !== 'perNSecond' && (
                    <InputNumber value={value.minute} min={0} max={59} onNumberChange={(v) => patch({ minute: Number(v) || 0 })} addonAfter={t('cronjob.minute')} style={{ width: 160 }} />
                )}
                {type === 'perNSecond' && (
                    <InputNumber value={value.second} min={1} max={59} onNumberChange={(v) => patch({ second: Number(v) || 1 })} addonAfter={t('cronjob.second')} style={{ width: 160 }} />
                )}
            </Space>
        </div>
    );
}

function ClamFormModal({ target, onClose, onSaved }: { target: ClamInfo | null; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation();
    const isEdit = !!target;
    const [name, setName] = useState(target?.name ?? '');
    const [path, setPath] = useState(target?.path ?? '/');
    const [strategy, setStrategy] = useState(target?.infectedStrategy ?? 'none');
    const [infectedDir, setInfectedDir] = useState(target?.infectedDir ?? '/');
    const [specObj, setSpecObj] = useState(() => transSpecToObj(target?.spec ?? '') ?? defaultSpecObj('perDay'));
    const timeoutInit = useMemo(() => {
        const sec = Number(target?.timeout ?? 1800);
        if (sec % 3600 === 0) return { v: sec / 3600, u: 'h' };
        if (sec % 60 === 0) return { v: sec / 60, u: 'm' };
        return { v: sec, u: 's' };
    }, [target]);
    const [timeoutValue, setTimeoutValue] = useState(timeoutInit.v);
    const [timeoutUnit, setTimeoutUnit] = useState(timeoutInit.u);
    const [description, setDescription] = useState(target?.description ?? '');
    const [create, { isLoading: creating }] = useCreateClamMutation();
    const [update, { isLoading: updating }] = useUpdateClamMutation();

    const save = async () => {
        if (!name.trim()) {
            Toast.error(t('toolbox.clam.nameRequired'));
            return;
        }
        if (!path.trim()) {
            Toast.error(t('toolbox.clam.pathRequired'));
            return;
        }
        if (strategy !== 'none' && !infectedDir.trim()) {
            Toast.error(t('toolbox.clam.infectedDirRequired'));
            return;
        }
        const spec = transObjToSpec(specObj.specType, specObj.week, specObj.day, specObj.hour, specObj.minute, specObj.second);
        const timeout = Math.round(timeoutValue * (timeoutUnit === 'h' ? 3600 : timeoutUnit === 'm' ? 60 : 1));
        try {
            if (isEdit && target) {
                await update({ id: target.id, name, path, infectedStrategy: strategy, infectedDir, spec, timeout, description }).unwrap();
            } else {
                await create({ name, status: 'Enable', path, infectedStrategy: strategy, infectedDir, spec, timeout, description }).unwrap();
            }
            Toast.success(t('toolbox.clam.saved'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Modal
            title={isEdit ? t('toolbox.clam.edit') : t('toolbox.clam.create')}
            visible
            width={620}
            confirmLoading={creating || updating}
            okText={t('toolbox.actions.save')}
            cancelText={t('common.cancel')}
            onOk={save}
            onCancel={onClose}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label={t('toolbox.clam.name')}>
                    <Input value={name} onChange={setName} />
                </Field>
                <Field label={t('toolbox.clam.scanDir')}>
                    <Input value={path} onChange={setPath} />
                </Field>
                <Field label={t('toolbox.clam.infectedStrategy')}>
                    <Select
                        value={strategy}
                        onChange={(v) => setStrategy(String(v))}
                        style={{ width: '100%' }}
                        optionList={INFECTED_STRATEGIES.map((s) => ({ label: t('toolbox.clam.' + s), value: s }))}
                    />
                </Field>
                {strategy !== 'none' && (
                    <Field label={t('toolbox.clam.infectedDir')}>
                        <Input value={infectedDir} onChange={setInfectedDir} />
                    </Field>
                )}
                <Field label={t('toolbox.clam.spec')}>
                    <SpecEditor value={specObj} onChange={setSpecObj} />
                </Field>
                <Field label={t('toolbox.clam.timeout')}>
                    <Space>
                        <InputNumber value={timeoutValue} min={1} onNumberChange={(v) => setTimeoutValue(Number(v) || 1)} style={{ width: 160 }} />
                        <Select
                            value={timeoutUnit}
                            onChange={(v) => setTimeoutUnit(String(v))}
                            style={{ width: 120 }}
                            optionList={[
                                { label: t('toolbox.fail2ban.unitSecond'), value: 's' },
                                { label: t('toolbox.fail2ban.unitMinute'), value: 'm' },
                                { label: t('toolbox.fail2ban.unitHour'), value: 'h' },
                            ]}
                        />
                    </Space>
                </Field>
                <Field label={t('toolbox.clam.description')}>
                    <TextArea value={description} onChange={setDescription} autosize={{ minRows: 3 }} />
                </Field>
            </div>
        </Modal>
    );
}

function ClamRecordSheet({ target, onClose }: { target: ClamInfo; onClose: () => void }) {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [status, setStatus] = useState('');
    const [current, setCurrent] = useState<ClamRecord | null>(null);
    const { data, isFetching } = useSearchClamRecordQuery({ page, pageSize, clamID: target.id, status });

    const columns = [
        {
            title: t('toolbox.clam.startTime'),
            key: 'scanDate',
            render: (_: unknown, row: ClamRecord) => <Text>{row.scanDate || row.startTime}</Text>,
        },
        {
            title: t('toolbox.clam.status'),
            dataIndex: 'status',
            key: 'status',
            render: (v: string) => <Tag size="small" color={v === 'Done' ? 'green' : v === 'Failed' ? 'red' : 'blue'}>{v}</Tag>,
        },
    ];

    return (
        <SideSheet title={`${t('toolbox.clam.recordTitle')} - ${target.name}`} visible onCancel={onClose} width={920}>
            <Space style={{ marginBottom: 12 }}>
                <Select
                    value={status}
                    onChange={(v) => {
                        setStatus(String(v ?? ''));
                        setPage(1);
                    }}
                    style={{ width: 160 }}
                    showClear
                    placeholder={t('toolbox.clam.statusFilter')}
                    optionList={[
                        { label: 'Done', value: 'Done' },
                        { label: 'Waiting', value: 'Waiting' },
                        { label: 'Failed', value: 'Failed' },
                    ]}
                />
            </Space>
            <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ width: 420 }}>
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={data?.items ?? []}
                        loading={isFetching}
                        onRow={(row) => ({ onClick: () => setCurrent(row as ClamRecord) })}
                        pagination={{
                            currentPage: page,
                            pageSize,
                            total: data?.total ?? 0,
                            onPageChange: setPage,
                            onPageSizeChange: (s: number) => {
                                setPageSize(s);
                                setPage(1);
                            },
                        }}
                        empty={<Text type="tertiary">{t('toolbox.clam.recordEmpty')}</Text>}
                    />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    {current ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Text strong>{t('toolbox.clam.detail')}</Text>
                            <div>
                                <Text type="tertiary">{t('toolbox.clam.startTime')}: </Text>
                                <Text>{current.startTime}</Text>
                            </div>
                            <div>
                                <Text type="tertiary">{t('toolbox.clam.scanTime')}: </Text>
                                <Text>{current.status === 'Done' ? current.scanTime : '-'}</Text>
                            </div>
                            <div>
                                <Text type="tertiary">{t('toolbox.clam.infectedFiles')}: </Text>
                                <Text>{current.infectedFiles || '0'}</Text>
                            </div>
                            <div>
                                <Text type="tertiary">{t('toolbox.clam.totalError')}: </Text>
                                <Text>{current.totalError || '0'}</Text>
                            </div>
                            {current.message ? <Text type="danger">{current.message}</Text> : null}
                        </div>
                    ) : (
                        <Text type="tertiary">{t('toolbox.clam.selectHint')}</Text>
                    )}
                </div>
            </div>
        </SideSheet>
    );
}

/** ClamAV / FreshClam 原始配置文件与日志（旧版为 CodeMirror + 日志页签）。 */
function ClamConfigModal({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const [loadFile] = useLazySearchClamFileQuery();
    const [updateFile] = useUpdateClamFileMutation();
    return (
        <ConfigEditorModal
            title={t('toolbox.config.clam')}
            onClose={onClose}
            tabs={[
                {
                    key: 'clamd',
                    label: 'clamd.conf',
                    load: () => loadFile({ name: 'clamd', tail: '200' }).unwrap(),
                    save: (file) => updateFile({ name: 'clamd', file }).unwrap(),
                },
                {
                    key: 'freshclam',
                    label: 'freshclam.conf',
                    load: () => loadFile({ name: 'freshclam', tail: '200' }).unwrap(),
                    save: (file) => updateFile({ name: 'freshclam', file }).unwrap(),
                },
                {
                    key: 'clamd-log',
                    label: t('toolbox.config.clamdLog'),
                    readOnly: true,
                    load: () => loadFile({ name: 'clamd-log', tail: '200' }).unwrap(),
                },
                {
                    key: 'freshclam-log',
                    label: t('toolbox.config.freshclamLog'),
                    load: () => loadFile({ name: 'freshclam-log', tail: '200' }).unwrap(),
                    readOnly: true,
                },
            ]}
        />
    );
}

export default function ClamTab() {
    const { t } = useTranslation();
    const { data: base, isFetching: baseFetching, refetch: refetchBase } = useGetClamBaseQuery();
    const [operateBase] = useUpdateClamBaseInfoMutation();
    const [handleScan] = useHandleClamScanMutation();
    const [updateStatus] = useUpdateClamStatusMutation();
    const [deleteClam, { isLoading: deleting }] = useDeleteClamMutation();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [searchInput, setSearchInput] = useState('');
    const info = useDebouncedValue(searchInput);
    const [selected, setSelected] = useState<number[]>([]);
    const [formTarget, setFormTarget] = useState<ClamInfo | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [recordTarget, setRecordTarget] = useState<ClamInfo | null>(null);
    const [deleteRows, setDeleteRows] = useState<ClamInfo[] | null>(null);
    const [removeInfected, setRemoveInfected] = useState(false);
    const [confOpen, setConfOpen] = useState(false);

    const { data, isFetching, refetch } = useSearchClamQuery({ page, pageSize, info });

    if (!base) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{baseFetching ? t('common.loading') : t('common.empty')}</Text>
            </div>
        );
    }

    if (!base.isExist) {
        return (
            <div style={{ padding: 24 }}>
                <Text type="tertiary">{t('toolbox.clam.notInstalled')}</Text>
            </div>
        );
    }

    const onOperateBase = (service: 'ClamAV' | 'FreshClam', op: 'start' | 'stop' | 'restart') => {
        const operation = service === 'FreshClam' ? `fresh-${op}` : op;
        Modal.confirm({
            title: `${service} ${op}`,
            content: t('toolbox.fail2ban.operationConfirm', { op: `${service} ${op}` }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await operateBase({ operation }).unwrap();
                    Toast.success(t('toolbox.clam.statusChanged'));
                    refetchBase();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const toggleStatus = async (row: ClamInfo) => {
        try {
            await updateStatus({ id: row.id, status: row.status === 'Enable' ? 'Disable' : 'Enable' }).unwrap();
            Toast.success(t('toolbox.clam.statusChanged'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onRun = async (row: ClamInfo) => {
        try {
            await handleScan(row.id).unwrap();
            Toast.success(t('toolbox.clam.started'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doDelete = async () => {
        if (!deleteRows) return;
        try {
            await deleteClam({ ids: deleteRows.map((r) => r.id), removeInfected }).unwrap();
            Toast.success(t('toolbox.clam.deleted'));
            setDeleteRows(null);
            setSelected([]);
            setRemoveInfected(false);
            refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        {
            title: t('toolbox.clam.name'),
            dataIndex: 'name',
            key: 'name',
            render: (v: string, row: ClamInfo) => (
                <Button theme="borderless" type="primary" onClick={() => setRecordTarget(row)}>
                    {v}
                </Button>
            ),
        },
        { title: t('toolbox.clam.scanDir'), dataIndex: 'path', key: 'path' },
        {
            title: t('toolbox.clam.status'),
            key: 'status',
            width: 100,
            render: (_: unknown, row: ClamInfo) => <Switch size="small" checked={row.status === 'Enable'} onChange={() => toggleStatus(row)} />,
        },
        {
            title: t('toolbox.clam.spec'),
            key: 'spec',
            render: (_: unknown, row: ClamInfo) => <Text>{row.spec ? specToText(t, row.spec) : '-'}</Text>,
        },
        {
            title: t('toolbox.clam.lastTime'),
            key: 'lastRecordTime',
            render: (_: unknown, row: ClamInfo) => <Text>{row.lastRecordTime || '-'}</Text>,
        },
        { title: t('toolbox.clam.description'), dataIndex: 'description', key: 'description' },
        {
            title: '',
            key: 'op',
            width: 260,
            render: (_: unknown, row: ClamInfo) => (
                <Space>
                    <Button size="small" theme="borderless" disabled={!base.isActive} onClick={() => onRun(row)}>
                        {t('toolbox.clam.handle')}
                    </Button>
                    <Button
                        size="small"
                        theme="borderless"
                        onClick={() => {
                            setFormTarget(row);
                            setFormOpen(true);
                        }}
                    >
                        {t('toolbox.actions.edit')}
                    </Button>
                    <Button size="small" theme="borderless" onClick={() => setRecordTarget(row)}>
                        {t('toolbox.clam.record')}
                    </Button>
                    <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteRows([row])}>
                        {t('toolbox.actions.delete')}
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Tag color="green" size="large">
                    ClamAV
                </Tag>
                <Tag color={base.isActive ? 'green' : 'grey'}>{base.isActive ? t('toolbox.actions.enable') : t('toolbox.actions.disable')}</Tag>
                <Tag>
                    {t('toolbox.clam.version')}: {base.version}
                </Tag>
                <Button theme="borderless" type="primary" onClick={() => onOperateBase('ClamAV', base.isActive ? 'stop' : 'start')}>
                    {base.isActive ? t('toolbox.actions.stop') : t('toolbox.actions.start')}
                </Button>
                <Button theme="borderless" type="primary" onClick={() => onOperateBase('ClamAV', 'restart')}>
                    {t('toolbox.actions.restart')}
                </Button>
                <Button icon={<IconRefresh />} theme="borderless" loading={baseFetching} onClick={() => refetchBase()}>
                    {t('toolbox.actions.refresh')}
                </Button>
            </div>

            {base.freshIsExist && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <Tag color="blue" size="large">
                        FreshClam
                    </Tag>
                    <Tag color={base.freshIsActive ? 'green' : 'grey'}>{base.freshIsActive ? t('toolbox.actions.enable') : t('toolbox.actions.disable')}</Tag>
                    <Tag>
                        {t('toolbox.clam.version')}: {base.freshVersion}
                    </Tag>
                    <Button theme="borderless" type="primary" onClick={() => onOperateBase('FreshClam', base.freshIsActive ? 'stop' : 'start')}>
                        {base.freshIsActive ? t('toolbox.actions.stop') : t('toolbox.actions.start')}
                    </Button>
                    <Button theme="borderless" type="primary" onClick={() => onOperateBase('FreshClam', 'restart')}>
                        {t('toolbox.actions.restart')}
                    </Button>
                </div>
            )}

            {!base.isActive && <Text type="warning">{t('toolbox.clam.notStart')}</Text>}

            <Space wrap>
                <Input prefix={<IconSearch />} placeholder={t('toolbox.clam.searchPlaceholder')} value={searchInput} onChange={(v) => { setSearchInput(v); setPage(1); }} style={{ width: 220 }} showClear />
                <Button
                    icon={<IconPlus />}
                    theme="solid"
                    type="primary"
                    disabled={!base.isActive}
                    onClick={() => {
                        setFormTarget(null);
                        setFormOpen(true);
                    }}
                >
                    {t('toolbox.clam.create')}
                </Button>
                <Button theme="borderless" type="danger" disabled={selected.length === 0} onClick={() => setDeleteRows((data?.items ?? []).filter((r) => selected.includes(r.id)))}>
                    {t('toolbox.actions.delete')}
                </Button>
                <Button icon={<IconRefresh />} theme="borderless" loading={isFetching} onClick={() => refetch()}>
                    {t('toolbox.actions.refresh')}
                </Button>
                <Button icon={<IconFile />} theme="borderless" onClick={() => setConfOpen(true)}>
                    {t('toolbox.config.title')}
                </Button>
            </Space>

            <Table
                rowKey="id"
                columns={columns}
                dataSource={data?.items ?? []}
                loading={isFetching}
                rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected((keys ?? []).map(Number)) }}
                pagination={{
                    currentPage: page,
                    pageSize,
                    total: data?.total ?? 0,
                    onPageChange: setPage,
                    onPageSizeChange: (s: number) => {
                        setPageSize(s);
                        setPage(1);
                    },
                }}
                empty={<Text type="tertiary">{t('toolbox.clam.empty')}</Text>}
            />

            {formOpen && <ClamFormModal target={formTarget} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refetch(); }} />}
            {recordTarget && <ClamRecordSheet target={recordTarget} onClose={() => setRecordTarget(null)} />}
            {confOpen && <ClamConfigModal onClose={() => setConfOpen(false)} />}

            <Modal
                title={t('toolbox.actions.delete')}
                visible={!!deleteRows}
                confirmLoading={deleting}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                onOk={doDelete}
                onCancel={() => setDeleteRows(null)}
            >
                <div>
                    <Text>{t('toolbox.clam.deleteContent', { name: (deleteRows ?? []).map((r) => r.name).join(', ') })}</Text>
                </div>
                <div style={{ marginTop: 12 }}>
                    <Checkbox checked={removeInfected} onChange={(e) => setRemoveInfected(!!e.target.checked)}>
                        {t('toolbox.clam.removeInfected')}
                    </Checkbox>
                    <div>
                        <Text type="tertiary" size="small">
                            {t('toolbox.clam.removeInfectedHelper')}
                        </Text>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
