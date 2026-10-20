import { useEffect, useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { useBeginNativePeerMutation, useLazyNativePeerStatusQuery, useRevokeNativePeerMutation, type NativePeerChallenge, type NativePeerStatus } from '@/api/nativePrincipalApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function NativePrincipalPage() {
    const node = useAppSelector(s => s.ui.currentNode) || 'local';
    const [uid, setUid] = useState('');
    const [ticket, setTicket] = useState<NativePeerChallenge | null>(null);
    const [view, setView] = useState<NativePeerStatus | null>(null);
    const [error, setError] = useState('');
    const [begin, starting] = useBeginNativePeerMutation();
    const [status, checking] = useLazyNativePeerStatusQuery();
    const [revoke, revoking] = useRevokeNativePeerMutation();
    const local = node === 'local';
    useEffect(() => { setTicket(null); setView(null); setError(''); }, [node]);

    async function start() {
        setTicket(null); setView(null); setError('');
        if (!local || !/^[0-9]{4,5}$/.test(uid) || Number(uid) < 1000 || Number(uid) > 60000) {
            setError('请输入当前 Ubuntu 开发用户的有效 UID（1000–60000），不要使用 root。');
            return;
        }
        try {
            const result = await begin({ uid: Number(uid) }).unwrap();
            if (!/^[A-Za-z0-9_-]{43}$/.test(result.challenge) ||
                !/^\/run\/gpupanel-proof-[A-Za-z0-9_-]+\/pair\.sock$/.test(result.socketPath) ||
                result.executionAuthorized !== false) throw new Error('无效的安全配对响应');
            setTicket(result);
        } catch {
            setError('无法发起本地配对。请检查实验开关、真实 Web 登录及 localhost 访问方式。');
        }
    }
    async function verify() {
        setError(''); setView(null);
        try {
            const result = await status().unwrap();
            if (result.state !== 'Unbound' && result.state !== 'PeerObserved') throw new Error('bad state');
            setView(result);
            if (result.state === 'PeerObserved') setTicket(null);
        } catch {
            setError('无法核对本地绑定状态；不要将网络失败当成配对成功。');
        }
    }
    async function clear() {
        setError(''); setView(null); setTicket(null);
        try { await revoke().unwrap(); }
        catch { setError('撤销未确认，请重新查询；不要只清除本地界面就认为权限已撤销。'); }
    }
    return <div className="workbench" aria-label="本机开发用户绑定">
        <header className="workbench-heading">
            <div><h1>本机用户身份验证</h1><p>开发者实验功能 · 只验证 Ubuntu UID，不授予命令执行或 Agent 控制权限</p></div>
            <Badge variant="outline">实验性 · 默认关闭</Badge>
        </header>
        <Alert><AlertDescription>
            仅在 Core 端显式启用后、通过 localhost 登录的浏览器中使用。验证依赖本机 Unix Socket 的 Linux 内核凭据；
            不是 SSH 登录、Agent 会话权限或多租户身份绑定。
        </AlertDescription></Alert>
        {!local ? <Alert variant="destructive"><AlertDescription role="status">
            当前为远程节点，此功能不可用。切换本机后再使用。
        </AlertDescription></Alert> : <>
            <Card><CardHeader><CardTitle>绑定当前 Ubuntu 开发账号</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                    <label className="block space-y-2 text-sm">
                        <span>当前 Linux 用户 UID（终端运行 <code>id -u</code> 可查询）</span>
                        <input className="w-full rounded-md border border-input bg-background p-2" inputMode="numeric"
                            value={uid} onChange={event => setUid(event.target.value)} placeholder="1000" />
                    </label>
                    <Button disabled={starting.isLoading} onClick={() => void start()}>发起一次性配对</Button>
                    {ticket && <div className="space-y-2 rounded-lg border border-border p-3">
                        <p className="text-sm">在同一台 Ubuntu 电脑的<strong>普通用户终端</strong>运行（不要 sudo）：</p>
                        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{'python3 scripts/gpupanel-native-principal-pair.py --socket ' + ticket.socketPath}</pre>
                        <p className="text-sm">在终端隐藏输入提示处粘贴挑战码（60 秒内有效）：</p>
                        <code className="block break-all rounded bg-muted p-2 text-xs select-all">{ticket.challenge}</code>
                        <p className="text-xs text-muted-foreground">挑战码只显示在此处，不要放进命令行参数、URL、日志或截图。</p>
                    </div>}
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" disabled={checking.isFetching} onClick={() => void verify()}>核对身份状态</Button>
                        <Button variant="outline" disabled={revoking.isLoading} onClick={() => void clear()}>撤销本次绑定</Button>
                    </div>
                    {view && <p role="status" className="text-sm">
                        {view.state === 'PeerObserved' && view.proof?.identityObserved && !view.proof.executionAuthorized
                            ? `已观测 Linux UID ${view.proof.uid}；仅身份核验，不可执行命令。短期证明到期：${view.proof.expiresAt}`
                            : '当前没有有效的 Linux 用户验证记录。'}
                    </p>}
                    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                </CardContent>
            </Card>
        </>}
    </div>;
}
