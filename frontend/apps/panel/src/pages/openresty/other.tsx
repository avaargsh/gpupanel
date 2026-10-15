import { useEffect, useState } from 'react';
import { Banner, Button, Spin, Switch, Toast } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useGetNginxHttpsQuery, useOperateNginxHttpsMutation } from '@/api/openrestyApi';
import { errText, Field } from '@/pages/toolbox/shared';

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
            await operate({ operate: enable ? 'enable' : 'disable', sslRejectHandshake: rejectHandshake }).unwrap();
            Toast.success(t('openresty.saveSuccess'));
            query.refetch();
        } catch (e) {
            Toast.error(errText(e));
            query.refetch();
        }
    };

    if (!query.isLoading && query.isError) {
        return <Banner type="danger" closeIcon={null} title={errText(query.error)} />;
    }

    return (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label={t('openresty.other.defaultHttps')} help={t('openresty.other.defaultHttpsHelper')}>
                <Switch checked={enable} onChange={setEnable} disabled={query.isLoading} />
            </Field>
            <Field label={t('openresty.other.sslRejectHandshake')} help={t('openresty.other.sslRejectHandshakeHelper')}>
                <Switch checked={rejectHandshake} onChange={setRejectHandshake} disabled={query.isLoading} />
            </Field>
            <div>
                <Button theme="solid" type="primary" onClick={submit} loading={saving} disabled={query.isLoading}>
                    {t('common.confirm')}
                </Button>
            </div>
        </div>
    );
}
