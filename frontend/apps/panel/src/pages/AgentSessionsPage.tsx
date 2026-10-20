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
                <p>Codex 原生会话记录 · 单机用户态只读预览</p>
            </div>
            <Badge variant="secondary">本地导入</Badge>
        </header>
        <Alert>
            <ShieldAlert aria-hidden="true" />
            <AlertDescription>
                此页面不访问 Host 文件系统、不启动 Agent，也不向服务器上传会话历史。
                清单只证明存在本机 Codex 记录，<strong>不证明 Agent 正在执行</strong>，更不是审批或执行权限。
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
                        输出不包含提示词、命令内容和工作目录全路径。
                    </p>
                    <pre className="log-output" aria-label="会话只读导出命令">
                        {'python3 scripts/gpupanel-codex-sessions.py list > codex-sessions.json'}
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
                        原生会话记录（{inventory.sessions.length}）
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
                    {inventory.sessions.length === 0 && <p role="status" className="py-6 text-sm text-muted-foreground">
                        未找到符合格式的 Codex rollout 会话记录；不表示本机没有运行中的 Agent。
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
                        <Badge variant="outline">运行状态未知</Badge>
                    </div>)}
                </CardContent>
            </Card>}
        </>}
    </div>;
}
