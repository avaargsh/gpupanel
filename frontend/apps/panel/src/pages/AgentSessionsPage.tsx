import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { FileJson2, RefreshCw, ShieldAlert, Terminal } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    parseNativeInventory,
    type ImportedNativeInventory,
} from '@/utils/nativeSessions';

const LIMIT_BYTES = 1024 * 1024;

/** An imported local file is an untrusted *snapshot*, not a remote discovery API. */
export default function AgentSessionsPage() {
    const node = useAppSelector((s) => s.ui.currentNode) || 'local';
    const [inventory, setInventory] = useState<ImportedNativeInventory | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const epoch = useRef(0);
    const local = node === 'local';

    useEffect(() => {
        // Do not retain an import across node scope changes or stale async reads.
        epoch.current += 1;
        setInventory(null);
        setError('');
        setLoading(false);
    }, [node]);

    useEffect(() => () => { epoch.current += 1; }, []);

    const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        const request = ++epoch.current;
        setInventory(null);
        setError('');
        if (!file || !local) return;
        if (file.size > LIMIT_BYTES) {
            setError('文件超过 1 MiB 上限，未读取任何内容。');
            return;
        }
        setLoading(true);
        try {
            const imported = parseNativeInventory(await file.text());
            if (request === epoch.current) setInventory(imported);
        } catch (caught) {
            if (request === epoch.current) {
                setError(caught instanceof Error ? caught.message : '清单读取失败');
            }
        } finally {
            if (request === epoch.current) setLoading(false);
        }
    };

    return <div className="workbench" aria-label="原生 Agent 会话">
        <header className="workbench-heading">
            <div>
                <h1>Agent Sessions</h1>
                <p>Codex 原生会话与 app-server 单次状态快照 · 本地只读预览</p>
            </div>
            <Badge variant="secondary">本地导入</Badge>
        </header>
        <Alert>
            <ShieldAlert aria-hidden="true" />
            <AlertDescription>
                此页面不通过 Host 扫描文件、不执行 Codex 命令，也不上传会话历史。
                app-server 的 active/idle 仅代表被连接的那个原生服务实例。<strong>不证明其他 Codex 进程正在运行或停止</strong>，也不授予 Agent 审批或执行权限。
            </AlertDescription>
        </Alert>

        {!local ? <Alert variant="destructive">
            <AlertDescription role="status">
                此功能只允许 local 节点。切换到本机后重新选择清单文件；远程节点不会继承导入结果。
            </AlertDescription>
        </Alert> : <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Terminal className="size-4" aria-hidden="true" />
                        从 Ubuntu 当前用户导出
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                        在你自己登录的普通 Ubuntu 开发账号终端中执行下面的命令；不要使用 sudo。
                        输出不包含提示词、命令内容和工作目录全路径。可以选择旧 rollout 清单或新的 app-server RPC 快照。
                    </p>
                    <pre className="log-output" aria-label="会话只读导出命令">
                        {'python3 scripts/gpupanel-codex-sessions.py list > codex-sessions.json'}
                    </pre>
                    <p className="text-sm text-muted-foreground">
                        可选：运行 Codex app-server 的单次只读 RPC 探测（会在用户账号下启动并停止新的 app-server 进程，可能执行 Codex 初始化；不会连接你已运行的进程）。
                    </p>
                    <pre className="log-output" aria-label="app-server 快照命令">
                        {'python3 scripts/gpupanel-codex-appserver.py list > codex-appserver.json'}
                    </pre>
                    <p className="text-sm text-muted-foreground">
                        如果你自己已启动了带 WebSocket 的 Codex app-server，可以在<strong>同一普通 Ubuntu 用户终端</strong>查询该明确指定的回环端口。
                        这连接已有服务，而不是启动新的 Codex 进程；只查询一页，依然不会自动持续订阅。
                    </p>
                    <pre className="log-output" aria-label="已运行 app-server 只读查询命令">
                        {'cd core && go run ./cmd/codex-observer --endpoint ws://127.0.0.1:4222 > ../codex-attached.json'}
                    </pre>
                    <label className="flex flex-col gap-2 text-sm">
                        <span className="font-medium">选择刚导出的 JSON 文件</span>
                        <input type="file" accept=".json,application/json" disabled={loading}
                            onChange={(event) => { void onFile(event); }}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm
                                       file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3
                                       file:py-1 file:text-foreground focus-visible:outline-2" />
                    </label>
                    <p className="text-xs text-muted-foreground">
                        所有数据只保存在当前浏览器页面的内存中。刷新、退出或切换节点后需要重新导入。
                    </p>
                </CardContent>
            </Card>
            {error && <Alert variant="destructive">
                <ShieldAlert aria-hidden="true" />
                <AlertDescription role="alert">{error}</AlertDescription>
            </Alert>}
            {loading && <p role="status" className="text-sm text-muted-foreground">正在解析本地文件…</p>}
            {inventory && !loading && <Card>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                        <FileJson2 className="size-4" aria-hidden="true" />
                        {inventory.schemaVersion === 2 ? 'app-server 快照' : 'Rollout 记录'}（{inventory.sessions.length}）
                    </CardTitle>
                    <Button variant="outline" size="sm" onClick={() => {
                        epoch.current += 1;
                        setInventory(null);
                        setError('');
                    }}>
                        <RefreshCw aria-hidden="true" />
                        清除本地导入
                    </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                    {inventory.hasMore && <p role="status" className="text-xs text-muted-foreground">
                        当前仅显示第一页，原生列表仍有后续数据；不代表已发现全部会话。
                    </p>}
                    {inventory.sessions.length === 0 && <p role="status" className="py-6 text-sm text-muted-foreground">
                        当前快照未返回任何会话；不表示其他 Codex 进程没有正在运行的任务。
                    </p>}
                    {inventory.sessions.map((item) => <div key={item.sessionId}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4">
                        <div className="min-w-0 space-y-1">
                            <p className="break-words text-sm font-medium">{item.projectLabel}</p>
                            <p className="break-all font-mono text-xs text-muted-foreground">{item.sessionId}</p>
                            <p className="text-xs text-muted-foreground">
                                Codex · 记录时间：{item.startedAt}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline">全局运行状态未知</Badge>
                            {item.observerStatus && <span className="text-xs text-muted-foreground">
                                {inventory.observerScope === 'attached-loopback-appserver' ? '所连 app-server' : '本次新观察进程'}：{item.observerStatus}
                            </span>}
                        </div>
                    </div>)}
                </CardContent>
            </Card>}
        </>}
    </div>;
}
