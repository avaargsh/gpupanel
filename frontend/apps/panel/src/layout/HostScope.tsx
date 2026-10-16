import { IconServer } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useGetBaseInfoQuery } from '@/api/dashboardApi';
import { useAppSelector } from '@/store/hooks';

/** A resource label and observed read state; never claims remote enrollment or readiness. */
export default function HostScope() {
    const { t } = useTranslation();
    const node = useAppSelector((s) => s.ui.currentNode) || 'local';
    const query = useGetBaseInfoQuery({ ioOption: 'all', netOption: 'all' });
    const data = !query.isError ? query.currentData : undefined;
    const status = query.isError ? 'unavailable' : data?.hostname ? 'observed' : 'checking';
    return <div className="host-scope" data-state={status} title={t(`workbench.${status}`)}>
        <IconServer />
        <span className="host-scope-label"><small>{t('workbench.scope')}</small><strong>{node === 'local' ? t('workbench.local') : node}</strong></span>
        <span className="host-observation" role="status">{t(`workbench.${status}`)}</span>
    </div>;
}
