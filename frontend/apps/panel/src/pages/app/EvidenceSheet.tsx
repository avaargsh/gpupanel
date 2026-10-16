import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { baseApi } from '@/api/baseApi';
import { parseAppEvidence } from '@/utils/app-evidence';
import { useAppSelector } from '@/store/hooks';
const evidenceApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getAppEvidence: build.query<
            ReturnType<typeof parseAppEvidence>,
            {
                id: number;
                node: string;
            }
        >({
            query: ({ id, node }) => ({ url: `/apps/installed/evidence/${id}?operateNode=${encodeURIComponent(node)}`, cache: 'no-store' }),
            transformResponse: (data: unknown, _meta, arg) => parseAppEvidence(data, arg.id),
            keepUnusedDataFor: 0,
        }),
    }),
});
export default function EvidenceSheet({ id, onClose }: { id: number; onClose: () => void }) {
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const result = evidenceApi.useGetAppEvidenceQuery({ id, node }, { skip: node !== 'local', refetchOnMountOrArgChange: true });
    const evidence = result.currentData;
    return (
        <Sheet
            open={true}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <SheetContent aria-describedby={undefined} className="overflow-y-auto" style={{ maxWidth: 560 }}>
                <SheetHeader>
                    <SheetTitle>{'只读应用证据 / Read-only application evidence'}</SheetTitle>
                </SheetHeader>
                <Alert>
                    <AlertDescription>
                        {
                            '观察一致不代表安装成功，也不授权重试或恢复。 / Agreement is not installation proof or permission to retry or recover.'
                        }
                    </AlertDescription>
                </Alert>
                {node !== 'local' ? (
                    <p>仅本地管理员可用 / Local admin only</p>
                ) : (
                    <>
                        <Button onClick={() => result.refetch()} variant={'outline'} type={'button'} disabled={false || result.isFetching}>
                            {result.isFetching ? <Spinner data-icon="inline-start" /> : null}刷新 / Refresh
                        </Button>
                        {result.isFetching ? (
                            <Spinner role="status" aria-label="Loading" />
                        ) : result.isError ? (
                            <p role="alert">证据不可用或权限不足，结果仍不明确 / Evidence unavailable or denied; outcome remains unknown</p>
                        ) : evidence ? (
                            <>
                                <h3 className="font-semibold text-base">{evidence.classification}</h3>
                                <p>
                                    App: {evidence.appStatus || 'UNKNOWN'} · Task: {evidence.taskStatus || 'UNKNOWN'}
                                </p>
                                <p>{evidence.observedAt}</p>
                                <ul>
                                    {evidence.reasons.map((reason, index) => (
                                        <li key={index}>{reason}</li>
                                    ))}
                                </ul>
                                <ul>
                                    {evidence.containers.map((container) => (
                                        <li key={container.name}>
                                            {container.name}: {container.state}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
