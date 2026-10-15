import { Banner, Button, Space, Typography } from '@douyinfe/semi-ui';
import { baseApi } from '@/api/baseApi';
import type { PendingAppInstall } from '@/utils/app-install-pending';

const receiptApi = baseApi.injectEndpoints({ endpoints: (build) => ({
    readInstallReceipt: build.query<{ lines: string[]; taskStatus: string; scope: string }, PendingAppInstall>({
        query: ({ taskID, node }) => ({
            url: `/logs/tasks/read?operateNode=${encodeURIComponent(node)}`,
            method: 'POST', body: { taskID, page: 1, pageSize: 100, latest: true },
        }),
    }),
}) });

/** A bounded, manually refreshed receipt. Synthetic admission data is never tailed or downloaded. */
export default function InstallReceipt({ receipt }: { receipt: PendingAppInstall }) {
    const result = receiptApi.useReadInstallReceiptQuery(receipt);
    return <div style={{ marginTop: 12 }}>
        <Typography.Text copyable>{receipt.taskID}</Typography.Text>
        <p>Host: {receipt.node} · App: {receipt.appKey}</p>
        <Space><Button loading={result.isFetching} onClick={() => result.refetch()}>刷新回执 / Refresh receipt</Button></Space>
        {result.isError ? <Banner type="warning" description="回执不可用，结果仍不明确 / Receipt unavailable; outcome remains unknown" /> : null}
        {result.data ? <>
            <p>{result.data.scope === 'admission' ? '只读受理记录，不证明安装完成 / Admission only; no completed-install proof' : result.data.taskStatus}</p>
            <pre style={{ maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{result.data.lines?.join('\n')}</pre>
        </> : null}
    </div>;
}
