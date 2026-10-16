import { useGetNginxStatusQuery, type NginxStatus } from '@/api/openrestyApi';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { errText } from '@/pages/toolbox/shared';
import { useTranslation } from 'react-i18next';

const COUNTERS: { key: keyof NginxStatus; label: string }[] = [
    { key: 'active', label: 'openresty.status.active' },
    { key: 'accepts', label: 'openresty.status.accepts' },
    { key: 'handled', label: 'openresty.status.handled' },
    { key: 'requests', label: 'openresty.status.requests' },
    { key: 'reading', label: 'openresty.status.reading' },
    { key: 'writing', label: 'openresty.status.writing' },
    { key: 'waiting', label: 'openresty.status.waiting' },
];

export default function StatusTab({ running }: { running: boolean }) {
    const { t } = useTranslation();
    const query = useGetNginxStatusQuery(undefined, {
        skip: !running,
        pollingInterval: running ? 5000 : 0,
        refetchOnMountOrArgChange: true,
    });

    if (!running) {
        return (
            <Alert>
                <AlertTitle>{t('openresty.statusNotRunning')}</AlertTitle>
            </Alert>
        );
    }
    if (query.isError) {
        return (
            <Alert variant="destructive">
                <AlertTitle>{errText(query.error)}</AlertTitle>
                <Button variant="outline" onClick={() => query.refetch()}>
                    {t('common.retry')}
                </Button>
            </Alert>
        );
    }

    if (query.isLoading) return <Spinner />;
    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {COUNTERS.map((c) => (
                <Card key={c.key}>
                    <CardHeader>
                        <CardTitle>{t(c.label)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">{query.data?.[c.key] ?? '—'}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
