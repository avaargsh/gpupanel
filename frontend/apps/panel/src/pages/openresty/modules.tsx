import { useEffect, useState } from 'react';
import {
    Banner,
    Button,
    Checkbox,
    CheckboxGroup,
    Input,
    Modal,
    Radio,
    RadioGroup,
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
import { IconPlus, IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useBuildNginxMutation,
    useGetNginxModulesQuery,
    useUpdateNginxModuleMutation,
    type NginxBuildConfig,
    type NginxModule,
} from '@/api/openrestyApi';
import { useLazyReadTaskLogQuery } from '@/api/logsApi';
import { errText, Field } from '@/pages/toolbox/shared';

const { Text } = Typography;

const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const MIRRORS = [
    'http://archive.ubuntu.com/ubuntu/',
    'http://mirrors.aliyun.com/ubuntu/',
    'http://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
];

interface ModuleForm {
    name: string;
    script: string;
    packages: string;
    params: string;
    buildMode: 'dynamic' | 'static';
    provider: 'local' | 'prebuilt';
    loadOrder: number;
    enable: boolean;
}

const DEFAULT_MODULE: ModuleForm = {
    name: '',
    script: '',
    packages: '',
    params: '',
    buildMode: 'dynamic',
    provider: 'local',
    loadOrder: 50,
    enable: true,
};

function ModuleOperateSheet({
    mode,
    target,
    dynamicSupported,
    onClose,
    onSaved,
}: {
    mode: 'create' | 'update' | 'view';
    target?: NginxModule;
    dynamicSupported: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { t } = useTranslation();
    const [updateModule, { isLoading }] = useUpdateNginxModuleMutation();
    const [form, setForm] = useState<ModuleForm>(DEFAULT_MODULE);

    useEffect(() => {
        if (target) {
            setForm({
                name: target.name,
                script: target.script ?? '',
                packages: target.packages ?? '',
                params: target.params ?? '',
                buildMode: target.buildMode ?? 'dynamic',
                provider: target.provider ?? 'local',
                loadOrder: target.loadOrder ?? 50,
                enable: target.enable,
            });
        } else {
            setForm(DEFAULT_MODULE);
        }
    }, [target]);

    const readOnly = mode === 'view';

    const submit = async () => {
        if (!readOnly) {
            if (!form.name.trim()) return Toast.error(t('openresty.modules.nameRequired'));
            if (!form.params.trim()) return Toast.error(t('openresty.modules.paramsRequired'));
        }
        try {
            await updateModule({
                operate: mode === 'create' ? 'create' : 'update',
                name: form.name.trim(),
                script: form.script,
                packages: form.packages,
                params: form.params,
                buildMode: form.buildMode,
                provider: form.provider,
                loadOrder: form.loadOrder,
                enable: form.enable,
            }).unwrap();
            Toast.success(t('openresty.saveSuccess'));
            onSaved();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const title = mode === 'view' ? t('openresty.modules.view') : t(`openresty.modules.${mode}`);
    return (
        <SideSheet
            title={title}
            visible
            width={560}
            onCancel={onClose}
            footer={
                <Space>
                    <Button onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
                    {!readOnly ? (
                        <Button theme="solid" type="primary" loading={isLoading} onClick={submit}>
                            {t('common.confirm')}
                        </Button>
                    ) : null}
                </Space>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Field label={t('openresty.modules.name')}>
                    <Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} disabled={mode === 'update' || readOnly} />
                </Field>
                <Field label={t('openresty.modules.buildMode')} help={!dynamicSupported ? t('openresty.modules.dynamicUnsupported') : undefined}>
                    <RadioGroup
                        value={form.buildMode}
                        onChange={(e) => setForm((s) => ({ ...s, buildMode: String(e.target.value) as 'dynamic' | 'static' }))}
                        disabled={readOnly}
                    >
                        <Radio value="dynamic" disabled={!dynamicSupported}>
                            {t('openresty.modules.buildModeDynamic')}
                        </Radio>
                        <Radio value="static">{t('openresty.modules.buildModeStatic')}</Radio>
                    </RadioGroup>
                </Field>
                <Field label={t('openresty.modules.params')} help={t('openresty.modules.paramsHelper')}>
                    <Input value={form.params} onChange={(v) => setForm((s) => ({ ...s, params: v }))} disabled={readOnly} />
                </Field>
                <Field label={t('openresty.modules.packages')} help={t('openresty.modules.packagesHelper')}>
                    <Input value={form.packages} onChange={(v) => setForm((s) => ({ ...s, packages: v }))} disabled={readOnly} />
                </Field>
                <Field label={t('openresty.modules.script')} help={t('openresty.modules.scriptHelper')}>
                    <TextArea value={form.script} onChange={(v) => setForm((s) => ({ ...s, script: v }))} autosize={{ minRows: 6, maxRows: 14 }} disabled={readOnly} />
                </Field>
                {form.buildMode !== 'static' ? (
                    <Field label={t('openresty.modules.loadOrder')}>
                        <Input
                            type="number"
                            value={String(form.loadOrder)}
                            onChange={(v) => setForm((s) => ({ ...s, loadOrder: Number(v || 0) }))}
                            disabled={readOnly}
                        />
                    </Field>
                ) : null}
                {target?.lastError ? (
                    <Banner type="danger" closeIcon={null} title={t('openresty.modules.buildFailed')} description={target.lastError} />
                ) : null}
            </div>
        </SideSheet>
    );
}

function TaskLogSheet({ taskID, onClose }: { taskID: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [readTaskLog] = useLazyReadTaskLogQuery();
    const [lines, setLines] = useState<string[]>([]);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let active = true;
        let timer: number | undefined;
        const tick = async () => {
            try {
                const res = await readTaskLog({ taskID, page: 1, pageSize: 500 }).unwrap();
                if (!active) return;
                setLines(res.lines);
                setDone(res.end);
                if (!res.end) timer = window.setTimeout(tick, 2000);
            } catch {
                if (active) setDone(true);
            }
        };
        tick();
        return () => {
            active = false;
            if (timer) window.clearTimeout(timer);
        };
    }, [taskID, readTaskLog]);

    return (
        <SideSheet title={t('openresty.modules.buildLog')} visible onCancel={onClose} width={720}>
            <pre
                style={{
                    margin: 0,
                    maxHeight: '70vh',
                    overflow: 'auto',
                    padding: 12,
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: '#e8eaf0',
                    background: '#14151a',
                    borderRadius: 8,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}
            >
                {lines.length ? lines.join('\n') : t('common.loading')}
            </pre>
            {done ? (
                <Text type="tertiary" size="small">
                    {t('openresty.modules.buildFinished')}
                </Text>
            ) : null}
        </SideSheet>
    );
}

function BuildModal({ config, onClose }: { config: NginxBuildConfig; onClose: () => void }) {
    const { t } = useTranslation();
    const [build, { isLoading }] = useBuildNginxMutation();
    const dynamicModules = config.modules.filter((m) => m.enable && m.buildMode === 'dynamic');
    const staticModules = config.modules.filter((m) => m.enable && m.buildMode === 'static');
    const [mirror, setMirror] = useState(config.mirror || MIRRORS[0]);
    const [selected, setSelected] = useState<string[]>(dynamicModules.map((m) => m.name));
    const [force, setForce] = useState(false);
    const [taskID, setTaskID] = useState('');

    const submit = async () => {
        if (staticModules.length === 0 && selected.length === 0) {
            Toast.error(t('openresty.modules.selectRequired'));
            return;
        }
        try {
            const id = uuid();
            await build({ taskID: id, mirror, modules: selected, force }).unwrap();
            setTaskID(id);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    if (taskID) {
        return <TaskLogSheet taskID={taskID} onClose={onClose} />;
    }

    return (
        <Modal
            title={t('openresty.modules.build')}
            visible
            width={560}
            onCancel={onClose}
            onOk={submit}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            confirmLoading={isLoading}
            maskClosable={false}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Banner type="info" closeIcon={null} title={t('openresty.modules.buildPurposeHint')} />
                <Field label={t('openresty.modules.mirrorUrl')}>
                    <Select value={mirror} onChange={(v) => setMirror(String(v))} style={{ width: '100%' }} optionList={MIRRORS.map((m) => ({ label: m, value: m }))} />
                </Field>
                {dynamicModules.length ? (
                    <Field label={t('openresty.modules.modulesToBuild')}>
                        <CheckboxGroup value={selected} onChange={(v) => setSelected(v as string[])}>
                            {dynamicModules.map((m) => (
                                <Checkbox key={m.name} value={m.name}>
                                    {m.name}
                                </Checkbox>
                            ))}
                        </CheckboxGroup>
                    </Field>
                ) : null}
                {staticModules.length ? (
                    <Field label={t('openresty.modules.staticModules')} help={t('openresty.modules.staticModulesHelper')}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {staticModules.map((m) => (
                                <Text key={m.name}>{m.name}</Text>
                            ))}
                        </div>
                    </Field>
                ) : null}
                <Field label={t('openresty.modules.forceBuild')}>
                    <Switch checked={force} onChange={setForce} />
                </Field>
                {!config.dynamicSupported ? (
                    <Banner type="warning" closeIcon={null} title={t('openresty.modules.dynamicUnsupported')} />
                ) : null}
            </div>
        </Modal>
    );
}

export default function ModulesTab() {
    const { t } = useTranslation();
    const query = useGetNginxModulesQuery();
    const [updateModule, { isLoading: updating }] = useUpdateNginxModuleMutation();
    const [operate, setOperate] = useState<{ mode: 'create' | 'update' | 'view'; target?: NginxModule } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<NginxModule | null>(null);
    const [buildOpen, setBuildOpen] = useState(false);

    const modules = query.data?.modules ?? [];
    const dynamicSupported = query.data?.dynamicSupported ?? true;

    const toggleEnable = async (row: NginxModule, enable: boolean) => {
        try {
            await updateModule({ ...row, operate: 'update', enable }).unwrap();
            Toast.success(t('openresty.saveSuccess'));
        } catch (e) {
            Toast.error(errText(e));
            query.refetch();
        }
    };

    const remove = async (row: NginxModule) => {
        try {
            await updateModule({ operate: 'delete', name: row.name }).unwrap();
            Toast.success(t('openresty.saveSuccess'));
            setDeleteTarget(null);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('openresty.modules.name'), dataIndex: 'name', key: 'name', minWidth: 280 },
        {
            title: t('openresty.modules.buildMode'),
            key: 'buildMode',
            width: 140,
            render: (_: unknown, row: NginxModule) => (
                <Tag color={row.buildMode === 'static' ? 'orange' : 'blue'}>
                    {t(`openresty.modules.buildMode${row.buildMode === 'static' ? 'Static' : 'Dynamic'}`)}
                </Tag>
            ),
        },
        {
            title: t('openresty.modules.buildStatus'),
            key: 'buildStatus',
            width: 140,
            render: (_: unknown, row: NginxModule) => (
                <Tag color={row.buildStatus === 'ready' ? 'green' : row.buildStatus === 'failed' ? 'red' : 'grey'}>
                    {t(`openresty.modules.${row.buildStatus}`)}
                </Tag>
            ),
        },
        {
            title: t('openresty.modules.status'),
            key: 'enable',
            width: 110,
            render: (_: unknown, row: NginxModule) => (
                <Switch
                    checked={row.enable}
                    disabled={updating}
                    onChange={(v) => toggleEnable(row, v)}
                />
            ),
        },
        {
            title: t('openresty.modules.operate'),
            key: 'operate',
            width: 220,
            render: (_: unknown, row: NginxModule) => (
                <div style={{ display: 'flex', gap: 4 }}>
                    <Button size="small" theme="borderless" onClick={() => setOperate({ mode: row.custom ? 'update' : 'view', target: row })}>
                        {row.custom ? t('openresty.modules.edit') : t('openresty.modules.view')}
                    </Button>
                    {row.custom ? (
                        <Button size="small" type="danger" theme="borderless" onClick={() => setDeleteTarget(row)}>
                            {t('common.delete')}
                        </Button>
                    ) : null}
                </div>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {query.isError ? <Banner type="danger" closeIcon={null} title={errText(query.error)} /> : null}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button type="primary" icon={<IconPlus />} onClick={() => setOperate({ mode: 'create' })}>
                    {t('openresty.modules.create')}
                </Button>
                <Button onClick={() => setBuildOpen(true)} disabled={!query.data}>
                    {t('openresty.modules.build')}
                </Button>
                <Button icon={<IconRefresh />} onClick={() => query.refetch()}>
                    {t('common.refresh')}
                </Button>
                <Text type="warning" size="small">
                    {t('openresty.modules.buildHelper')}
                </Text>
            </div>
            <Table
                rowKey="name"
                columns={columns}
                dataSource={modules}
                loading={query.isLoading}
                empty={<Text type="tertiary">{t('common.empty')}</Text>}
                pagination={false}
            />

            {operate ? (
                <ModuleOperateSheet
                    mode={operate.mode}
                    target={operate.target}
                    dynamicSupported={dynamicSupported}
                    onClose={() => setOperate(null)}
                    onSaved={() => {
                        setOperate(null);
                        query.refetch();
                    }}
                />
            ) : null}
            {deleteTarget ? (
                <Modal
                    title={t('common.delete')}
                    visible
                    onCancel={() => setDeleteTarget(null)}
                    onOk={() => remove(deleteTarget)}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    okButtonProps={{ type: 'danger' }}
                    confirmLoading={updating}
                >
                    <Text>{t('openresty.modules.deleteConfirm', { name: deleteTarget.name })}</Text>
                </Modal>
            ) : null}
            {buildOpen && query.data ? <BuildModal config={query.data} onClose={() => setBuildOpen(false)} /> : null}
        </div>
    );
}
