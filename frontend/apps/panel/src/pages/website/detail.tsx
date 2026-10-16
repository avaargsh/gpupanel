import {
    useGetRewriteConfigQuery,
    useGetWebsiteLogQuery,
    useGetWebsiteQuery,
    useOperateWebsiteLogMutation,
    useUpdateRewriteConfigMutation,
} from '@/api/websiteApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BasicTab } from './detail-basic';
import { DomainsTab } from './detail-domains';
import { HttpsTab } from './detail-https';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

function RewriteTab({ id, websiteRewrite }: { id: number; websiteRewrite?: string }) {
    const { t } = useTranslation();
    const [name, setName] = useState(websiteRewrite || 'default');
    const [content, setContent] = useState('');
    const { data } = useGetRewriteConfigQuery({ websiteID: id, name });
    const [update, { isLoading }] = useUpdateRewriteConfigMutation();

    useEffect(() => {
        if (data) setContent(data.content ?? '');
    }, [data]);

    const save = () =>
        update({ websiteID: id, name, content })
            .unwrap()
            .then(() => toast.success(t('website.rewrite.success')))
            .catch((e) => toast.error(errText(e)));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('website.rewrite.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{t('website.rewrite.hint')}</p>
                <Field className="max-w-[280px]">
                    <FieldLabel htmlFor="website-rewrite-name">{t('website.rewrite.name')}</FieldLabel>
                    <Input id="website-rewrite-name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Textarea
                    aria-label={t('website.rewrite.content')}
                    className="min-h-[240px] font-mono text-xs"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />
                <div>
                    <Button disabled={isLoading} onClick={save}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('website.rewrite.save')}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

type LogType = 'access.log' | 'error.log';

function LogsTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const [logType, setLogType] = useState<LogType>('access.log');
    const { data } = useGetWebsiteLogQuery({ id, logType });
    const [op, { isLoading }] = useOperateWebsiteLogMutation();

    const act = (operate: string) =>
        op({ id, operate, logType })
            .unwrap()
            .then(() => toast.success(t('website.domains.success')))
            .catch((e) => toast.error(errText(e)));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('website.logs.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <NativeSelect
                        aria-label={t('website.logs.title')}
                        className="w-[160px]"
                        value={logType}
                        onChange={(e) => setLogType(e.target.value as LogType)}
                    >
                        <NativeSelectOption value="access.log">{t('website.logs.access')}</NativeSelectOption>
                        <NativeSelectOption value="error.log">{t('website.logs.error')}</NativeSelectOption>
                    </NativeSelect>
                    <Button size="sm" variant="outline" disabled={isLoading} onClick={() => act('enable')}>
                        {t('website.logs.enable')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={isLoading} onClick={() => act('disable')}>
                        {t('website.logs.disable')}
                    </Button>
                    <Button size="sm" variant="destructive" disabled={isLoading} onClick={() => act('delete')}>
                        {t('website.logs.delete')}
                    </Button>
                </div>
                <pre className="m-0 max-h-[420px] overflow-auto rounded-md bg-muted p-3 text-xs">
                    {data?.content || t('website.logs.empty')}
                </pre>
            </CardContent>
        </Card>
    );
}

export default function WebsiteDetailPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const params = useParams<{ id: string }>();
    const id = Number(params.id);
    const { data: site } = useGetWebsiteQuery(id, { skip: !id });

    if (!id) return <span className="text-destructive">Invalid website id</span>;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <Button variant="ghost" onClick={() => navigate('/websites')}>
                    {t('website.tabs.list')}
                </Button>
                <span className="font-medium">{site?.primaryDomain || `#${id}`}</span>
            </div>

            <Tabs defaultValue="domains">
                <TabsList variant="line">
                    <TabsTrigger value="domains">{t('website.tabs.domains')}</TabsTrigger>
                    <TabsTrigger value="basic">{t('website.tabs.basic')}</TabsTrigger>
                    <TabsTrigger value="rewrite">{t('website.tabs.rewrite')}</TabsTrigger>
                    <TabsTrigger value="https">{t('website.tabs.https')}</TabsTrigger>
                    <TabsTrigger value="logs">{t('website.tabs.logs')}</TabsTrigger>
                </TabsList>
                <TabsContent value="domains" className="pt-4">
                    <DomainsTab id={id} />
                </TabsContent>
                <TabsContent value="basic" className="pt-4">
                    <BasicTab id={id} />
                </TabsContent>
                <TabsContent value="rewrite" className="pt-4">
                    <RewriteTab id={id} websiteRewrite={site?.rewrite} />
                </TabsContent>
                <TabsContent value="https" className="pt-4">
                    <HttpsTab id={id} />
                </TabsContent>
                <TabsContent value="logs" className="pt-4">
                    <LogsTab id={id} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
