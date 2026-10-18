import { useTranslation } from 'react-i18next';
import { parseContainerDiagnosis, containerInvestigationHints } from '@/utils/container-diagnosis';

export default function ContainerDiagnosisReport({ output, target }: { output: string; target: string }) {
    const { t } = useTranslation();
    const report = parseContainerDiagnosis(output, target);
    if (!report) {
        return <p role="status" className="text-sm text-muted-foreground">
            {t('hostOps.containerDiagnosis.invalid')}
        </p>;
    }
    const entries = [
        [t('hostOps.containerDiagnosis.status'), report.status],
        [t('hostOps.containerDiagnosis.running'), report.running
            ? t('hostOps.containerDiagnosis.yes') : t('hostOps.containerDiagnosis.no')],
        [t('hostOps.containerDiagnosis.exitCode'), String(report.exitCode)],
        [t('hostOps.containerDiagnosis.oom'), report.oomKilled
            ? t('hostOps.containerDiagnosis.yes') : t('hostOps.containerDiagnosis.no')],
        [t('hostOps.containerDiagnosis.health'), report.health],
        [t('hostOps.containerDiagnosis.observedAt'), report.observedAt],
    ] as const;
    return (
        <section aria-label={t('hostOps.containerDiagnosis.title')} className="my-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">{t('hostOps.containerDiagnosis.title')}</h3>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{report.containerId}</p>
            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {entries.map(([label, value]) => (
                    <div key={label} className="min-w-0 rounded-md bg-muted/40 p-3">
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
                    </div>
                ))}
            </dl>
            <div className="mt-4 border-t pt-3" aria-label={t('hostOps.containerDiagnosis.guidance.title')}>
                <h4 className="text-sm font-medium">{t('hostOps.containerDiagnosis.guidance.title')}</h4>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {containerInvestigationHints(report).map((hint) => (
                        <li key={hint}>{t(`hostOps.containerDiagnosis.guidance.${hint}`)}</li>
                    ))}
                </ul>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
                {t('hostOps.containerDiagnosis.disclaimer')}
            </p>
        </section>
    );
}
