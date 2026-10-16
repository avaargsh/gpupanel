import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    getAppIconUrl,
    useGetAppByKeyQuery,
    useGetAppTagsQuery,
    useSearchAppsQuery,
    useSyncLocalAppsMutation,
    type AppItem,
} from '@/api/appApi';
import { readPendingAppInstall } from '@/utils/app-install-pending';
import { useAppSelector } from '@/store/hooks';
import InstallModal, { newInstallTaskID } from './InstallModal';
import { useDebouncedValue } from '@/pages/database/shared';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
const uuid = newInstallTaskID;
function AppDetailSheet({ appKey, onClose, onInstall }: { appKey: string; onClose: () => void; onInstall: (key: string) => void }) {
    const { t } = useTranslation();
    const { data: app } = useGetAppByKeyQuery(appKey);
    return (
        <Sheet
            open={true}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent aria-describedby={undefined} className="overflow-y-auto" style={{ maxWidth: 560 }}>
                <SheetHeader>
                    <SheetTitle>{t('apps.detail.title')}</SheetTitle>
                </SheetHeader>
                {!app ? (
                    <Spinner role="status" aria-label="Loading" />
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <img
                                src={getAppIconUrl(app.key)}
                                alt={app.name}
                                style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain' }}
                            />
                            <div>
                                <h3 className="font-semibold text-base" style={{ margin: 0 }}>
                                    {app.name}
                                </h3>
                                <span className="text-muted-foreground text-sm">{app.author}</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span className="text-muted-foreground text-sm">{t('apps.detail.versions')}：</span>
                            {(app.versions ?? []).map((v) => (
                                <Badge key={v} variant={'secondary'}>
                                    {v}
                                </Badge>
                            ))}
                        </div>
                        <Button onClick={() => onInstall(app.key)} variant={'default'} type={'button'} disabled={app.installed}>
                            {app.installed ? t('apps.store.installed') : t('apps.actions.install')}
                        </Button>
                        {app.description ? <span className="text-sm">{app.description}</span> : null}
                        <pre
                            style={{
                                margin: 0,
                                maxHeight: 420,
                                overflow: 'auto',
                                background: 'var(--muted)',
                                padding: 12,
                                borderRadius: 6,
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {app.readme || app.description || '-'}
                        </pre>
                    </div>
                )}
            </SheetContent>
        </Sheet>
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
        if (syncingLocal || !window.confirm('扫描本地应用定义？不会安装应用。 / Scan local definitions? No application will be installed.'))
            return;
        try {
            await fn({ taskID: uuid() }).unwrap();
            toast.info('同步请求已受理 / Synchronization accepted');
            listQuery.refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    const pager = useMemo(() => {
        const total = listQuery.data?.total ?? 0;
        return { total, pages: Math.ceil(total / pageSize) };
    }, [listQuery.data?.total]);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending ? (
                <Alert>
                    <AlertDescription>
                        {
                            <Button onClick={() => setInstallKey(pending.appKey)} variant={'outline'} type={'button'}>
                                检查未核对安装 / Review unresolved install · {pending.node}
                            </Button>
                        }
                    </AlertDescription>
                </Alert>
            ) : null}
            <div className="flex flex-row flex-wrap gap-3 items-center">
                <Input
                    aria-label={t('apps.store.searchPlaceholder')}
                    value={nameInput}
                    placeholder={t('apps.store.searchPlaceholder')}
                    style={{ width: 220 }}
                    onChange={(event) => setNameInput(event.target.value)}
                />
                <Button onClick={() => setTag('')} variant={'ghost'} type={'button'}>
                    {t('apps.store.tagAll')}
                </Button>
                {tags.map((tg) => (
                    <Button
                        key={tg.key}
                        onClick={() => setTag(tg.key)}
                        variant={(tag === tg.key ? 'primary' : 'tertiary') === 'primary' ? 'default' : 'outline'}
                        type={'button'}
                    >
                        {tg.name}
                    </Button>
                ))}
                <Button onClick={() => doSync(syncLocal)} variant={'default'} type={'button'} disabled={false || syncingLocal}>
                    {syncingLocal ? <Spinner data-icon="inline-start" /> : null}
                    {t('apps.actions.syncLocal')}
                </Button>
            </div>

            <span className="text-muted-foreground text-sm">{t('apps.store.helper')}</span>

            <Alert>
                <AlertDescription>
                    {
                        '仅显示本地应用；旧版远程应用源已停用，已安装应用仍可管理。 / Local applications only; legacy remote feed retired. Installed applications remain manageable.'
                    }
                </AlertDescription>
            </Alert>
            {listQuery.isError ? (
                <Alert variant="destructive">
                    <AlertDescription>
                        {
                            <Button onClick={() => listQuery.refetch()} variant={'outline'} type={'button'}>
                                重试 / Retry
                            </Button>
                        }
                    </AlertDescription>
                </Alert>
            ) : listQuery.isFetching ? (
                <Spinner role="status" aria-label="Loading" />
            ) : apps.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t('apps.store.empty')}</span>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {apps.map((app: AppItem) => (
                        <Card key={app.key} style={{ height: '100%' }}>
                            <CardContent>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                        <img
                                            src={getAppIconUrl(app.key)}
                                            alt={app.name}
                                            style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'contain' }}
                                        />
                                        <div style={{ minWidth: 0 }}>
                                            <strong className="text-sm">{app.name}</strong>
                                            {app.installed ? (
                                                <Badge
                                                    style={{ marginLeft: 6 }}
                                                    variant={['red', 'orange'].includes('green') ? 'destructive' : 'secondary'}
                                                >
                                                    {t('apps.store.installed')}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                    <span
                                        className="text-muted-foreground text-sm"
                                        style={{
                                            minHeight: 36,
                                            WebkitLineClamp: 2,
                                            display: '-webkit-box',
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {app.description}
                                    </span>
                                    <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                                        <Button
                                            onClick={() => setInstallKey(app.key)}
                                            variant={'default'}
                                            size="sm"
                                            type={'button'}
                                            disabled={app.installed}
                                        >
                                            {app.installed ? t('apps.store.installed') : t('apps.actions.install')}
                                        </Button>
                                        <Button onClick={() => setDetailKey(app.key)} variant={'ghost'} size="sm" type={'button'}>
                                            {t('apps.actions.detail')}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {pager.pages > 1 && (
                <div className="flex flex-row  gap-3 items-center">
                    <Button onClick={() => setPage((p) => p - 1)} variant={'outline'} type={'button'} disabled={page <= 1}>
                        ‹
                    </Button>
                    <span className="text-sm">
                        {page}/ {pager.pages}
                    </span>
                    <Button onClick={() => setPage((p) => p + 1)} variant={'outline'} type={'button'} disabled={page >= pager.pages}>
                        ›
                    </Button>
                </div>
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
