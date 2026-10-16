import { useGetHTTPSConfigQuery, useSearchSSLQuery, useUpdateHTTPSConfigMutation } from '@/api/websiteApi';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckLine } from './check-line';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const ALGORITHMS = ['RSA', 'ECC'];
const TLS_PROTOCOLS = ['TLSv1.2', 'TLSv1.3'];
const HTTP_CONFIGS = [
    { value: 'HTTPSOnly', labelKey: 'website.https.httpConfigHTTPSOnly' },
    { value: 'HTTPAlso', labelKey: 'website.https.httpConfigHTTPAlso' },
    { value: 'HTTPToHTTPS', labelKey: 'website.https.httpConfigHTTPToHTTPS' },
] as const;

export function HttpsTab({ id }: { id: number }) {
    const { t } = useTranslation();
    const { data: cfg } = useGetHTTPSConfigQuery(id);
    const { data: sslPage } = useSearchSSLQuery({ page: 1, pageSize: 100, name: '' });
    const [update, { isLoading }] = useUpdateHTTPSConfigMutation();
    const [enable, setEnable] = useState(false);
    const [sslId, setSslId] = useState<number | undefined>();
    const [httpConfig, setHttpConfig] = useState('HTTPSOnly');
    const [protocols, setProtocols] = useState<string[]>(['TLSv1.2', 'TLSv1.3']);
    const [algorithm, setAlgorithm] = useState('RSA');
    const [http3, setHttp3] = useState(false);

    useEffect(() => {
        if (cfg) {
            setEnable(cfg.enable);
            setSslId(cfg.SSL?.id);
            setHttpConfig(cfg.httpConfig || 'HTTPSOnly');
            setProtocols(cfg.SSLProtocol?.length ? cfg.SSLProtocol : ['TLSv1.2', 'TLSv1.3']);
            setAlgorithm(cfg.algorithm || 'RSA');
            setHttp3(cfg.http3);
        }
    }, [cfg]);

    const submit = () =>
        update({
            websiteId: id,
            enable,
            websiteSSLId: sslId,
            type: 'existed',
            httpConfig,
            SSLProtocol: protocols,
            algorithm,
            http3,
        })
            .unwrap()
            .then(() => toast.success(t('website.https.success')))
            .catch((e) => toast.error(errText(e)));

    const certItems = sslPage?.items ?? [];

    const toggleProtocol = (protocol: string, on: boolean) => {
        setProtocols((prev) =>
            on ? Array.from(new Set([...prev, protocol])) : prev.filter((item) => item !== protocol),
        );
    };

    return (
        <div className="flex max-w-[520px] flex-col gap-4">
            <CheckLine checked={enable} onChange={setEnable} label={t('website.https.enable')} />

            <Field>
                <FieldLabel htmlFor="website-https-cert">{t('website.https.cert')}</FieldLabel>
                <NativeSelect
                    id="website-https-cert"
                    value={sslId ? String(sslId) : ''}
                    onChange={(e) => setSslId(e.target.value ? Number(e.target.value) : undefined)}
                >
                    <NativeSelectOption value="">
                        {certItems.length ? t('website.https.certPlaceholder') : t('website.https.noCert')}
                    </NativeSelectOption>
                    {certItems.map((cert) => (
                        <NativeSelectOption key={cert.id} value={String(cert.id)}>
                            {`${cert.primaryDomain || cert.domains} (${cert.expireDate || '-'})`}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </Field>

            <Field>
                <FieldLabel htmlFor="website-https-http-config">{t('website.https.httpConfig')}</FieldLabel>
                <NativeSelect
                    id="website-https-http-config"
                    value={httpConfig}
                    onChange={(e) => setHttpConfig(e.target.value)}
                >
                    {HTTP_CONFIGS.map((option) => (
                        <NativeSelectOption key={option.value} value={option.value}>
                            {t(option.labelKey)}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </Field>

            <Field>
                <FieldLabel>{t('website.https.protocol')}</FieldLabel>
                <div className="flex flex-wrap gap-4">
                    {TLS_PROTOCOLS.map((protocol) => (
                        <CheckLine
                            key={protocol}
                            checked={protocols.includes(protocol)}
                            onChange={(on) => toggleProtocol(protocol, on)}
                            label={protocol}
                        />
                    ))}
                </div>
            </Field>

            <Field>
                <FieldLabel htmlFor="website-https-algorithm">{t('website.https.algorithm')}</FieldLabel>
                <NativeSelect
                    id="website-https-algorithm"
                    value={algorithm}
                    onChange={(e) => setAlgorithm(e.target.value)}
                >
                    {ALGORITHMS.map((option) => (
                        <NativeSelectOption key={option} value={option}>
                            {option}
                        </NativeSelectOption>
                    ))}
                </NativeSelect>
            </Field>

            <CheckLine checked={http3} onChange={setHttp3} label={t('website.https.http3')} />

            <div>
                <Button disabled={isLoading} onClick={submit}>
                    {isLoading ? <Spinner data-icon="inline-start" /> : null}
                    {t('website.https.save')}
                </Button>
            </div>
        </div>
    );
}
