import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { baseApi } from '@/api/baseApi';
import type { PendingAppInstall } from '@/utils/app-install-pending';
import { canQueryInstallReceipt, visibleInstallReceipt } from '@/utils/app-install-receipt-view';
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
export default function InstallReceipt({ receipt, activeNode }: { receipt: PendingAppInstall; activeNode: string }) {
    const sameHost = canQueryInstallReceipt(receipt.node, activeNode);
    const result = receiptApi.useReadInstallReceiptQuery(receipt, {
        skip: !sameHost,
        refetchOnMountOrArgChange: true,
    });
    const observation = visibleInstallReceipt(result, sameHost);
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
                        disabled={!sameHost || result.isFetching}>
                        {result.isFetching ? <Spinner data-icon="inline-start" /> : null}
                        刷新回执 / Refresh receipt
                    </Button>
                </div>
                {!sameHost ? (
                    <Alert>
                        <AlertDescription>当前 Host 与原任务不同，请切回原 Host 后查看。结果仍不明确。 / Switch to the original Host to inspect this task; outcome remains unknown.</AlertDescription>
                    </Alert>
                ) : result.isError ? (
                    <Alert>
                        <AlertDescription>回执不可用，结果仍不明确 / Receipt unavailable; outcome remains unknown</AlertDescription>
                    </Alert>
                ) : result.isFetching || result.isLoading ? (
                    <p role="status" className="text-xs text-muted-foreground">正在重新读取回执 / Refreshing receipt</p>
                ) : null}
                {observation ? (
                    <div className="install-receipt-observation">
                        <p role="status" className="text-xs text-muted-foreground">
                            {observation.scope === 'admission'
                                ? '只读受理记录，不证明安装完成 / Admission only; no completed-install proof'
                                : observation.taskStatus}
                        </p>
                        <pre className="log-output install-receipt-log">{observation.lines?.join('\n')}</pre>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
