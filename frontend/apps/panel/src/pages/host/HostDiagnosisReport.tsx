import { useTranslation } from 'react-i18next';
import { parseHostDiagnosis } from '@/utils/host-diagnosis';

type Props = { output: string };

// Existing Host Operation receipts include untrusted, serialized output.
// This component deliberately suppresses raw output and arbitrary device names.
export default function HostDiagnosisReport({ output }: Props) {
    const { t } = useTranslation();
    const summary = parseHostDiagnosis(output);
    if (!summary) {
        return <p role="status" className="text-sm text-muted-foreground">
            {t('hostOps.diagnosis.invalid')}
        </p>;
    }

    const uptime = summary.uptimeSeconds === null ? null :
        (summary.uptimeSeconds / 3600).toFixed(1) + ' h';
    const disk = summary.rootUsedPercent === null ? null :
        summary.rootUsedPercent.toFixed(1) + '%';
    const count = summary.acceleratorCount;
    const accelerator = summary.acceleratorStatus === 'unavailable'
        ? t('hostOps.diagnosis.unavailable')
        : summary.acceleratorStatus === 'unknown' || count === null
            ? t('hostOps.diagnosis.notReported')
            : count === 0
                ? t('hostOps.diagnosis.noneReported')
                : t('hostOps.diagnosis.reportedCount', { count });

    const values = [
        [t('hostOps.diagnosis.system'), [summary.os, summary.platform].filter(Boolean).join(' ') || null],
        [t('hostOps.diagnosis.kernel'), summary.kernel],
        [t('hostOps.diagnosis.architecture'), summary.architecture],
        [t('hostOps.diagnosis.uptime'), uptime],
        [t('hostOps.diagnosis.disk'), disk],
        [t('hostOps.diagnosis.accelerators'), accelerator],
    ] as const;

    return (
        <section aria-label={t('hostOps.diagnosis.title')} className="my-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">{t('hostOps.diagnosis.title')}</h3>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {values.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-md bg-muted/40 p-3">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-medium">{value ?? '—'}</dd>
                    </div>
                ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
                {t('hostOps.diagnosis.disclaimer')}
            </p>
        </section>
    );
}
