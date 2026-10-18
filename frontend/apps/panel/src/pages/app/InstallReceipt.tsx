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
        <section className="install-receipt" aria-label="Install task receipt">
            <div className="install-receipt-heading">
                <div className="min-w-0">
                    <p className="install-receipt-label">Task ID / 任务标识</p>
                    <code className="install-receipt-id">{receipt.taskID}</code>
                </div>
                <Button variant="outline" size="sm" aria-label="Copy" type="button"
                    onClick={() => {
                        void navigator.clipboard.writeText(receipt.taskID)
                            .then(() => toast.success('Copied'))
                            .catch(() => toast.error('Copy failed'));
                    }}>
                    Copy
                </Button>
            </div>
            <dl className="install-receipt-meta">
                <div><dt>Host</dt><dd>{receipt.node}</dd></div>
                <div><dt>App</dt><dd>{receipt.appKey}</dd></div>
            </dl>
            <div className="install-receipt-status">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <strong className="text-sm font-medium">Receipt observation / 回执观察</strong>
                    <Button onClick={() => void result.refetch()} variant="outline" size="sm" type="button"
                        disabled={result.isFetching}>
                        {result.isFetching ? <Spinner data-icon="inline-start" /> : null}
                        刷新回执 / Refresh receipt
                    </Button>
                </div>
                {result.isError ? (
                    <Alert>
                        <AlertDescription>回执不可用，结果仍不明确 / Receipt unavailable; outcome remains unknown</AlertDescription>
                    </Alert>
                ) : null}
                {result.data ? (
                    <div className="install-receipt-observation">
                        <p role="status" className="text-xs text-muted-foreground">
                            {result.data.scope === 'admission'
                                ? '只读受理记录，不证明安装完成 / Admission only; no completed-install proof'
                                : result.data.taskStatus}
                        </p>
                        <pre className="log-output install-receipt-log">{result.data.lines?.join('\n')}</pre>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
