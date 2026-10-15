import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Card, Input, Modal, Select, SideSheet, Space, Spin, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    getAppIconUrl,
    useGetAppByKeyQuery,
    useGetAppDetailQuery,
    useGetAppTagsQuery,
    useSearchAppsQuery,
    useSyncLocalAppsMutation,
    type AppItem,
} from '@/api/appApi';
import { readPendingAppInstall } from '@/utils/app-install-pending';
import { useAppSelector } from '@/store/hooks';
import InstallModal, { newInstallTaskID } from './InstallModal';
import { useDebouncedValue } from '@/pages/database/shared';

const { Text, Title } = Typography;

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);
const uuid = newInstallTaskID;

function AppDetailSheet({ appKey, onClose, onInstall }: { appKey: string; onClose: () => void; onInstall: (key: string) => void }) {
    const { t } = useTranslation();
    const { data: app } = useGetAppByKeyQuery(appKey);
    return (
        <SideSheet title={t('apps.detail.title')} visible onCancel={onClose} width={560}>
            {!app ? (
                <Spin />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <img src={getAppIconUrl(app.key)} alt={app.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain' }} />
                        <div>
                            <Title heading={5} style={{ margin: 0 }}>{app.name}</Title>
                            <Text type="tertiary" size="small">{app.author}</Text>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Text size="small" type="tertiary">{t('apps.detail.versions')}：</Text>
                        {(app.versions ?? []).map((v) => <Tag key={v}>{v}</Tag>)}
                    </div>
                    <Button type="primary" onClick={() => onInstall(app.key)} disabled={app.installed}>
                        {app.installed ? t('apps.store.installed') : t('apps.actions.install')}
                    </Button>
                    {app.description ? <Text>{app.description}</Text> : null}
                    <pre style={{ margin: 0, maxHeight: 420, overflow: 'auto', background: 'var(--semi-color-fill-0)', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                        {app.readme || app.description || '-'}
                    </pre>
                </div>
            )}
        </SideSheet>
    );
}

export default function AppStoreTab() {
    const { t } = useTranslation();
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const pending = readPendingAppInstall();
    const [page, setPage] = useState(1);
    const pageSize = 30;
    const [nameInput, setNameInput] = useState('');
    const name = useDebouncedValue(nameInput);
    const [tag, setTag] = useState('');
    const [installKey, setInstallKey] = useState<string | null>(null);
    const [detailKey, setDetailKey] = useState<string | null>(null);

    useEffect(() => {
        setPage(1);
    }, [name, tag]);

    const tagsQuery = useGetAppTagsQuery();
    const tags = tagsQuery.data ?? [];
    const listQuery = useSearchAppsQuery({ page, pageSize, name, tags: tag ? [tag] : [], resource: 'local', showCurrentArch: false });
    const apps = listQuery.currentData?.items ?? [];

    const [syncLocal, { isLoading: syncingLocal }] = useSyncLocalAppsMutation();

    const doSync = async (fn: typeof syncLocal) => {
        if (syncingLocal || !window.confirm('扫描本地应用定义？不会安装应用。 / Scan local definitions? No application will be installed.')) return;
        try {
            await fn({ taskID: uuid() }).unwrap();
            Toast.info('同步请求已受理 / Synchronization accepted');
            listQuery.refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const pager = useMemo(() => {
        const total = listQuery.data?.total ?? 0;
        return { total, pages: Math.ceil(total / pageSize) };
    }, [listQuery.data?.total]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending ? <Banner type="warning" description={<Button onClick={() => setInstallKey(pending.appKey)}>检查未核对安装 / Review unresolved install · {pending.node}</Button>} /> : null}
            <Space wrap>
                <Input placeholder={t('apps.store.searchPlaceholder')} value={nameInput} onChange={setNameInput} style={{ width: 220 }} showClear />
                <Button
                    theme={tag === '' ? 'solid' : 'borderless'}
                    type="primary"
                    onClick={() => setTag('')}
                >
                    {t('apps.store.tagAll')}
                </Button>
                {tags.map((tg) => (
                    <Button key={tg.key} theme={tag === tg.key ? 'solid' : 'borderless'} type={tag === tg.key ? 'primary' : 'tertiary'} onClick={() => setTag(tg.key)}>
                        {tg.name}
                    </Button>
                ))}
                <Button type="primary" theme="light" loading={syncingLocal} onClick={() => doSync(syncLocal)}>
                    {t('apps.actions.syncLocal')}
                </Button>
            </Space>

            <Text type="tertiary" size="small">{t('apps.store.helper')}</Text>

            <Banner type="info" description="仅显示本地应用；旧版远程应用源已停用，已安装应用仍可管理。 / Local applications only; legacy remote feed retired. Installed applications remain manageable." />
            {listQuery.isError ? <Banner type="danger" description={<Button onClick={() => listQuery.refetch()}>重试 / Retry</Button>} /> : listQuery.isFetching ? (
                <Spin />
            ) : apps.length === 0 ? (
                <Text type="tertiary">{t('apps.store.empty')}</Text>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {apps.map((app: AppItem) => (
                        <Card key={app.key} shadows="hover" style={{ height: '100%' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <img src={getAppIconUrl(app.key)} alt={app.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }} />
                                    <div style={{ minWidth: 0 }}>
                                        <Text strong ellipsis={{ showTooltip: true }}>{app.name}</Text>
                                        {app.installed ? <Tag color="green" size="small" style={{ marginLeft: 6 }}>{t('apps.store.installed')}</Tag> : null}
                                    </div>
                                </div>
                                <Text size="small" type="tertiary" style={{ minHeight: 36, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {app.description}
                                </Text>
                                <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                                    <Button size="small" type="primary" disabled={app.installed} onClick={() => setInstallKey(app.key)}>
                                        {app.installed ? t('apps.store.installed') : t('apps.actions.install')}
                                    </Button>
                                    <Button size="small" theme="borderless" onClick={() => setDetailKey(app.key)}>
                                        {t('apps.actions.detail')}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {pager.pages > 1 && (
                <Space>
                    <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</Button>
                    <Text size="small">{page} / {pager.pages}</Text>
                    <Button disabled={page >= pager.pages} onClick={() => setPage((p) => p + 1)}>›</Button>
                </Space>
            )}

            {installKey && <InstallModal key={`${node}:${installKey}`} appKey={installKey} onClose={() => setInstallKey(null)} />}
            {detailKey && (
                <AppDetailSheet
                    appKey={detailKey}
                    onClose={() => setDetailKey(null)}
                    onInstall={(key) => {
                        setDetailKey(null);
                        setInstallKey(key);
                    }}
                />
            )}
        </div>
    );
}
