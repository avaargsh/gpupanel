import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { RefreshCwIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { decodeBase64, encodeBase64 } from '@/utils/base64';
import { getCookie } from '@/utils/cookie';
import { useAppSelector } from '@/store/hooks';

/** 鉴权相关状态码（对齐旧前端 ResultEnum：401 OVERDUE / 403 FORBIDDEN / 313 EXPIRED） */
const AUTH_ERROR_STATUS = new Set([401, 403, 313]);
/** 鉴权相关业务码（401 / 403 / 412 ERR_RBAC / 313） */
const AUTH_ERROR_CODE = new Set([401, 403, 412, 313]);

export interface TerminalProps {
    /** WebSocket 端点，如 /api/v1/hosts/terminal/local */
    endpoint: string;
    /** 额外查询参数（不含 cols/rows/operateNode/session） */
    queryParams?: Record<string, string | number | undefined>;
    /** operateNode，默认 local */
    operateNode?: string;
    /** 初始执行命令（对应后端 command 参数） */
    initCommand?: string;
    /** 允许会话持久化（断线后可用 session 重连） */
    persistent?: boolean;
    /** 容器高度 */
    height?: number | string;
    onSessionChange?: (sessionId: string) => void;
}

type ConnState = 'connecting' | 'connected' | 'closed' | 'error';

/**
 * 终端组件 —— 对齐旧前端 components/terminal 的 WebSocket 协议：
 * - 上行 { type: 'cmd'|'resize'|'heartbeat', ... }（cmd.data 为 UTF-8 Base64）
 * - 下行 { type: 'cmd'|'session'|'heartbeat'|'ai_notice', ... }
 * 连接前会用 HTTP 探测一次（ws->http），提前暴露 401 等鉴权错误。
 */
export default function Terminal({
    endpoint,
    queryParams,
    operateNode = 'local',
    initCommand,
    persistent = true,
    height = '100%',
    onSessionChange,
}: TerminalProps) {
    const { t } = useTranslation();
    const language = useAppSelector((s) => s.ui.language);
    const currentNode = useAppSelector((s) => s.ui.currentNode);
    const hostRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const [seq, setSeq] = useState(0);

    const [connState, setConnState] = useState<ConnState>('connecting');
    const [errorMsg, setErrorMsg] = useState('');
    const sessionIdRef = useRef('');

    const paramsString = useMemo(() => {
        if (!queryParams) return '';
        return Object.entries(queryParams)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&');
    }, [queryParams]);

    const buildUrl = (cols: number, rows: number, withSession: boolean) => {
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const base = `${protocol}://${window.location.host}/${endpoint.replace(/^\/+/, '')}`;
        const parts = [`cols=${cols}`, `rows=${rows}`];
        if (paramsString) parts.push(paramsString);
        parts.push(`operateNode=${encodeURIComponent(operateNode)}`);
        if (withSession && sessionIdRef.current) {
            parts.push(`session=${encodeURIComponent(sessionIdRef.current)}`);
        }
        if (persistent) parts.push('terminalPersistent=true');
        if (initCommand) parts.push(`command=${encodeURIComponent(initCommand)}`);
        return `${base}?${parts.join('&')}`;
    };

    /** 连接前流鉴权探测：ws->http。仅鉴权相关状态/业务码才阻断，其余（如 400/500）放行交由 WebSocket 处理 */
    const streamAuth = async (wsUrl: string): Promise<string> => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 5000);
        try {
            const csrf = getCookie('pcsrftoken');
            const res = await fetch(wsUrl.replace(/^ws/, 'http'), {
                credentials: 'include',
                headers: {
                    'Accept-Language': language || 'zh',
                    ...(currentNode ? { CurrentNode: encodeURIComponent(currentNode) } : {}),
                    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
                },
                signal: controller.signal,
            });
            if (AUTH_ERROR_STATUS.has(res.status)) {
                return `${res.status}`;
            }
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('application/json')) {
                try {
                    await res.body?.cancel();
                } catch {
                    // ignore
                }
                return '';
            }
            const data = (await res.json()) as { code?: number; message?: string };
            if (typeof data.code === 'number' && AUTH_ERROR_CODE.has(data.code)) {
                return data.message ?? String(data.code);
            }
            return '';
        } catch {
            return '';
        } finally {
            window.clearTimeout(timer);
        }
    };

    useEffect(() => {
        const container = hostRef.current;
        if (!container) return;
        let disposed = false;
        const cleanups: Array<() => void> = [];

        setConnState('connecting');
        setErrorMsg('');

        const term = new XTerm({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
            theme: {
                background: '#14151a',
                foreground: '#e8eaf0',
                cursor: '#e8eaf0',
                selectionBackground: 'rgba(122, 198, 182, 0.35)',
            },
            scrollback: 5000,
        });
        termRef.current = term;
        const fit = new FitAddon();
        fitRef.current = fit;
        term.loadAddon(fit);
        term.open(container);
        fit.fit();

        let ws: WebSocket | null = null;
        const send = (msg: unknown) => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(msg));
            }
        };
        const scheduleFit = () => {
            window.requestAnimationFrame(() => {
                if (disposed || !fitRef.current || !term) return;
                try {
                    fitRef.current!.fit();
                    if (ws) {
                        send({ type: 'resize', cols: term.cols, rows: term.rows });
                    }
                } catch {
                    // 容器尚不可见（如隐藏的 Tab）时忽略
                }
            });
        };

        const connect = async () => {
            if (disposed) return;
            let cols = term.cols;
            let rows = term.rows;
            try {
                fit.fit();
                cols = term.cols;
                rows = term.rows;
            } catch {
                // ignore
            }
            const wsUrl = buildUrl(cols, rows, true);
            const authError = await streamAuth(wsUrl);
            if (disposed) return;
            if (authError) {
                setConnState('error');
                setErrorMsg(authError);
                term.write(`\x1b[31m${authError}\x1b[m\r\n`);
                return;
            }

            ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (disposed) return;
                setConnState('connected');
                send({ type: 'resize', cols: term.cols, rows: term.rows });
                // 重连后由服务端按 session 回放输出，这里不需要补发输入
            };
            ws.onmessage = (ev) => {
                if (disposed) return;
                try {
                    const msg = JSON.parse(String(ev.data)) as {
                        type?: string;
                        data?: string;
                        id?: string;
                        timestamp?: number;
                        message?: string;
                    };
                    switch (msg.type) {
                        case 'cmd':
                            if (msg.data) {
                                const text = decodeBase64(msg.data);
                                if (text) term.write(text);
                            }
                            break;
                        case 'session':
                            if (msg.id) {
                                sessionIdRef.current = msg.id;
                                onSessionChange?.(msg.id);
                            }
                            break;
                        case 'heartbeat':
                            // 用于保活，无需展示
                            break;
                        default:
                            break;
                    }
                } catch {
                    // 忽略非 JSON 帧
                }
            };
            ws.onclose = (ev: CloseEvent) => {
                if (disposed) return;
                setConnState('closed');
                setErrorMsg(ev.code === 1000 ? '' : `${ev.reason || ev.code}`);
                term.write(`\x1b[31m${t('host.terminal.disconnected')}\x1b[m\r\n`);
            };
            ws.onerror = () => {
                if (disposed) return;
                setConnState('error');
            };

            const heartbeat = window.setInterval(() => {
                send({ type: 'heartbeat', timestamp: `${Date.now()}` });
            }, 10_000);

            const inputDisposable = term.onData((data) => send({ type: 'cmd', data: encodeBase64(data) }));
            cleanups.push(() => inputDisposable.dispose());
            cleanups.push(() => window.clearInterval(heartbeat));
            window.addEventListener('resize', scheduleFit);
            window.addEventListener('focus', scheduleFit);
        };

        void connect();

        return () => {
            disposed = true;
            window.removeEventListener('resize', scheduleFit);
            window.removeEventListener('focus', scheduleFit);
            try {
                ws?.close(1000);
            } catch {
                // ignore
            }
            wsRef.current = null;
            cleanups.forEach((fn) => fn());
            // 延迟销毁：xterm 的 Viewport 在 open 时会 setTimeout(syncScrollArea)，
            // 若在此同步 dispose（React StrictMode 双调用），该回调会访问已释放的
            // renderService 并抛错。延后一个事件循环可让其先执行完毕。
            const instance = term;
            window.setTimeout(() => {
                try {
                    instance.dispose();
                } catch {
                    // ignore
                }
            }, 0);
            if (termRef.current === term) termRef.current = null;
            if (fitRef.current === fit) fitRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seq, endpoint, paramsString, operateNode, initCommand]);

    const statusText =
        connState === 'connected'
            ? t('host.terminal.connected')
            : connState === 'connecting'
              ? t('host.terminal.connecting')
              : connState === 'error'
                ? t('host.terminal.error')
                : t('host.terminal.disconnected');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height, minHeight: 300, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 10px',
                    fontSize: 12,
                    backgroundColor: 'var(--muted)',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <span
                    className={
                        connState === 'connected'
                            ? 'bg-emerald-600 dark:bg-emerald-400'
                            : connState === 'connecting'
                              ? 'bg-amber-600 dark:bg-amber-400'
                              : 'bg-destructive'
                    }
                    style={{ width: 8, height: 8, borderRadius: '50%' }}
                />
                <span className="text-muted-foreground">{statusText}</span>
                {errorMsg && (
                    <span className="min-w-0 truncate text-destructive">
                        {errorMsg}
                    </span>
                )}
                {connState !== 'connected' && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => setSeq((s) => s + 1)}
                    >
                        <RefreshCwIcon data-icon="inline-start" />
                        {t('host.terminal.reconnect')}
                    </Button>
                )}
            </div>
            <div ref={hostRef} style={{ flex: 1, minHeight: 0, padding: 6, backgroundColor: '#14151a' }} />
        </div>
    );
}