import {
    useCreateDomainMutation,
    useDeleteDomainMutation,
    useListDomainsQuery,
    useUpdateDomainMutation,
} from '@/api/websiteApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckLine } from './check-line';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

export function DomainsTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const { data: domains = [] } = useListDomainsQuery(id);
    const [create, { isLoading }] = useCreateDomainMutation();
    const [update] = useUpdateDomainMutation();
    const [remove] = useDeleteDomainMutation();
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [port, setPort] = useState(80);
    const [ssl, setSsl] = useState(false);

    const submit = async () => {
        const list = input
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean);
        if (!list.length) return;
        try {
            await create({ websiteID: id, domains: list.map((domain) => ({ domain, port, ssl })) }).unwrap();
            toast.success(t('website.domains.success'));
            setOpen(false);
            setInput('');
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const toggleSsl = (domain: { id: number; ssl: boolean }) => {
        update({ id: domain.id, ssl: !domain.ssl })
            .unwrap()
            .then(() => toast.success(t('website.domains.success')))
            .catch((e) => toast.error(errText(e)));
    };

    const removeDomain = (domainID: number) => {
        remove({ id: domainID })
            .unwrap()
            .then(() => toast.success(t('website.domains.success')))
            .catch((e) => toast.error(errText(e)));
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <Button onClick={() => setOpen(true)}>
                    <PlusIcon data-icon="inline-start" />
                    {t('website.domains.add')}
                </Button>
            </div>

            <Table>
                <caption className="sr-only">{t('website.domains.title')}</caption>
                <TableHeader>
                    <TableRow>
                        <TableHead>{t('website.domains.domain')}</TableHead>
                        <TableHead className="w-[100px]">{t('website.domains.port')}</TableHead>
                        <TableHead className="w-[120px]">{t('website.domains.ssl')}</TableHead>
                        <TableHead className="w-[120px]">{t('website.domains.operate')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {domains.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                                {t('website.domains.empty')}
                            </TableCell>
                        </TableRow>
                    ) : (
                        domains.map((domain) => (
                            <TableRow key={domain.id}>
                                <TableCell className="text-sm">{domain.domain}</TableCell>
                                <TableCell className="text-sm">{domain.port}</TableCell>
                                <TableCell>
                                    <Switch
                                        size="sm"
                                        aria-label={`${t('website.domains.ssl')} ${domain.domain}`}
                                        checked={domain.ssl}
                                        onCheckedChange={() => toggleSsl(domain)}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => removeDomain(domain.id)}
                                    >
                                        {t('website.actions.delete')}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('website.domains.addTitle')}</DialogTitle>
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
                                <FieldLabel htmlFor="website-domain-list">{t('website.domains.domains')}</FieldLabel>
                                <Input
                                    id="website-domain-list"
                                    value={input}
                                    placeholder={t('website.domains.domainsPlaceholder')}
                                    onChange={(e) => setInput(e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="website-domain-port">{t('website.domains.port')}</FieldLabel>
                                <Input
                                    id="website-domain-port"
                                    type="number"
                                    min={1}
                                    max={65535}
                                    value={String(port)}
                                    onChange={(e) => setPort(Number(e.target.value) || 80)}
                                />
                            </Field>
                            <CheckLine checked={ssl} onChange={setSsl} label={t('website.domains.sslEnable')} />
                        </FieldGroup>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
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
        </div>
    );
}
