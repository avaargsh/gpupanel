import { Banner, Card, Spin, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useGetNginxStatusQuery, type NginxStatus } from '@/api/openrestyApi';
import { errText } from '@/pages/toolbox/shared';

const { Text, Title } = Typography;

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
        return <Banner type="info" closeIcon={null} title={t('openresty.statusNotRunning')} />;
    }
    if (query.isError) {
        return <Banner type="danger" closeIcon={null} title={errText(query.error)} />;
    }

    return (
        <Spin spinning={query.isLoading}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {COUNTERS.map((c) => (
                    <Card key={c.key} bodyStyle={{ padding: 16 }}>
                        <Text size="small" type="tertiary">
                            {t(c.label)}
                        </Text>
                        <div style={{ marginTop: 6 }}>
                            <Title heading={3} style={{ margin: 0 }}>
                                {query.data?.[c.key] ?? 0}
                            </Title>
                        </div>
                    </Card>
                ))}
            </div>
        </Spin>
    );
}
