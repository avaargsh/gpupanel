import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVmAccessQuery } from '@/api/vmAccessApi';
import { useAppSelector } from '@/store/hooks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function VmWorkbenchPage() {
    const { t } = useTranslation();
    const local = (useAppSelector(s => s.ui.currentNode) || 'local') === 'local';
    const query = useVmAccessQuery(undefined, { skip: !local, refetchOnMountOrArgChange: true });
    // Revalidation/errors must not show an old session's cached proof.
    const access = local && query.isSuccess && !query.isFetching && !query.isError
        ? query.currentData : undefined;
    return <div className="workbench" aria-label={t('vmWorkbench.title')}>
        <header className="workbench-heading">
            <div><h1>{t('vmWorkbench.title')}</h1><p>{t('vmWorkbench.description')}</p></div>
            <Badge variant="outline">{t('vmWorkbench.preview')}</Badge>
        </header>
        <Alert><AlertDescription>{t('vmWorkbench.noExecution')}</AlertDescription></Alert>
        {!local ? <Alert variant="destructive"><AlertDescription role="status">
            {t('vmWorkbench.localOnly')}
        </AlertDescription></Alert> : <Card>
            <CardHeader><CardTitle>{t('vmWorkbench.status')}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                {query.isLoading || query.isFetching ? <p role="status">{t('common.loading')}</p>
                    : query.isError || !access ? <p role="alert">{t('vmWorkbench.unavailable')}</p>
                    : <div className="space-y-2 text-sm" role="status">
                        <p>{t('vmWorkbench.connection')}: <code>{access.connection}</code></p>
                        <p>{t('vmWorkbench.identity')}: {access.identity === 'PeerObserved'
                            ? t('vmWorkbench.peerObserved', { uid: access.linuxUid })
                            : t('vmWorkbench.unbound')}</p>
                        <p>{t('vmWorkbench.authorization')}: {t('vmWorkbench.notAssessed')}</p>
                        <p className="font-medium">{t('vmWorkbench.blocked')}</p>
                    </div>}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={query.isFetching}
                        onClick={() => { void query.refetch(); }}>{t('common.refresh')}</Button>
                    <Button asChild variant="outline"><Link to="/native-principal">
                        {t('vmWorkbench.identityPage')}</Link></Button>
                </div>
            </CardContent>
        </Card>}
        <Card>
            <CardHeader><CardTitle>{t('vmWorkbench.localCli')}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
                <p>{t('vmWorkbench.cliDescription')}</p>
                <pre aria-label={t('vmWorkbench.cliCommand')}
                    className="overflow-x-auto rounded-md bg-muted p-3 text-xs">python3 scripts/gpupanel-vm.py --system list</pre>
                <p className="text-muted-foreground">{t('vmWorkbench.cliWarning')}</p>
            </CardContent>
        </Card>
    </div>;
}
