import {
    useChangePHPVersionMutation,
    useGetDirConfigQuery,
    useGetWebsiteQuery,
    useSearchRuntimesQuery,
    useUpdateWebsiteDirMutation,
    useUpdateWebsiteDirPermissionMutation,
} from '@/api/websiteApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Descriptions } from '../container/descriptions';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export function BasicTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const { data: site } = useGetWebsiteQuery(id);
    const { data: dirConfig } = useGetDirConfigQuery({ id });
    const [updateDir, { isLoading: savingDir }] = useUpdateWebsiteDirMutation();
    const [updatePerm, { isLoading: savingPerm }] = useUpdateWebsiteDirPermissionMutation();
    const [changePhp, { isLoading: changingPhp }] = useChangePHPVersionMutation();
    const [siteDir, setSiteDir] = useState('');
    const [user, setUser] = useState('');
    const [group, setGroup] = useState('');

    useEffect(() => {
        if (site) setSiteDir(site.siteDir || '');
    }, [site]);
    useEffect(() => {
        if (dirConfig) {
            setUser(dirConfig.user || '');
            setGroup(dirConfig.userGroup || '');
        }
    }, [dirConfig]);

    const { data: runtimes } = useSearchRuntimesQuery({ page: 1, pageSize: 100, name: '', type: 'php' });
    const runtimeItems = runtimes?.items ?? [];

    const saveDir = () =>
        updateDir({ id, siteDir })
            .unwrap()
            .then(() => toast.success(t('website.basic.dirSuccess')))
            .catch((e) => toast.error(errText(e)));

    const savePerm = () =>
        updatePerm({ id, user, group })
            .unwrap()
            .then(() => toast.success(t('website.basic.permissionSuccess')))
            .catch((e) => toast.error(errText(e)));

    const savePhp = (runtimeID: number) =>
        changePhp({ websiteID: id, runtimeID })
            .unwrap()
            .then(() => toast.success(t('website.basic.phpSuccess')))
            .catch((e) => toast.error(errText(e)));

    return (
        <div className="flex max-w-[640px] flex-col gap-4">
            <Descriptions
                data={[
                    { key: t('website.basic.type'), value: site ? t(`website.type.${site.type}`) : '-' },
                    { key: t('website.basic.sitePath'), value: site?.sitePath || '-' },
                    { key: t('website.basic.runUser'), value: site?.user || '-' },
                    { key: t('website.basic.runGroup'), value: site?.group || '-' },
                    { key: t('website.basic.expireDate'), value: site?.expireDate || '-' },
                ]}
            />

            <Card>
                <CardHeader>
                    <CardTitle>{t('website.basic.siteDir')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void saveDir();
                        }}
                    >
                        <Field className="min-w-[240px] flex-1">
                            <FieldLabel htmlFor="website-site-dir">{t('website.basic.siteDir')}</FieldLabel>
                            <Input id="website-site-dir" value={siteDir} onChange={(e) => setSiteDir(e.target.value)} />
                        </Field>
                        <Button type="submit" disabled={savingDir}>
                            {savingDir ? <Spinner data-icon="inline-start" /> : null}
                            {t('website.basic.saveDir')}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('website.basic.permission')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void savePerm();
                        }}
                    >
                        <Field className="w-[220px]">
                            <FieldLabel htmlFor="website-run-user">{t('website.basic.user')}</FieldLabel>
                            <Input id="website-run-user" value={user} onChange={(e) => setUser(e.target.value)} />
                        </Field>
                        <Field className="w-[220px]">
                            <FieldLabel htmlFor="website-run-group">{t('website.basic.group')}</FieldLabel>
                            <Input id="website-run-group" value={group} onChange={(e) => setGroup(e.target.value)} />
                        </Field>
                        <Button type="submit" disabled={savingPerm}>
                            {savingPerm ? <Spinner data-icon="inline-start" /> : null}
                            {t('website.basic.savePermission')}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('website.basic.php')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Field className="max-w-[300px]">
                        <FieldLabel htmlFor="website-php">{t('website.basic.php')}</FieldLabel>
                        <NativeSelect
                            id="website-php"
                            value={site?.runtimeID ? String(site.runtimeID) : ''}
                            disabled={changingPhp}
                            onChange={(e) => {
                                if (e.target.value) void savePhp(Number(e.target.value));
                            }}
                        >
                            <NativeSelectOption value="">
                                {runtimeItems.length ? t('website.basic.phpPlaceholder') : t('website.basic.noRuntime')}
                            </NativeSelectOption>
                            {runtimeItems.map((runtime) => (
                                <NativeSelectOption key={runtime.id} value={String(runtime.id)}>
                                    {`${runtime.name} ${runtime.version ?? ''}`.trim()}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </Field>
                </CardContent>
            </Card>
        </div>
    );
}
