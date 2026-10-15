import { useEffect, useState } from 'react';
import {
    Button,
    Card,
    Descriptions,
    Input,
    Modal,
    Select,
    Switch,
    TabPane,
    Table,
    Tabs,
    TextArea,
    Toast,
    Typography,
} from '@douyinfe/semi-ui';
import { IconPlus } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
    useChangePHPVersionMutation,
    useCreateDomainMutation,
    useDeleteDomainMutation,
    useGetDirConfigQuery,
    useGetHTTPSConfigQuery,
    useGetRewriteConfigQuery,
    useGetWebsiteLogQuery,
    useGetWebsiteQuery,
    useListDomainsQuery,
    useOperateWebsiteLogMutation,
    useSearchRuntimesQuery,
    useSearchSSLQuery,
    useUpdateDomainMutation,
    useUpdateHTTPSConfigMutation,
    useUpdateRewriteConfigMutation,
    useUpdateWebsiteDirMutation,
    useUpdateWebsiteDirPermissionMutation,
} from '@/api/websiteApi';

const { Text } = Typography;

const ALGORITHMS = ['RSA', 'ECC'];
const TLS_PROTOCOLS = ['TLSv1.2', 'TLSv1.3'];
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

function CheckLine({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <Text size="small">{label}</Text>
        </label>
    );
}

function DomainsTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const { data: domains = [] } = useListDomainsQuery(id);
    const [create, { isLoading }] = useCreateDomainMutation();
    const [update] = useUpdateDomainMutation();
    const [remove] = useDeleteDomainMutation();
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [port, setPort] = useState(80);
    const [ssl, setSsl] = useState(false);

    const submit = async () => {
        const list = input
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean);
        if (!list.length) return;
        try {
            await create({ websiteID: id, domains: list.map((domain) => ({ domain, port, ssl })) }).unwrap();
            Toast.success(t('website.domains.success'));
            setOpen(false);
            setInput('');
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const columns = [
        { title: t('website.domains.domain'), dataIndex: 'domain', key: 'domain' },
        { title: t('website.domains.port'), dataIndex: 'port', key: 'port', width: 100 },
        {
            title: t('website.domains.ssl'),
            dataIndex: 'ssl',
            key: 'ssl',
            width: 120,
            render: (v: boolean, row: { id: number; ssl: boolean }) => (
                <Switch
                    size="small"
                    checked={v}
                    onChange={() =>
                        update({ id: row.id, ssl: !row.ssl })
                            .unwrap()
                            .then(() => Toast.success(t('website.domains.success')))
                            .catch((e) => Toast.error(errText(e)))
                    }
                />
            ),
        },
        {
            title: t('website.domains.operate'),
            key: 'operate',
            width: 120,
            render: (_: unknown, row: { id: number }) => (
                <Button
                    size="small"
                    theme="borderless"
                    onClick={() => remove({ id: row.id }).unwrap().then(() => Toast.success(t('website.domains.success'))).catch((e) => Toast.error(errText(e)))}
                >
                    {t('website.actions.delete')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
                <Button type="primary" icon={<IconPlus />} onClick={() => setOpen(true)}>
                    {t('website.domains.add')}
                </Button>
            </div>
            <Table rowKey="id" columns={columns} dataSource={domains} pagination={false} empty={<Text type="tertiary">{t('website.domains.empty')}</Text>} />
            {open && (
                <Modal
                    title={t('website.domains.addTitle')}
                    visible
                    onCancel={() => setOpen(false)}
                    onOk={submit}
                    okText={t('common.confirm')}
                    cancelText={t('common.cancel')}
                    confirmLoading={isLoading}
                    maskClosable={false}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <Input value={input} onChange={setInput} placeholder={t('website.domains.domainsPlaceholder')} />
                        <Input type="number" value={String(port)} onChange={(v) => setPort(Number(v) || 80)} />
                        <CheckLine checked={ssl} onChange={setSsl} label={t('website.domains.sslEnable')} />
                    </div>
                </Modal>
            )}
        </div>
    );
}

function BasicTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const { data: site } = useGetWebsiteQuery(id);
    const { data: dirConfig } = useGetDirConfigQuery({ id });
    const [updateDir, { isLoading: savingDir }] = useUpdateWebsiteDirMutation();
    const [updatePerm, { isLoading: savingPerm }] = useUpdateWebsiteDirPermissionMutation();
    const [changePhp, { isLoading: changingPhp }] = useChangePHPVersionMutation();
    const [siteDir, setSiteDir] = useState('');
    const [user, setUser] = useState('');
    const [group, setGroup] = useState('');

    useEffect(() => {
        if (site) setSiteDir(site.siteDir || '');
    }, [site]);
    useEffect(() => {
        if (dirConfig) {
            setUser(dirConfig.user || '');
            setGroup(dirConfig.userGroup || '');
        }
    }, [dirConfig]);

    const { data: runtimes } = useSearchRuntimesQuery({ page: 1, pageSize: 100, name: '', type: 'php' });

    const saveDir = () =>
        updateDir({ id, siteDir })
            .unwrap()
            .then(() => Toast.success(t('website.basic.dirSuccess')))
            .catch((e) => Toast.error(errText(e)));

    const savePerm = () =>
        updatePerm({ id, user, group })
            .unwrap()
            .then(() => Toast.success(t('website.basic.permissionSuccess')))
            .catch((e) => Toast.error(errText(e)));

    const savePhp = (runtimeID: number) =>
        changePhp({ websiteID: id, runtimeID })
            .unwrap()
            .then(() => Toast.success(t('website.basic.phpSuccess')))
            .catch((e) => Toast.error(errText(e)));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            <Descriptions
                data={[
                    { key: t('website.basic.type'), value: site ? t(`website.type.${site.type}`) : '-' },
                    { key: t('website.basic.sitePath'), value: site?.sitePath || '-' },
                    { key: t('website.basic.runUser'), value: site?.user || '-' },
                    { key: t('website.basic.runGroup'), value: site?.group || '-' },
                    { key: t('website.basic.expireDate'), value: site?.expireDate || '-' },
                ]}
            />

            <Card title={t('website.basic.siteDir')}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Input value={siteDir} onChange={setSiteDir} style={{ flex: 1 }} />
                    <Button type="primary" loading={savingDir} onClick={saveDir}>
                        {t('website.basic.saveDir')}
                    </Button>
                </div>
            </Card>

            <Card title={t('website.basic.permission')}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Input value={user} onChange={setUser} prefix={t('website.basic.user')} style={{ width: 220 }} />
                    <Input value={group} onChange={setGroup} prefix={t('website.basic.group')} style={{ width: 220 }} />
                    <Button type="primary" loading={savingPerm} onClick={savePerm}>
                        {t('website.basic.savePermission')}
                    </Button>
                </div>
            </Card>

            <Card title={t('website.basic.php')}>
                <Select
                    value={site?.runtimeID || undefined}
                    placeholder={t('website.basic.phpPlaceholder')}
                    style={{ width: 300 }}
                    loading={changingPhp}
                    optionList={(runtimes?.items ?? []).map((r) => ({ label: `${r.name} ${r.version ?? ''}`.trim(), value: r.id }))}
                    onChange={(v) => savePhp(v as number)}
                    emptyContent={<Text type="tertiary">{t('website.basic.noRuntime')}</Text>}
                />
            </Card>
        </div>
    );
}

function RewriteTab({ id, websiteRewrite }: { id: number; websiteRewrite?: string }) {
    const { t } = useTranslation();
    const [name, setName] = useState(websiteRewrite || 'default');
    const [content, setContent] = useState('');
    const { data } = useGetRewriteConfigQuery({ websiteID: id, name });
    const [update, { isLoading }] = useUpdateRewriteConfigMutation();

    useEffect(() => {
        if (data) setContent(data.content ?? '');
    }, [data]);

    const save = () =>
        update({ websiteID: id, name, content })
            .unwrap()
            .then(() => Toast.success(t('website.rewrite.success')))
            .catch((e) => Toast.error(errText(e)));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Text type="tertiary">{t('website.rewrite.hint')}</Text>
            <Input value={name} onChange={setName} addonBefore={t('website.rewrite.name')} style={{ maxWidth: 320 }} />
            <TextArea value={content} onChange={setContent} autosize={{ minRows: 10, maxRows: 20 }} />
            <div>
                <Button type="primary" loading={isLoading} onClick={save}>
                    {t('website.rewrite.save')}
                </Button>
            </div>
        </div>
    );
}

function HttpsTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const { data: cfg } = useGetHTTPSConfigQuery(id);
    const { data: sslPage } = useSearchSSLQuery({ page: 1, pageSize: 100, name: '' });
    const [update, { isLoading }] = useUpdateHTTPSConfigMutation();
    const [enable, setEnable] = useState(false);
    const [sslId, setSslId] = useState<number | undefined>();
    const [httpConfig, setHttpConfig] = useState('HTTPSOnly');
    const [protocols, setProtocols] = useState<string[]>(['TLSv1.2', 'TLSv1.3']);
    const [algorithm, setAlgorithm] = useState('RSA');
    const [http3, setHttp3] = useState(false);

    useEffect(() => {
        if (cfg) {
            setEnable(cfg.enable);
            setSslId(cfg.SSL?.id);
            setHttpConfig(cfg.httpConfig || 'HTTPSOnly');
            setProtocols(cfg.SSLProtocol?.length ? cfg.SSLProtocol : ['TLSv1.2', 'TLSv1.3']);
            setAlgorithm(cfg.algorithm || 'RSA');
            setHttp3(cfg.http3);
        }
    }, [cfg]);

    const submit = () =>
        update({ websiteId: id, enable, websiteSSLId: sslId, type: 'existed', httpConfig, SSLProtocol: protocols, algorithm, http3 })
            .unwrap()
            .then(() => Toast.success(t('website.https.success')))
            .catch((e) => Toast.error(errText(e)));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
            <CheckLine checked={enable} onChange={setEnable} label={t('website.https.enable')} />
            <div>
                <Text size="small" type="tertiary">{t('website.https.cert')}</Text>
                <Select
                    value={sslId}
                    onChange={(v) => setSslId(v as number)}
                    placeholder={t('website.https.certPlaceholder')}
                    style={{ width: '100%' }}
                    optionList={(sslPage?.items ?? []).map((c) => ({ label: `${c.primaryDomain || c.domains} (${c.expireDate || '-'})`, value: c.id }))}
                    emptyContent={<Text type="tertiary">{t('website.https.noCert')}</Text>}
                />
            </div>
            <div>
                <Text size="small" type="tertiary">{t('website.https.httpConfig')}</Text>
                <Select
                    value={httpConfig}
                    onChange={(v) => setHttpConfig(v as string)}
                    style={{ width: '100%' }}
                    optionList={[
                        { label: t('website.https.httpConfigHTTPSOnly'), value: 'HTTPSOnly' },
                        { label: t('website.https.httpConfigHTTPAlso'), value: 'HTTPAlso' },
                        { label: t('website.https.httpConfigHTTPToHTTPS'), value: 'HTTPToHTTPS' },
                    ]}
                />
            </div>
            <div>
                <Text size="small" type="tertiary">{t('website.https.protocol')}</Text>
                <Select
                    multiple
                    value={protocols}
                    onChange={(v) => setProtocols(v as string[])}
                    style={{ width: '100%' }}
                    optionList={TLS_PROTOCOLS.map((p) => ({ label: p, value: p }))}
                />
            </div>
            <div>
                <Text size="small" type="tertiary">{t('website.https.algorithm')}</Text>
                <Select value={algorithm} onChange={(v) => setAlgorithm(v as string)} style={{ width: '100%' }} optionList={ALGORITHMS.map((a) => ({ label: a, value: a }))} />
            </div>
            <CheckLine checked={http3} onChange={setHttp3} label={t('website.https.http3')} />
            <div>
                <Button type="primary" loading={isLoading} onClick={submit}>
                    {t('website.https.save')}
                </Button>
            </div>
        </div>
    );
}

type LogType = 'access.log' | 'error.log';

function LogsTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const [logType, setLogType] = useState<LogType>('access.log');
    const { data } = useGetWebsiteLogQuery({ id, logType });
    const [op, { isLoading }] = useOperateWebsiteLogMutation();

    const act = (operate: string) =>
        op({ id, operate, logType })
            .unwrap()
            .then(() => Toast.success(t('website.domains.success')))
            .catch((e) => Toast.error(errText(e)));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                    value={logType}
                    onChange={(v) => setLogType(v as LogType)}
                    style={{ width: 160 }}
                    optionList={[
                        { label: t('website.logs.access'), value: 'access.log' },
                        { label: t('website.logs.error'), value: 'error.log' },
                    ]}
                />
                <Button size="small" loading={isLoading} onClick={() => act('enable')}>{t('website.logs.enable')}</Button>
                <Button size="small" loading={isLoading} onClick={() => act('disable')}>{t('website.logs.disable')}</Button>
                <Button size="small" type="danger" loading={isLoading} onClick={() => act('delete')}>{t('website.logs.delete')}</Button>
            </div>
            <pre style={{ margin: 0, maxHeight: 420, overflow: 'auto', background: 'var(--semi-color-fill-0)', padding: 12, borderRadius: 6 }}>
                {data?.content || t('website.logs.empty')}
            </pre>
        </div>
    );
}

export default function WebsiteDetailPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const params = useParams<{ id: string }>();
    const id = Number(params.id);
    const { data: site } = useGetWebsiteQuery(id, { skip: !id });

    if (!id) return <Text type="danger">Invalid website id</Text>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Button theme="borderless" onClick={() => navigate('/websites')}>
                    {t('website.tabs.list')}
                </Button>
                <Text strong>{site?.primaryDomain || `#${id}`}</Text>
            </div>
            <Tabs type="line">
                <TabPane tab={t('website.tabs.domains')} itemKey="domains">
                    <DomainsTab id={id} />
                </TabPane>
                <TabPane tab={t('website.tabs.basic')} itemKey="basic">
                    <BasicTab id={id} />
                </TabPane>
                <TabPane tab={t('website.tabs.rewrite')} itemKey="rewrite">
                    <RewriteTab id={id} websiteRewrite={site?.rewrite} />
                </TabPane>
                <TabPane tab={t('website.tabs.https')} itemKey="https">
                    <HttpsTab id={id} />
                </TabPane>
                <TabPane tab={t('website.tabs.logs')} itemKey="logs">
                    <LogsTab id={id} />
                </TabPane>
            </Tabs>
        </div>
    );
}
