import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { baseApi } from '@/api/baseApi';
import type { PendingAppInstall } from '@/utils/app-install-pending';
const receiptApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        readInstallReceipt: build.query<
            {
                lines: string[];
                taskStatus: string;
                scope: string;
            },
            PendingAppInstall
        >({
            query: ({ taskID, node }) => ({
                url: `/logs/tasks/read?operateNode=${encodeURIComponent(node)}`,
                method: 'POST',
                body: { taskID, page: 1, pageSize: 100, latest: true },
            }),
        }),
    }),
});
/** A bounded, manually refreshed receipt. Synthetic admission data is never tailed or downloaded. */
export default function InstallReceipt({ receipt }: { receipt: PendingAppInstall }) {
    const result = receiptApi.useReadInstallReceiptQuery(receipt);
    return (
        <div style={{ marginTop: 12 }}>
            <span className="text-sm">
                {receipt.taskID}
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Copy"
                    onClick={() => {
                        void navigator.clipboard
                            .writeText(String(receipt.taskID))
                            .then(() => toast.success('Copied'))
                            .catch(() => toast.error('Copy failed'));
                    }}
                >
                    Copy
                </Button>
            </span>
            <p>
                Host: {receipt.node} · App: {receipt.appKey}
            </p>
            <div className="flex flex-row  gap-3 items-center">
                <Button onClick={() => result.refetch()} variant={'outline'} type={'button'} disabled={false || result.isFetching}>
                    {result.isFetching ? <Spinner data-icon="inline-start" /> : null}刷新回执 / Refresh receipt
                </Button>
            </div>
            {result.isError ? (
                <Alert>
                    <AlertDescription>{'回执不可用，结果仍不明确 / Receipt unavailable; outcome remains unknown'}</AlertDescription>
                </Alert>
            ) : null}
            {result.data ? (
                <>
                    <p>
                        {result.data.scope === 'admission'
                            ? '只读受理记录，不证明安装完成 / Admission only; no completed-install proof'
                            : result.data.taskStatus}
                    </p>
                    <pre style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result.data.lines?.join('\n')}</pre>
                </>
            ) : null}
        </div>
    );
}
