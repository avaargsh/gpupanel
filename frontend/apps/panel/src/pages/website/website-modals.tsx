import {
    useCreateWebsiteMutation,
    useDeleteWebsiteMutation,
    type GroupInfo,
    type WebsiteCreate,
    type WebsiteRes,
} from '@/api/websiteApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckLine } from './check-line';

const TYPES = ['deployment', 'runtime', 'static', 'proxy', 'subsite', 'stream'];
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS_VARIANT: Record<string, BadgeVariant> = {
    running: 'default',
    stopped: 'secondary',
    creating: 'outline',
};

export function CreateWebsiteModal({
    open,
    groups,
    onOpenChange,
}: {
    open: boolean;
    groups: GroupInfo[];
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const [create, { isLoading }] = useCreateWebsiteMutation();
    const [type, setType] = useState('static');
    const [groupId, setGroupId] = useState(groups[0]?.id ?? 1);
    const [alias, setAlias] = useState('');
    const [primaryDomain, setPrimaryDomain] = useState('');
    const [domains, setDomains] = useState('');
    const [remark, setRemark] = useState('');
    const [siteDir, setSiteDir] = useState('');
    const [ipv6, setIpv6] = useState(false);

    useEffect(() => {
        if (open) {
            setType('static');
            setGroupId(groups[0]?.id ?? 1);
            setAlias('');
            setPrimaryDomain('');
            setDomains('');
            setRemark('');
            setSiteDir('');
            setIpv6(false);
        }
    }, [open, groups]);

    const submit = async () => {
        if (!alias.trim()) {
            toast.error(t('website.create.aliasRequired'));
            return;
        }
        if (!primaryDomain.trim()) {
            toast.error(t('website.create.primaryDomainRequired'));
            return;
        }
        const domainList = [
            { domain: primaryDomain.trim(), port: 80, ssl: false },
            ...domains
                .split(',')
                .map((d) => d.trim())
                .filter(Boolean)
                .map((domain) => ({ domain, port: 80, ssl: false })),
        ];
        const payload: WebsiteCreate = {
            type,
            alias: alias.trim(),
            remark: remark.trim(),
            appType: 'new',
            webSiteGroupID: groupId,
            IPV6: ipv6,
            domains: domainList,
            siteDir: siteDir.trim(),
        };
        try {
            await create(payload).unwrap();
            toast.success(t('website.create.success'));
            onOpenChange(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('website.create.title')}</DialogTitle>
                </DialogHeader>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                    }}
                >
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="website-create-type">{t('website.create.type')}</FieldLabel>
                            <NativeSelect
                                id="website-create-type"
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                            >
                                {TYPES.map((option) => (
                                    <NativeSelectOption key={option} value={option}>
                                        {t(`website.type.${option}`)}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="website-create-group">{t('website.create.group')}</FieldLabel>
                            <NativeSelect
                                id="website-create-group"
                                value={String(groupId)}
                                onChange={(e) => setGroupId(Number(e.target.value))}
                            >
                                {groups.map((g) => (
                                    <NativeSelectOption key={g.id} value={String(g.id)}>
                                        {g.name}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="website-create-alias">{t('website.create.alias')}</FieldLabel>
                            <Input id="website-create-alias" value={alias} onChange={(e) => setAlias(e.target.value)} />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="website-create-domain">{t('website.create.primaryDomain')}</FieldLabel>
                            <Input
                                id="website-create-primary"
                                value={primaryDomain}
                                onChange={(e) => setPrimaryDomain(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="website-create-domains">{t('website.create.domains')}</FieldLabel>
                            <Input
                                id="website-create-domains"
                                value={domains}
                                placeholder={t('website.create.domainsPlaceholder')}
                                onChange={(e) => setDomains(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="website-create-dir">{t('website.create.siteDir')}</FieldLabel>
                            <Input
                                id="website-create-dir"
                                value={siteDir}
                                onChange={(e) => setSiteDir(e.target.value)}
                            />
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="website-create-remark">{t('website.create.remark')}</FieldLabel>
                            <Input
                                id="website-create-remark"
                                value={remark}
                                onChange={(e) => setRemark(e.target.value)}
                            />
                        </Field>
                        <CheckLine checked={ipv6} onChange={setIpv6} label={t('website.create.ipv6')} />
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? <Spinner data-icon="inline-start" /> : null}
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function DeleteWebsiteModal({ target, onClose }: { target: WebsiteRes; onClose: () => void }) {
    const { t } = useTranslation();
    const [del, { isLoading }] = useDeleteWebsiteMutation();
    const [forceDelete, setForceDelete] = useState(false);
    const [deleteBackup, setDeleteBackup] = useState(false);
    const [deleteDB, setDeleteDb] = useState(false);

    const submit = async () => {
        try {
            await del({ id: target.id, deleteApp: false, deleteBackup, forceDelete, deleteDB }).unwrap();
            toast.success(t('website.delete.success'));
            onClose();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('website.delete.title')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <p className="text-sm">{t('website.delete.content', { name: target.primaryDomain })}</p>
                    <div className="flex flex-col gap-2">
                        <CheckLine checked={forceDelete} onChange={setForceDelete} label={t('website.delete.force')} />
                        <CheckLine
                            checked={deleteBackup}
                            onChange={setDeleteBackup}
                            label={t('website.delete.deleteBackup')}
                        />
                        <CheckLine checked={deleteDB} onChange={setDeleteDb} label={t('website.delete.deleteDB')} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="destructive" disabled={isLoading} onClick={submit}>
                        {isLoading ? <Spinner data-icon="inline-start" /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
