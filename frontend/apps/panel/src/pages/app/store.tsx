import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
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
            <SheetContent aria-describedby={undefined} className="overflow-y-auto app-detail-sheet max-w-[560px]">
                <SheetHeader>
                    <SheetTitle>{t('apps.detail.title')}</SheetTitle>
                </SheetHeader>
                {!app ? (
                    <Spinner role="status" aria-label="Loading" />
                ) : (
                    <div className="app-detail-body">
                        <div className="app-detail-header">
                            <img src={getAppIconUrl(app.key)} alt={app.name} className="app-detail-icon" />
                            <div>
                                <h3 className="font-semibold text-base m-0">
                                    {app.name}
                                </h3>
                                <span className="text-muted-foreground text-sm">{app.author}</span>
                            </div>
                        </div>
                        <div className="app-detail-versions">
                            <span className="text-muted-foreground text-sm">{t('apps.detail.versions')}：</span>
                            {(app.versions ?? []).map((v) => (
                                <Badge key={v} variant="secondary">
                                    {v}
                                </Badge>
                            ))}
                        </div>
                        <Button onClick={() => onInstall(app.key)} variant="default" type="button" disabled={app.installed}>
                            {app.installed ? t('apps.store.installed') : t('apps.actions.install')}
                        </Button>
                        {app.description ? <span className="text-sm">{app.description}</span> : null}
                        <pre className="m-0 max-h-[420px] overflow-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">{app.readme || app.description || '-'}</pre>
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
        if (syncingLocal || !window.confirm(t('apps.store.confirmSync')))
            return;
        try {
            await fn({ taskID: uuid() }).unwrap();
            toast.info(t('apps.store.syncAccepted'));
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
        <div className="app-store">
            {pending ? (
                <Alert className="app-store-pending">
                    <AlertDescription>
                        {
                            <Button onClick={() => setInstallKey(pending.appKey)} variant="outline" type="button">
                                {t('apps.store.reviewPending')} · {pending.node}
                            </Button>
                        }
                    </AlertDescription>
                </Alert>
            ) : null}
            <div className="module-toolbar">
                <Input
                    aria-label={t('apps.store.searchPlaceholder')}
                    value={nameInput}
                    placeholder={t('apps.store.searchPlaceholder')}
                    className="w-[220px]"
                    onChange={(event) => setNameInput(event.target.value)}
                />
                <Button onClick={() => setTag('')} variant="ghost" type="button">
                    {t('apps.store.tagAll')}
                </Button>
                {tags.map((tg) => (
                    <Button
                        key={tg.key}
                        onClick={() => setTag(tg.key)}
                        variant={tag === tg.key ? 'default' : 'outline'}
                        type="button"
                    >
                        {tg.name}
                    </Button>
                ))}
                <Button onClick={() => doSync(syncLocal)} variant="default" type="button" disabled={syncingLocal}>
                    {syncingLocal ? <Spinner data-icon="inline-start" /> : null}
                    {t('apps.actions.syncLocal')}
                </Button>
            </div>

            <span className="text-muted-foreground text-sm">{t('apps.store.helper')}</span>

            <Alert className="app-store-legacy-alert">
                <AlertDescription>{t('apps.store.localOnlyNote')}</AlertDescription>
            </Alert>
            {listQuery.isError ? (
                <Alert variant="destructive">
                    <AlertDescription>
                        {t('apps.store.loadFailed')}{' '}
                        <Button onClick={() => listQuery.refetch()} variant="outline" type="button">
                            {t('common.retry')}
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : listQuery.isFetching ? (
                <Spinner role="status" aria-label="Loading" />
            ) : apps.length === 0 ? (
                <span className="text-muted-foreground text-sm">{t('apps.store.empty')}</span>
            ) : (
                <div className="app-store-grid">
                    {apps.map((app: AppItem) => (
                        <Card key={app.key} className="app-store-card">
                            <CardContent className="app-store-card-content">
                                <div className="app-store-card-body">
                                    <div className="app-store-card-meta">
                                        <img src={getAppIconUrl(app.key)} alt={app.name} className="app-store-icon" />
                                        <div className="min-w-0">
                                            <strong className="text-sm">{app.name}</strong>
                                            {app.installed ? (
                                                <Badge className="ml-2" variant="secondary">
                                                    {t('apps.store.installed')}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                    <span className="text-muted-foreground text-sm app-store-description">
                                        {app.description}
                                    </span>
                                    <div className="app-store-card-actions">
                                        <Button
                                            onClick={() => setInstallKey(app.key)}
                                            variant="default"
                                            size="sm"
                                            type="button"
                                            disabled={app.installed}
                                        >
                                            {app.installed ? t('apps.store.installed') : t('apps.actions.install')}
                                        </Button>
                                        <Button onClick={() => setDetailKey(app.key)} variant="ghost" size="sm" type="button">
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
                <div className="flex flex-row items-center gap-3">
                    <Button
                        onClick={() => setPage((p) => p - 1)}
                        variant="outline"
                        size="icon-sm"
                        aria-label="Previous page"
                        type="button"
                        disabled={page <= 1}
                    >
                        <ChevronLeftIcon />
                    </Button>
                    <span className="text-muted-foreground text-sm tabular-nums">
                        {page} / {pager.pages}
                    </span>
                    <Button
                        onClick={() => setPage((p) => p + 1)}
                        variant="outline"
                        size="icon-sm"
                        aria-label="Next page"
                        type="button"
                        disabled={page >= pager.pages}
                    >
                        <ChevronRightIcon />
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
