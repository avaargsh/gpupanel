import { useGetNginxHttpsQuery, useOperateNginxHttpsMutation } from '@/api/openrestyApi';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { errText } from '@/pages/toolbox/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigField } from './fields';

export default function OtherTab({ running }: { running: boolean }) {
    const { t } = useTranslation();
    const query = useGetNginxHttpsQuery(undefined, { skip: !running });
    const [operate, { isLoading: saving }] = useOperateNginxHttpsMutation();
    const [enable, setEnable] = useState(false);
    const [rejectHandshake, setRejectHandshake] = useState(false);

    useEffect(() => {
        if (query.data) {
            setEnable(query.data.https);
            setRejectHandshake(query.data.sslRejectHandshake);
        }
    }, [query.data]);

    const submit = async () => {
        try {
            await operate({
                operate: enable ? 'enable' : 'disable',
                sslRejectHandshake: rejectHandshake,
            }).unwrap();
            toast.success(t('openresty.saveSuccess'));
            query.refetch();
        } catch (e) {
            toast.error(errText(e));
            query.refetch();
        }
    };

    if (!query.isLoading && query.isError) {
        return (
            <Alert variant="destructive">
                <AlertTitle>{errText(query.error)}</AlertTitle>
            </Alert>
        );
    }

    return (
        <div
            style={{
                maxWidth: 720,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
            }}
        >
            <ConfigField label={t('openresty.other.defaultHttps')} help={t('openresty.other.defaultHttpsHelper')}>
                <Switch
                    aria-label={t('openresty.other.defaultHttps')}
                    checked={enable}
                    onCheckedChange={setEnable}
                    disabled={query.isLoading || saving || !running}
                />
            </ConfigField>
            <ConfigField
                label={t('openresty.other.sslRejectHandshake')}
                help={t('openresty.other.sslRejectHandshakeHelper')}
            >
                <Switch
                    aria-label={t('openresty.other.sslRejectHandshake')}
                    checked={rejectHandshake}
                    onCheckedChange={setRejectHandshake}
                    disabled={query.isLoading || saving || !running}
                />
            </ConfigField>
            <div>
                <Button onClick={submit} disabled={saving || query.isLoading || !running}>
                    {t('common.confirm')}
                </Button>
            </div>
        </div>
    );
}
