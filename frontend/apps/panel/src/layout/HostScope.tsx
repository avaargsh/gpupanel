import { Server } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetBaseInfoQuery } from '@/api/dashboardApi';
import { useAppSelector } from '@/store/hooks';

/**
 * 当前主机的读取状态。节点名由相邻的模式芯片（LocalModeChip）给出，
 * 此处只报告观测结果，避免同一信息在顶栏重复出现。
 * 只描述已观测到的事实，不声称远端纳管或环境已就绪。
 */
export default function HostScope() {
    const { t } = useTranslation();
    const node = useAppSelector((s) => s.ui.currentNode) || 'local';
    const query = useGetBaseInfoQuery({ ioOption: 'all', netOption: 'all' });
    const data = !query.isError ? query.currentData : undefined;
    const status = query.isError ? 'unavailable' : data?.hostname ? 'observed' : 'checking';
    const nodeLabel = node === 'local' || node === '' ? t('workbench.local') : node;
    const statusLabel = t(`workbench.${status}`);
    return (
        <div className="host-scope" data-state={status}>
            <Server className="size-4" aria-hidden="true" />
            <span className="host-observation" role="status" aria-label={`${t('workbench.scope')}: ${nodeLabel}`}>
                {statusLabel}
            </span>
        </div>
    );
}
