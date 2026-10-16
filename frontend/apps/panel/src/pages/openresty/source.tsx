import { useGetAppDefaultConfigMutation, useGetNginxFileQuery, useUpdateNginxFileMutation } from '@/api/openrestyApi';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { errText } from '@/pages/toolbox/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
            const res = await loadDefault({
                type: 'openresty',
                name: '',
            }).unwrap();
            setContent(typeof res === 'string' ? res : String(res ?? ''));
            setUseDefault(true);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const onSave = async () => {
        try {
            await saveFile({ content, backup: useDefault }).unwrap();
            toast.success(t('common.confirm'));
            setUseDefault(false);
            fileQuery.refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <div className="flex flex-col gap-3">
            {fileQuery.isLoading ? <Spinner /> : null}
            {fileQuery.isError ? (
                <Alert variant="destructive">
                    <AlertTitle>{errText(fileQuery.error)}</AlertTitle>
                </Alert>
            ) : null}
            <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={16}
                aria-label={t('openresty.tabs.source')}
                placeholder={fileQuery.isLoading ? t('common.loading') : ''}
                style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
            />
            <div className="flex flex-wrap gap-3">
                <Button onClick={onLoadDefault} disabled={loadingDefault || fileQuery.isLoading}>
                    {t('openresty.defaultConfig')}
                </Button>
                <Button onClick={onSave} disabled={saving || fileQuery.isLoading}>
                    {t('common.confirm')}
                </Button>
                <Button onClick={() => fileQuery.refetch()}>{t('common.refresh')}</Button>
            </div>
            {useDefault ? (
                <Alert>
                    <AlertTitle>{t('openresty.defaultConfigHelper')}</AlertTitle>
                </Alert>
            ) : null}
        </div>
    );
}
