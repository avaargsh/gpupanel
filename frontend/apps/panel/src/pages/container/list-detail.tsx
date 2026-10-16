import {
    useGetContainerInfoQuery,
    useGetContainerStatsQuery,
    useInspectContainerMutation,
    type ContainerInfo,
} from '@/api/containerApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatPercent } from '@/utils/format';
import { PencilIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Descriptions, type DescriptionItem } from './descriptions';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 容器详情抽屉：基础信息、实时统计、配置与 inspect 输出。 */
export function ContainerDetailSheet({ container, onClose }: { container: ContainerInfo | null; onClose: () => void }) {
    const { t } = useTranslation();
    const infoQuery = useGetContainerInfoQuery(container?.name ?? '', { skip: !container });
    const statsQuery = useGetContainerStatsQuery(container?.containerID ?? '', {
        skip: !container,
        pollingInterval: 5000,
    });
    const [inspectContainer] = useInspectContainerMutation();
    const [inspectText, setInspectText] = useState('');

    useEffect(() => {
        setInspectText('');
    }, [container]);

    const openInspect = async () => {
        if (!container) return;
        try {
            const res = await inspectContainer({ id: container.containerID, type: 'container' }).unwrap();
            setInspectText(typeof res === 'string' ? res : JSON.stringify(res, null, 2));
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const basicItems: DescriptionItem[] = container
        ? [
              { key: 'ID', value: container.containerID.slice(0, 12) },
              { key: t('container.table.image'), value: container.imageName },
              { key: t('container.table.state'), value: container.state },
              { key: t('container.table.created'), value: container.createTime },
              { key: t('container.detail.runTime'), value: container.runTime || '—' },
              { key: t('container.detail.ports'), value: container.ports?.join(', ') || '—' },
          ]
        : [];

    const statsItems: DescriptionItem[] = statsQuery.data
        ? [
              { key: t('container.table.cpu'), value: formatPercent(statsQuery.data.cpuPercent) },
              { key: t('container.table.memory'), value: `${(statsQuery.data.memory ?? 0).toFixed(1)} MB` },
              { key: t('container.detail.networkRX'), value: `${(statsQuery.data.networkRX ?? 0).toFixed(2)}` },
              { key: t('container.detail.networkTX'), value: `${(statsQuery.data.networkTX ?? 0).toFixed(2)}` },
              { key: t('container.detail.ioRead'), value: (statsQuery.data.ioRead ?? 0).toFixed(2) },
              { key: t('container.detail.ioWrite'), value: (statsQuery.data.ioWrite ?? 0).toFixed(2) },
          ]
        : [];

    const configItems: DescriptionItem[] = infoQuery.data
        ? [
              { key: t('container.detail.hostname'), value: String(infoQuery.data.hostname ?? '—') },
              { key: t('container.detail.workingDir'), value: String(infoQuery.data.workingDir ?? '—') },
              { key: t('container.detail.restartPolicy'), value: String(infoQuery.data.restartPolicy ?? '—') },
              { key: t('container.detail.user'), value: String(infoQuery.data.user ?? '—') },
          ]
        : [];

    return (
        <Sheet
            open={Boolean(container)}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[560px]">
                <SheetHeader>
                    <SheetTitle>{container ? `${t('container.detail.title')} - ${container.name}` : ''}</SheetTitle>
                </SheetHeader>
                {container && (
                    <div className="flex flex-col gap-4 px-4 pb-4">
                        <Descriptions data={basicItems} column={2} />
                        <Card size="sm">
                            <CardHeader>
                                <CardTitle>{t('container.detail.liveStats')}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                {statsQuery.data ? (
                                    <Descriptions data={statsItems} column={2} />
                                ) : (
                                    <span className="text-sm text-muted-foreground">
                                        {t('container.detail.noStats')}
                                    </span>
                                )}
                            </CardContent>
                        </Card>
                        {infoQuery.data && (
                            <Card size="sm">
                                <CardHeader>
                                    <CardTitle>{t('container.detail.config')}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <Descriptions data={configItems} column={2} />
                                </CardContent>
                            </Card>
                        )}
                        <div>
                            <Button size="sm" variant="outline" onClick={openInspect}>
                                <PencilIcon data-icon="inline-start" />
                                {t('container.detail.inspect')}
                            </Button>
                            {inspectText && (
                                <pre className="mt-2.5 max-h-80 overflow-auto rounded-lg bg-muted p-2.5 text-xs">
                                    {inspectText}
                                </pre>
                            )}
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
