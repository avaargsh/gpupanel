import {
    useGetNginxBrotliConfigQuery,
    useGetNginxConfigByScopeQuery,
    useGetNginxModulesQuery,
    useUpdateNginxConfigMutation,
    type NginxParam,
} from '@/api/openrestyApi';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { errText } from '@/pages/toolbox/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigField } from './fields';
import { parseIntParam, parseSizeParam, SIZE_KEYS, unitLabel, withUnit } from './shared';

interface PerfForm {
    server_names_hash_bucket_size: number;
    client_header_buffer_size: number;
    client_max_body_size: number;
    keepalive_timeout: number;
    gzip: string;
    gzip_min_length: number;
    gzip_comp_level: number;
    brotli: string;
    brotli_min_length: number;
    brotli_comp_level: number;
}

const DEFAULT_FORM: PerfForm = {
    server_names_hash_bucket_size: 512,
    client_header_buffer_size: 32,
    client_max_body_size: 50,
    keepalive_timeout: 60,
    gzip: 'on',
    gzip_min_length: 1,
    gzip_comp_level: 2,
    brotli: 'on',
    brotli_min_length: 1,
    brotli_comp_level: 5,
};

/** 把 scope 返回的指令参数解析进表单字段，并记录体积单位。 */
function fromParams(params: NginxParam[]): {
    values: Record<string, unknown>;
    units: Record<string, string>;
} {
    const values: Record<string, unknown> = {};
    const units: Record<string, string> = {};
    for (const p of params) {
        if (!p.params.length) continue;
        if (SIZE_KEYS.includes(p.name)) {
            const { num, unit } = parseSizeParam(p.params[0]);
            values[p.name] = num;
            units[p.name] = unit;
        } else if (p.name === 'gzip' || p.name === 'brotli') {
            values[p.name] = p.params[0];
        } else {
            values[p.name] = parseIntParam(p.params[0]);
        }
    }
    return { values, units };
}

const ON_OFF = [
    { label: 'on', value: 'on' },
    { label: 'off', value: 'off' },
];

export default function PerformanceTab() {
    const { t } = useTranslation();
    const httpPer = useGetNginxConfigByScopeQuery('http-per');
    const modules = useGetNginxModulesQuery();
    const brotli = modules.data?.modules?.find((item) => item.name === 'ngx_brotli');
    const brotliAvailable = !!brotli && brotli.enable && brotli.buildStatus === 'ready';
    const brotliCfg = useGetNginxBrotliConfigQuery(undefined, {
        skip: !brotliAvailable,
    });
    const [updateConfig, { isLoading: saving }] = useUpdateNginxConfigMutation();

    const [form, setForm] = useState(DEFAULT_FORM);
    const [units, setUnits] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!httpPer.data) return;
        const { values, units: parsedUnits } = fromParams(httpPer.data);
        setForm((prev) => ({ ...prev, ...(values as Partial<typeof prev>) }));
        setUnits((prev) => ({ ...prev, ...parsedUnits }));
    }, [httpPer.data]);

    useEffect(() => {
        if (!brotliCfg.data) return;
        const { values, units: parsedUnits } = fromParams(brotliCfg.data.params);
        setForm((prev) => ({ ...prev, ...(values as Partial<typeof prev>) }));
        setUnits((prev) => ({ ...prev, ...parsedUnits }));
    }, [brotliCfg.data]);

    const managedUnavailable = brotliAvailable && !!brotliCfg.data?.managedUnavailable;
    const validate = (): string | null => {
        const ranges: [string, number, number, number][] = [
            [t('openresty.per.serverNamesHashBucketSize'), form.server_names_hash_bucket_size, 1, 9999],
            [t('openresty.per.clientHeaderBufferSize'), form.client_header_buffer_size, 0, 999999999],
            [t('openresty.per.clientMaxBodySize'), form.client_max_body_size, 0, 999999999],
            [t('openresty.per.keepaliveTimeout'), form.keepalive_timeout, 0, 999999999],
            [t('openresty.per.gzipCompLevel'), form.gzip_comp_level, 1, 9],
        ];
        for (const [label, value, min, max] of ranges) {
            if (!Number.isFinite(value) || value < min || value > max) {
                return t('openresty.per.rangeError', { name: label, min, max });
            }
        }
        if (brotliAvailable && !managedUnavailable) {
            if (!Number.isFinite(form.brotli_comp_level) || form.brotli_comp_level < 0 || form.brotli_comp_level > 11) {
                return t('openresty.per.rangeError', {
                    name: t('openresty.per.brotliCompLevel'),
                    min: 0,
                    max: 11,
                });
            }
        }
        return null;
    };

    const submit = async () => {
        const invalid = validate();
        if (invalid) {
            toast.error(invalid);
            return;
        }
        const params = {
            gzip: form.gzip,
            server_names_hash_bucket_size: String(form.server_names_hash_bucket_size),
            client_header_buffer_size: withUnit(units.client_header_buffer_size, form.client_header_buffer_size, 'k'),
            client_max_body_size: withUnit(units.client_max_body_size, form.client_max_body_size, 'm'),
            keepalive_timeout: String(form.keepalive_timeout),
            gzip_min_length: withUnit(units.gzip_min_length, form.gzip_min_length, 'k'),
            gzip_comp_level: String(form.gzip_comp_level),
        };
        try {
            await updateConfig({
                scope: 'http-per',
                operate: 'update',
                params,
            }).unwrap();
        } catch (e) {
            toast.error(errText(e));
            return;
        }
        if (brotliAvailable && !managedUnavailable) {
            try {
                await updateConfig({
                    scope: 'brotli',
                    operate: 'update',
                    params: {
                        brotli: form.brotli,
                        brotli_comp_level: String(form.brotli_comp_level),
                        brotli_min_length: withUnit(units.brotli_min_length, form.brotli_min_length, 'k'),
                    },
                }).unwrap();
            } catch (e) {
                toast.error(t('openresty.per.brotliSaveFailed'));
                return;
            }
        }
        toast.success(t('openresty.saveSuccess'));
        httpPer.refetch();
        if (brotliAvailable) brotliCfg.refetch();
    };

    const numberField = (
        label: string,
        help: string,
        value: number,
        onChange: (v: number) => void,
        opts: { min?: number; max?: number; suffix?: string } = {},
    ) => (
        <ConfigField key={label} label={label} help={help}>
            <Input
                type="number"
                aria-label={label}
                value={value}
                min={opts.min}
                max={opts.max}
                onChange={(e) => onChange(e.target.valueAsNumber)}
                className="w-full"
            />
            {opts.suffix ? <span className="text-sm text-muted-foreground">{opts.suffix}</span> : null}
        </ConfigField>
    );

    if (httpPer.isError) {
        return (
            <Alert variant="destructive">
                <AlertTitle>{errText(httpPer.error)}</AlertTitle>
            </Alert>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {httpPer.isLoading || modules.isLoading ? <Spinner /> : null}
            {brotliAvailable && brotliCfg.data?.managedExternally ? (
                <Alert>
                    <AlertTitle>{t('openresty.per.brotliManagedExternally')}</AlertTitle>
                </Alert>
            ) : null}
            {managedUnavailable ? (
                <Alert>
                    <AlertTitle>{t('openresty.per.brotliManagedUnavailable')}</AlertTitle>
                </Alert>
            ) : null}
            <div className="card-grid">
                <div className="flex flex-col gap-3.5">
                    {numberField(
                        'server_names_hash_bucket_size',
                        t('openresty.per.serverNamesHashBucketSizeHelper'),
                        form.server_names_hash_bucket_size,
                        (v) =>
                            setForm((s) => ({
                                ...s,
                                server_names_hash_bucket_size: v,
                            })),
                        { min: 1, max: 9999 },
                    )}
                    {numberField(
                        'client_header_buffer_size',
                        t('openresty.per.clientHeaderBufferSizeHelper'),
                        form.client_header_buffer_size,
                        (v) =>
                            setForm((s) => ({
                                ...s,
                                client_header_buffer_size: v,
                            })),
                        {
                            min: 0,
                            suffix: unitLabel(units.client_header_buffer_size, 'k'),
                        },
                    )}
                    {numberField(
                        'client_max_body_size',
                        t('openresty.per.clientMaxBodySizeHelper'),
                        form.client_max_body_size,
                        (v) => setForm((s) => ({ ...s, client_max_body_size: v })),
                        {
                            min: 0,
                            suffix: unitLabel(units.client_max_body_size, 'm'),
                        },
                    )}
                    {numberField(
                        'keepalive_timeout',
                        t('openresty.per.keepaliveTimeoutHelper'),
                        form.keepalive_timeout,
                        (v) => setForm((s) => ({ ...s, keepalive_timeout: v })),
                        { min: 0 },
                    )}
                </div>
                <div className="flex flex-col gap-3.5">
                    <ConfigField label="gzip" help={t('openresty.per.gzipHelper')}>
                        <NativeSelect
                            aria-label="gzip"
                            value={form.gzip}
                            onChange={(e) => setForm((s) => ({ ...s, gzip: e.target.value }))}
                        >
                            {ON_OFF.map((option) => (
                                <NativeSelectOption key={option.value} value={option.value}>
                                    {option.label}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </ConfigField>
                    {numberField(
                        'gzip_min_length',
                        t('openresty.per.gzipMinLengthHelper'),
                        form.gzip_min_length,
                        (v) => setForm((s) => ({ ...s, gzip_min_length: v })),
                        {
                            min: 0,
                            suffix: unitLabel(units.gzip_min_length, 'k'),
                        },
                    )}
                    {numberField(
                        'gzip_comp_level',
                        t('openresty.per.gzipCompLevelHelper'),
                        form.gzip_comp_level,
                        (v) => setForm((s) => ({ ...s, gzip_comp_level: v })),
                        { min: 1, max: 9 },
                    )}
                </div>
                {brotliAvailable ? (
                    <div className="flex flex-col gap-3.5">
                        <ConfigField label="brotli" help={t('openresty.per.brotliHelper')}>
                            <NativeSelect
                                aria-label="brotli"
                                value={form.brotli}
                                onChange={(e) =>
                                    setForm((s) => ({
                                        ...s,
                                        brotli: e.target.value,
                                    }))
                                }
                            >
                                {ON_OFF.map((option) => (
                                    <NativeSelectOption key={option.value} value={option.value}>
                                        {option.label}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </ConfigField>
                        {numberField(
                            'brotli_min_length',
                            t('openresty.per.brotliMinLengthHelper'),
                            form.brotli_min_length,
                            (v) =>
                                setForm((s) => ({
                                    ...s,
                                    brotli_min_length: v,
                                })),
                            {
                                min: 0,
                                suffix: unitLabel(units.brotli_min_length, 'k'),
                            },
                        )}
                        {numberField(
                            'brotli_comp_level',
                            t('openresty.per.brotliCompLevelHelper'),
                            form.brotli_comp_level,
                            (v) =>
                                setForm((s) => ({
                                    ...s,
                                    brotli_comp_level: v,
                                })),
                            { min: 0, max: 11 },
                        )}
                    </div>
                ) : null}
            </div>
            <div className="mt-4">
                <Button onClick={submit} disabled={saving}>
                    {t('common.confirm')}
                </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t('openresty.per.helper')}</p>
        </div>
    );
}
