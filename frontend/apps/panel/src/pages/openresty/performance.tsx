import { useEffect, useState } from 'react';
import { Banner, Button, InputNumber, Select, Spin, Toast, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useGetNginxBrotliConfigQuery,
    useGetNginxConfigByScopeQuery,
    useGetNginxModulesQuery,
    useUpdateNginxConfigMutation,
    type NginxParam,
} from '@/api/openrestyApi';
import { errText, Field } from '@/pages/toolbox/shared';
import { parseIntParam, parseSizeParam, SIZE_KEYS, unitLabel, withUnit } from './shared';

const { Text } = Typography;

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
function fromParams(params: NginxParam[]): { values: Record<string, unknown>; units: Record<string, string> } {
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
    const brotliCfg = useGetNginxBrotliConfigQuery(undefined, { skip: !brotliAvailable });
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
                return t('openresty.per.rangeError', { name: t('openresty.per.brotliCompLevel'), min: 0, max: 11 });
            }
        }
        return null;
    };

    const submit = async () => {
        const invalid = validate();
        if (invalid) {
            Toast.error(invalid);
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
            await updateConfig({ scope: 'http-per', operate: 'update', params }).unwrap();
        } catch (e) {
            Toast.error(errText(e));
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
                Toast.error(t('openresty.per.brotliSaveFailed'));
                return;
            }
        }
        Toast.success(t('openresty.saveSuccess'));
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
        <Field key={label} label={label} help={help}>
            <InputNumber
                value={value}
                min={opts.min}
                max={opts.max}
                suffix={opts.suffix}
                onChange={(v) => onChange(Number(v ?? 0))}
                style={{ width: '100%' }}
            />
        </Field>
    );

    if (httpPer.isError) {
        return <Banner type="danger" closeIcon={null} title={errText(httpPer.error)} />;
    }

    return (
        <Spin spinning={httpPer.isLoading || modules.isLoading}>
            {brotliAvailable && brotliCfg.data?.managedExternally ? (
                <Banner type="info" closeIcon={null} style={{ marginBottom: 12 }} title={t('openresty.per.brotliManagedExternally')} />
            ) : null}
            {managedUnavailable ? (
                <Banner type="warning" closeIcon={null} style={{ marginBottom: 12 }} title={t('openresty.per.brotliManagedUnavailable')} />
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {numberField(
                        'server_names_hash_bucket_size',
                        t('openresty.per.serverNamesHashBucketSizeHelper'),
                        form.server_names_hash_bucket_size,
                        (v) => setForm((s) => ({ ...s, server_names_hash_bucket_size: v })),
                        { min: 1, max: 9999 },
                    )}
                    {numberField(
                        'client_header_buffer_size',
                        t('openresty.per.clientHeaderBufferSizeHelper'),
                        form.client_header_buffer_size,
                        (v) => setForm((s) => ({ ...s, client_header_buffer_size: v })),
                        { min: 0, suffix: unitLabel(units.client_header_buffer_size, 'k') },
                    )}
                    {numberField(
                        'client_max_body_size',
                        t('openresty.per.clientMaxBodySizeHelper'),
                        form.client_max_body_size,
                        (v) => setForm((s) => ({ ...s, client_max_body_size: v })),
                        { min: 0, suffix: unitLabel(units.client_max_body_size, 'm') },
                    )}
                    {numberField(
                        'keepalive_timeout',
                        t('openresty.per.keepaliveTimeoutHelper'),
                        form.keepalive_timeout,
                        (v) => setForm((s) => ({ ...s, keepalive_timeout: v })),
                        { min: 0 },
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="gzip" help={t('openresty.per.gzipHelper')}>
                        <Select value={form.gzip} onChange={(v) => setForm((s) => ({ ...s, gzip: String(v) }))} optionList={ON_OFF} style={{ width: '100%' }} />
                    </Field>
                    {numberField(
                        'gzip_min_length',
                        t('openresty.per.gzipMinLengthHelper'),
                        form.gzip_min_length,
                        (v) => setForm((s) => ({ ...s, gzip_min_length: v })),
                        { min: 0, suffix: unitLabel(units.gzip_min_length, 'k') },
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Field label="brotli" help={t('openresty.per.brotliHelper')}>
                            <Select value={form.brotli} onChange={(v) => setForm((s) => ({ ...s, brotli: String(v) }))} optionList={ON_OFF} style={{ width: '100%' }} />
                        </Field>
                        {numberField(
                            'brotli_min_length',
                            t('openresty.per.brotliMinLengthHelper'),
                            form.brotli_min_length,
                            (v) => setForm((s) => ({ ...s, brotli_min_length: v })),
                            { min: 0, suffix: unitLabel(units.brotli_min_length, 'k') },
                        )}
                        {numberField(
                            'brotli_comp_level',
                            t('openresty.per.brotliCompLevelHelper'),
                            form.brotli_comp_level,
                            (v) => setForm((s) => ({ ...s, brotli_comp_level: v })),
                            { min: 0, max: 11 },
                        )}
                    </div>
                ) : null}
            </div>
            <div style={{ marginTop: 16 }}>
                <Button theme="solid" type="primary" onClick={submit} loading={saving}>
                    {t('common.confirm')}
                </Button>
            </div>
            <Typography.Text type="tertiary" size="small" style={{ display: 'block', marginTop: 8 }}>
                {t('openresty.per.helper')}
            </Typography.Text>
        </Spin>
    );
}
