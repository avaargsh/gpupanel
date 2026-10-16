import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Checkbox, Input, InputNumber, Modal, Radio, RadioGroup, Select, SideSheet, Space, Switch, Tag, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { IconDelete, IconPlus } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useCreateCronjobMutation,
    useLoadCronjobInfoQuery,
    useLoadNextTimesMutation,
    useSearchScriptsQuery,
    useUpdateCronjobMutation,
    type CronjobInfo,
    type CronjobOperate,
    type GroupInfo,
    type SpecObj,
} from '@/api/cronjobApi';
import { useListWebsitesQuery } from '@/api/websiteApi';
import { useListContainersQuery } from '@/api/containerApi';
import { useSearchInstalledQuery } from '@/api/appApi';
import { useAppSelector } from '@/store/hooks';
import {
    defaultSpecObj,
    hasBackup,
    hasExclusion,
    hasScript,
    isWebsite,
    specTypes,
    transObjToSpec,
    transSpecToObj,
    weekOptions,
    weekLabel,
} from './helper';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const TASK_TYPES = ['shell', 'log', 'website', 'cutWebsiteLog', 'app', 'database', 'directory', 'snapshot', 'curl', 'cleanLog', 'ntp', 'syncIpGroup'];
const EXECUTORS = ['bash', 'sh', 'python', 'python2', 'python3'];
const DB_TYPES = ['mysql', 'mysql-cluster', 'mariadb', 'postgresql', 'postgresql-cluster', 'mongodb'];

interface Props {
    target: CronjobInfo | null;
    groups: GroupInfo[];
    onClose: () => void;
}

interface FormState {
    type: string;
    name: string;
    groupID: number;
    specCustom: boolean;
    specObjs: SpecObj[];
    specs: string[];
    websiteList: string[];
    appIdList: string[];
    dbType: string;
    dbNameList: string[];
    isDir: boolean;
    sourceDir: string;
    files: string[];
    urlItems: string[];
    inContainer: boolean;
    containerName: string;
    command: string;
    user: string;
    executor: string;
    scriptMode: string;
    script: string;
    scriptID?: number;
    retainCopies: number;
    timeout: number;
    retryTimes: number;
    secret: string;
    ignoreErr: boolean;
    ignoreFiles: string[];
    scopes: string[];
    withImage: boolean;
    ignoreAppIDs: number[];
}

const emptyForm = (): FormState => ({
    type: 'shell',
    name: '',
    groupID: 0,
    specCustom: false,
    specObjs: [defaultSpecObj('shell')],
    specs: ['0 2 * * *'],
    websiteList: [],
    appIdList: [],
    dbType: 'mysql',
    dbNameList: [],
    isDir: true,
    sourceDir: '',
    files: [],
    urlItems: [''],
    inContainer: false,
    containerName: '',
    command: 'bash',
    user: 'root',
    executor: 'bash',
    scriptMode: 'input',
    script: '',
    retainCopies: 3,
    timeout: 3600,
    retryTimes: 0,
    secret: '',
    ignoreErr: false,
    ignoreFiles: [],
    scopes: [],
    withImage: false,
    ignoreAppIDs: [],
});

export default function CronjobOperate({ target, groups, onClose }: Props) {
    const { t } = useTranslation();
    const [form, setForm] = useState<FormState>(emptyForm);
    const [loaded, setLoaded] = useState(!target);
    const [preview, setPreview] = useState<string | null>(null);
    const [previewTimes, setPreviewTimes] = useState<string[]>([]);
    const isCreate = !target;
    const set = (patch: Partial<FormState>) => setForm((s) => ({ ...s, ...patch }));

    const detail = useLoadCronjobInfoQuery(target?.id as number, { skip: !target });
    const { data: websites = [] } = useListWebsitesQuery();
    const { data: containers = [] } = useListContainersQuery();
    const scopeNode = useAppSelector((state) => state.ui.currentNode) || 'local';
    const { data: installed } = useSearchInstalledQuery({ scopeNode, page: 1, pageSize: 200, name: '', tags: [], update: false, sync: false });
    const { data: scripts } = useSearchScriptsQuery({ page: 1, pageSize: 200, info: '', groupID: 0, orderBy: 'createdAt', order: 'descending' });
    const [create, { isLoading: creating }] = useCreateCronjobMutation();
    const [update, { isLoading: updating }] = useUpdateCronjobMutation();
    const [loadNext] = useLoadNextTimesMutation();

    useEffect(() => {
        if (!target || !detail.data) return;
        const d = detail.data;
        const parts = (d.spec || '').split('&&').filter(Boolean);
        const objs = d.specCustom ? [defaultSpecObj(d.type)] : parts.map((s) => transSpecToObj(s)).filter((o): o is SpecObj => o != null);
        setForm({
            ...emptyForm(),
            type: d.type,
            name: d.name,
            groupID: d.groupID ?? 0,
            specCustom: d.specCustom,
            specObjs: objs.length ? objs : [defaultSpecObj(d.type)],
            specs: d.specCustom ? parts : ['0 2 * * *'],
            websiteList: d.website ? d.website.split(',') : [],
            appIdList: d.appID ? d.appID.split(',') : [],
            dbType: d.dbType || 'mysql',
            dbNameList: d.dbName ? d.dbName.split(',') : [],
            isDir: d.isDir ?? true,
            sourceDir: d.isDir ? d.sourceDir ?? '' : '',
            files: !d.isDir && d.sourceDir ? d.sourceDir.split(',') : [],
            urlItems: d.url ? d.url.split(',') : [''],
            inContainer: !!d.containerName,
            containerName: d.containerName ?? '',
            command: d.command || 'bash',
            user: d.user || 'root',
            executor: d.executor || 'bash',
            scriptMode: d.scriptMode || 'input',
            script: d.script || '',
            scriptID: d.scriptID || undefined,
            retainCopies: d.retainCopies || 3,
            timeout: d.timeout || 3600,
            retryTimes: d.retryTimes || 0,
            secret: d.secret || '',
            ignoreErr: d.ignoreErr ?? false,
            ignoreFiles: d.exclusionRules ? d.exclusionRules.split(',') : [],
            scopes: (d.scopes as string[]) ?? [],
            withImage: d.snapshotRule?.withImage ?? false,
            ignoreAppIDs: d.snapshotRule?.ignoreAppIDs ?? [],
        });
        setLoaded(true);
    }, [target, detail.data]);

    const appOptions = useMemo(
        () => (installed?.items ?? []).map((a) => ({ label: a.name, value: String(a.id) })),
        [installed],
    );

    const buildSpec = (): string | null => {
        if (form.specCustom) {
            const specs = form.specs.map((s) => s.trim()).filter(Boolean);
            if (!specs.length) return null;
            return specs.join('&&');
        }
        const specs: string[] = [];
        for (const o of form.specObjs) {
            const s = transObjToSpec(o.specType, o.week, o.day, o.hour, o.minute, o.second);
            if (!s) return null;
            specs.push(s);
        }
        return specs.length ? specs.join('&&') : null;
    };

    const onPreview = async (spec: string) => {
        if (!spec) return Toast.warning(t('cronjob.cronSpecHelper'));
        try {
            const res = await loadNext(spec).unwrap();
            setPreview(spec);
            setPreviewTimes(res ?? []);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const submit = async () => {
        if (!form.name.trim()) return Toast.warning(t('cronjob.operate.nameRequired'));
        const spec = buildSpec();
        if (!spec) return Toast.warning(t('cronjob.operate.specRequired'));
        if (form.type === 'curl' && form.urlItems.filter((u) => u.trim()).length === 0) {
            return Toast.warning(t('cronjob.operate.urlRequired'));
        }
        const payload: CronjobOperate = {
            name: form.name.trim(),
            type: form.type,
            groupID: form.groupID,
            specCustom: form.specCustom,
            spec,
            retainCopies: hasBackup(form.type) ? form.retainCopies : undefined,
            timeout: form.timeout,
            retryTimes: form.retryTimes,
            ignoreErr: hasExclusion(form.type, form.isDir) ? form.ignoreErr : false,
        };
        if (target) payload.id = target.id;
        if (hasExclusion(form.type, form.isDir)) payload.exclusionRules = form.ignoreFiles.join(',');
        if (isWebsite(form.type)) payload.website = form.websiteList.join(',');
        if (form.type === 'app') payload.appID = form.appIdList.join(',');
        if (form.type === 'database') {
            payload.dbType = form.dbType;
            payload.dbName = form.dbNameList.join(',');
        }
        if (form.type === 'directory') {
            payload.isDir = form.isDir;
            payload.sourceDir = form.isDir ? form.sourceDir : form.files.join(',');
        }
        if (form.type === 'curl') payload.url = form.urlItems.filter((u) => u.trim()).join(',');
        if (form.type === 'cleanLog') payload.scopes = form.scopes;
        if (form.type === 'snapshot') payload.snapshotRule = { withImage: form.withImage, ignoreAppIDs: form.ignoreAppIDs };
        if (hasBackup(form.type)) payload.secret = form.secret;
        if (hasScript(form.type)) {
            payload.scriptMode = form.scriptMode;
            payload.script = form.scriptMode === 'library' ? undefined : form.script;
            payload.scriptID = form.scriptMode === 'library' ? form.scriptID : undefined;
            payload.executor = form.inContainer ? undefined : form.executor;
            payload.containerName = form.inContainer ? form.containerName : '';
            payload.command = form.inContainer ? form.command : undefined;
            payload.user = form.user;
        }
        try {
            if (target) {
                await update(payload).unwrap();
            } else {
                await create(payload).unwrap();
            }
            Toast.success(t('cronjob.saveSuccess'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const showBackup = hasBackup(form.type);
    const showExclusion = hasExclusion(form.type, form.isDir);

    return (
        <SideSheet
            title={isCreate ? t('cronjob.operate.create') : t('cronjob.operate.editTitle', { name: target?.name })}
            visible
            width={720}
            placement="right"
            onCancel={onClose}
            footer={
                <Space>
                    <Button onClick={onClose}>{t('common.cancel')}</Button>
                    <Button theme="solid" type="primary" loading={creating || updating} onClick={submit}>
                        {t('common.confirm')}
                    </Button>
                </Space>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Field label={t('cronjob.operate.taskType')}>
                    <Select
                        value={form.type}
                        disabled={!isCreate}
                        style={{ width: '100%' }}
                        onChange={(v) => {
                            const type = String(v);
                            set({ type, specObjs: [defaultSpecObj(type)] });
                        }}
                        optionList={TASK_TYPES.map((v) => ({ label: t(`cronjob.types.${v}`), value: v }))}
                    />
                </Field>
                <Field label={t('cronjob.operate.name')}>
                    <Input value={form.name} onChange={(v) => set({ name: v })} disabled={!isCreate} />
                </Field>
                <Field label={t('cronjob.operate.group')}>
                    <Select
                        value={form.groupID || undefined}
                        onChange={(v) => set({ groupID: Number(v ?? 0) })}
                        style={{ width: '100%' }}
                        showClear
                        placeholder={t('cronjob.operate.group')}
                        optionList={groups.map((g) => ({ label: g.name === 'Default' ? t('cronjob.operate.defaultGroup') : g.name, value: g.id }))}
                    />
                </Field>

                {/* 执行周期 */}
                <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text strong>{t('cronjob.operate.cronSpec')}</Text>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Switch checked={form.specCustom} onChange={(v) => set({ specCustom: v })} size="small" />
                            <Text size="small">{t('cronjob.operate.custom')}</Text>
                        </label>
                    </div>
                    {form.specCustom ? (
                        <>
                            {form.specs.map((spec, i) => (
                                <Space key={i} style={{ width: '100%' }}>
                                    <Input value={spec} onChange={(v) => set({ specs: form.specs.map((s, idx) => (idx === i ? v : s)) })} style={{ width: 260 }} placeholder="0 3 * * *" />
                                    <Button theme="borderless" onClick={() => onPreview(spec)}>
                                        {t('cronjob.operate.preview')}
                                    </Button>
                                    {form.specs.length > 1 && (
                                        <Button theme="borderless" type="danger" icon={<IconDelete />} onClick={() => set({ specs: form.specs.filter((_, idx) => idx !== i) })} />
                                    )}
                                </Space>
                            ))}
                            <Button theme="borderless" icon={<IconPlus />} onClick={() => set({ specs: [...form.specs, ''] })}>
                                {t('cronjob.operate.addSpec')}
                            </Button>
                        </>
                    ) : (
                        <>
                            {form.specObjs.map((o, i) => (
                                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                    <Select
                                        value={o.specType}
                                        style={{ width: 140 }}
                                        optionList={specTypes.map((s) => ({ label: t(`cronjob.specType.${s}`), value: s }))}
                                        onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, specType: String(v) } : item)) })}
                                    />
                                    {o.specType === 'perWeek' && (
                                        <Select
                                            value={o.week}
                                            style={{ width: 120 }}
                                            optionList={weekOptions.map((w) => ({ label: weekLabel(t, w), value: w }))}
                                            onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, week: Number(v) } : item)) })}
                                        />
                                    )}
                                    {['perMonth', 'perNDay'].includes(o.specType) && (
                                        <InputNumber
                                            value={o.day}
                                            min={1}
                                            style={{ width: 120 }}
                                            prefix={t('cronjob.operate.day')}
                                            onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, day: Number(v ?? 1) } : item)) })}
                                        />
                                    )}
                                    {['perMonth', 'perWeek', 'perDay', 'perNDay', 'perNHour'].includes(o.specType) && (
                                        <InputNumber
                                            value={o.hour}
                                            min={0}
                                            max={23}
                                            style={{ width: 120 }}
                                            prefix={t('cronjob.operate.hour')}
                                            onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, hour: Number(v ?? 0) } : item)) })}
                                        />
                                    )}
                                    {o.specType === 'perNMinute' && (
                                        <InputNumber
                                            value={o.minute}
                                            min={1}
                                            style={{ width: 120 }}
                                            prefix={t('cronjob.operate.minute')}
                                            onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, minute: Number(v ?? 1) } : item)) })}
                                        />
                                    )}
                                    {o.specType === 'perNSecond' ? (
                                        <InputNumber
                                            value={o.second}
                                            min={1}
                                            style={{ width: 120 }}
                                            prefix={t('cronjob.operate.second')}
                                            onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, second: Number(v ?? 1) } : item)) })}
                                        />
                                    ) : o.specType !== 'perNMinute' ? (
                                        <InputNumber
                                            value={o.minute}
                                            min={0}
                                            max={59}
                                            style={{ width: 120 }}
                                            prefix={t('cronjob.operate.minute')}
                                            onChange={(v) => set({ specObjs: form.specObjs.map((item, idx) => (idx === i ? { ...item, minute: Number(v ?? 0) } : item)) })}
                                        />
                                    ) : null}
                                    <Button
                                        theme="borderless"
                                        onClick={() => onPreview(transObjToSpec(o.specType, o.week, o.day, o.hour, o.minute, o.second))}
                                    >
                                        {t('cronjob.operate.preview')}
                                    </Button>
                                    {form.specObjs.length > 1 && (
                                        <Button theme="borderless" type="danger" icon={<IconDelete />} onClick={() => set({ specObjs: form.specObjs.filter((_, idx) => idx !== i) })} />
                                    )}
                                </div>
                            ))}
                            <Button theme="borderless" icon={<IconPlus />} onClick={() => set({ specObjs: [...form.specObjs, defaultSpecObj(form.type)] })}>
                                {t('cronjob.operate.addSpec')}
                            </Button>
                        </>
                    )}
                </div>

                {/* 类型专属字段 */}
                {isWebsite(form.type) && (
                    <Field label={form.type === 'website' ? t('cronjob.operate.website') : t('cronjob.operate.cutWebsiteLog')}>
                        <Select
                            multiple
                            filter
                            value={form.websiteList}
                            style={{ width: '100%' }}
                            optionList={[{ label: t('cronjob.operate.all'), value: 'all' }, ...websites.map((w) => ({ label: w.primaryDomain, value: String(w.id) }))]}
                            onChange={(v) => {
                                const arr = v as string[];
                                set({ websiteList: arr.includes('all') ? ['all'] : arr });
                            }}
                        />
                    </Field>
                )}
                {form.type === 'app' && (
                    <Field label={t('cronjob.operate.app')}>
                        <Select
                            multiple
                            filter
                            value={form.appIdList}
                            style={{ width: '100%' }}
                            optionList={[{ label: t('cronjob.operate.all'), value: 'all' }, ...appOptions]}
                            onChange={(v) => {
                                const arr = v as string[];
                                set({ appIdList: arr.includes('all') ? ['all'] : arr });
                            }}
                        />
                    </Field>
                )}
                {form.type === 'database' && (
                    <>
                        <Field label={t('cronjob.operate.dbType')}>
                            <Select value={form.dbType} style={{ width: '100%' }} optionList={DB_TYPES.map((d) => ({ label: d, value: d }))} onChange={(v) => set({ dbType: String(v) })} />
                        </Field>
                        <Field label={t('cronjob.operate.dbName')}>
                            <Select
                                multiple
                                filter
                                allowCreate
                                value={form.dbNameList}
                                style={{ width: '100%' }}
                                placeholder={t('cronjob.operate.dbNameHelper')}
                                optionList={[{ label: t('cronjob.operate.all'), value: 'all' }]}
                                onChange={(v) => {
                                    const arr = v as string[];
                                    set({ dbNameList: arr.includes('all') ? ['all'] : arr });
                                }}
                            />
                        </Field>
                    </>
                )}
                {form.type === 'directory' && (
                    <>
                        <Field label={t('cronjob.operate.directory')}>
                            <RadioGroup value={form.isDir ? 'dir' : 'files'} onChange={(e) => set({ isDir: String(e.target.value) === 'dir' })}>
                                <Radio value="dir">{t('cronjob.operate.dir')}</Radio>
                                <Radio value="files">{t('cronjob.operate.files')}</Radio>
                            </RadioGroup>
                        </Field>
                        {form.isDir ? (
                            <Field label={t('cronjob.operate.sourceDir')}>
                                <Input value={form.sourceDir} onChange={(v) => set({ sourceDir: v })} placeholder="/data" />
                            </Field>
                        ) : (
                            <Field label={t('cronjob.operate.filePath')}>
                                <Select
                                    multiple
                                    filter
                                    allowCreate
                                    value={form.files}
                                    style={{ width: '100%' }}
                                    placeholder="/data/a.txt"
                                    optionList={[]}
                                    onChange={(v) => set({ files: v as string[] })}
                                />
                            </Field>
                        )}
                    </>
                )}
                {form.type === 'curl' && (
                    <Field label={t('cronjob.operate.curl')}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {form.urlItems.map((url, i) => (
                                <Space key={i}>
                                    <Input value={url} style={{ width: 460 }} onChange={(v) => set({ urlItems: form.urlItems.map((u, idx) => (idx === i ? v : u)) })} />
                                    {form.urlItems.length > 1 && (
                                        <Button theme="borderless" type="danger" icon={<IconDelete />} onClick={() => set({ urlItems: form.urlItems.filter((_, idx) => idx !== i) })} />
                                    )}
                                </Space>
                            ))}
                            <Button theme="borderless" icon={<IconPlus />} onClick={() => set({ urlItems: [...form.urlItems, ''] })}>
                                {t('cronjob.operate.addSpec')}
                            </Button>
                        </div>
                    </Field>
                )}
                {form.type === 'cleanLog' && (
                    <Field label={t('cronjob.operate.scopes')}>
                        <Select
                            multiple
                            value={form.scopes}
                            style={{ width: '100%' }}
                            optionList={[{ label: t('cronjob.operate.scopeWebsite'), value: 'website' }]}
                            onChange={(v) => set({ scopes: v as string[] })}
                        />
                    </Field>
                )}
                {form.type === 'snapshot' && (
                    <>
                        <Checkbox checked={form.withImage} onChange={(e) => set({ withImage: !!e.target.checked })}>
                            {t('cronjob.operate.withImage')}
                        </Checkbox>
                        <Field label={t('cronjob.operate.ignoreApp')}>
                            <Select
                                multiple
                                filter
                                value={form.ignoreAppIDs}
                                style={{ width: '100%' }}
                                optionList={appOptions}
                                onChange={(v) => set({ ignoreAppIDs: ((v as unknown as string[]) ?? []).map(Number) })}
                            />
                        </Field>
                    </>
                )}

                {/* Shell 脚本 */}
                {hasScript(form.type) && (
                    <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Switch checked={form.inContainer} onChange={(v) => set({ inContainer: v })} size="small" />
                            <Text size="small">{t('cronjob.operate.inContainer')}</Text>
                        </label>
                        {form.inContainer && (
                            <Space wrap>
                                <Select
                                    filter
                                    value={form.containerName || undefined}
                                    style={{ width: 220 }}
                                    placeholder={t('cronjob.operate.containerName')}
                                    optionList={containers.map((c) => ({ label: c.name, value: c.name }))}
                                    onChange={(v) => set({ containerName: String(v) })}
                                />
                                <Input value={form.command} onChange={(v) => set({ command: v })} prefix={t('cronjob.operate.command')} style={{ width: 200 }} />
                            </Space>
                        )}
                        <Field label={t('cronjob.operate.user')}>
                            <Input value={form.user} onChange={(v) => set({ user: v })} style={{ width: 200 }} />
                        </Field>
                        {!form.inContainer && (
                            <Field label={t('cronjob.operate.executor')}>
                                <Select value={form.executor} style={{ width: 200 }} allowCreate optionList={EXECUTORS.map((e) => ({ label: e, value: e }))} onChange={(v) => set({ executor: String(v) })} />
                            </Field>
                        )}
                        <Field label={t('cronjob.operate.shellContent')}>
                            <RadioGroup value={form.scriptMode} onChange={(e) => set({ scriptMode: String(e.target.value), script: '', scriptID: undefined })}>
                                <Radio value="input">{t('cronjob.operate.scriptInput')}</Radio>
                                <Radio value="library">{t('cronjob.operate.scriptLibrary')}</Radio>
                                <Radio value="select">{t('cronjob.operate.scriptSelect')}</Radio>
                            </RadioGroup>
                        </Field>
                        {form.scriptMode === 'input' && (
                            <TextArea value={form.script} onChange={(v) => set({ script: v })} rows={8} placeholder="#!/bin/bash" />
                        )}
                        {form.scriptMode === 'library' && (
                            <Select
                                filter
                                value={form.scriptID}
                                style={{ width: '100%' }}
                                placeholder={t('cronjob.operate.scriptLibrary')}
                                optionList={(scripts?.items ?? []).map((s) => ({ label: s.name, value: s.id }))}
                                onChange={(v) => set({ scriptID: Number(v) })}
                            />
                        )}
                        {form.scriptMode === 'select' && <Input value={form.script} onChange={(v) => set({ script: v })} placeholder="/tmp/test.sh" />}
                    </div>
                )}

                {/* 备份 */}
                {showBackup && (
                    <div style={{ border: '1px solid var(--semi-color-border)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Space wrap>
                            <Field label={t('cronjob.operate.retainCopies')}>
                                <InputNumber value={form.retainCopies} min={1} onChange={(v) => set({ retainCopies: Number(v ?? 1) })} style={{ width: 140 }} />
                            </Field>
                            {form.type !== 'database' && (
                                <Field label={t('cronjob.operate.secret')}>
                                    <Input mode="password" value={form.secret} onChange={(v) => set({ secret: v })} style={{ width: 200 }} />
                                </Field>
                            )}
                        </Space>
                        <Text size="small" type="tertiary">
                            {t('cronjob.operate.backupHelper')}
                        </Text>
                    </div>
                )}

                {showExclusion && (
                    <Field label={t('cronjob.operate.exclude')}>
                        <Select
                            multiple
                            filter
                            allowCreate
                            value={form.ignoreFiles}
                            style={{ width: '100%' }}
                            placeholder={t('cronjob.operate.excludeHelper')}
                            optionList={[]}
                            onChange={(v) => set({ ignoreFiles: v as string[] })}
                        />
                    </Field>
                )}

                {showExclusion && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <Switch checked={form.ignoreErr} onChange={(v) => set({ ignoreErr: v })} size="small" />
                        <Text size="small">{t('cronjob.operate.ignoreErr')}</Text>
                    </label>
                )}

                {!loaded && (
                    <Tag color="blue">{t('common.loading')}</Tag>
                )}
            </div>

            <Modal title={t('cronjob.operate.nextTime')} visible={preview != null} footer={null} onCancel={() => setPreview(null)}>
                {previewTimes.length === 0 ? (
                    <Text type="tertiary">{t('cronjob.operate.previewEmpty')}</Text>
                ) : (
                    <Space vertical align="start">
                        {previewTimes.map((time, i) => (
                            <Text key={i}>{time}</Text>
                        ))}
                    </Space>
                )}
            </Modal>
        </SideSheet>
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
