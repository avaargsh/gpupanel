import { useEffect, useState } from 'react';
import { Banner, Button, Space, Spin, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useGetAppDefaultConfigMutation,
    useGetNginxFileQuery,
    useUpdateNginxFileMutation,
} from '@/api/openrestyApi';
import { errText } from '@/pages/toolbox/shared';

const { Text } = Typography;

export default function SourceTab() {
    const { t } = useTranslation();
    const fileQuery = useGetNginxFileQuery();
    const [loadDefault, { isLoading: loadingDefault }] = useGetAppDefaultConfigMutation();
    const [saveFile, { isLoading: saving }] = useUpdateNginxFileMutation();
    const [content, setContent] = useState('');
    const [useDefault, setUseDefault] = useState(false);

    useEffect(() => {
        if (fileQuery.data && !useDefault) {
            setContent(fileQuery.data.content);
        }
    }, [fileQuery.data, useDefault]);

    const onLoadDefault = async () => {
        try {
            const res = await loadDefault({ type: 'openresty', name: '' }).unwrap();
            setContent(typeof res === 'string' ? res : String(res ?? ''));
            setUseDefault(true);
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const onSave = async () => {
        try {
            await saveFile({ content, backup: useDefault }).unwrap();
            Toast.success(t('common.confirm'));
            setUseDefault(false);
            fileQuery.refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <Spin spinning={fileQuery.isLoading}>
            {fileQuery.isError ? (
                <Banner type="danger" closeIcon={null} title={errText(fileQuery.error)} style={{ marginBottom: 12 }} />
            ) : null}
            <TextArea
                value={content}
                onChange={setContent}
                autosize={{ minRows: 16, maxRows: 30 }}
                placeholder={fileQuery.isLoading ? t('common.loading') : ''}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <Space style={{ marginTop: 12 }}>
                <Button onClick={onLoadDefault} loading={loadingDefault} disabled={fileQuery.isLoading}>
                    {t('openresty.defaultConfig')}
                </Button>
                <Button theme="solid" type="primary" onClick={onSave} loading={saving} disabled={fileQuery.isLoading}>
                    {t('common.confirm')}
                </Button>
                <Button onClick={() => fileQuery.refetch()}>{t('common.refresh')}</Button>
            </Space>
            {useDefault ? (
                <Banner
                    type="info"
                    closeIcon={null}
                    style={{ marginTop: 12 }}
                    title={t('openresty.defaultConfigHelper')}
                />
            ) : null}
        </Spin>
    );
}
