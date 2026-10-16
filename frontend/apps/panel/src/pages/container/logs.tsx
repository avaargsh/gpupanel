import { useListContainersQuery, type ContainerInfo } from '@/api/containerApi';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { useAppSelector } from '@/store/hooks';
import { getCookie } from '@/utils/cookie';
import { PlayIcon, RefreshCwIcon, SquareIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox } from './combobox';

const MAX_LINES = 3000;

/** 与 Terminal 一致的鉴权探测：仅 401/403/313 等鉴权错误才阻断 */
const AUTH_ERROR_STATUS = new Set([401, 403, 313]);
const AUTH_ERROR_CODE = new Set([401, 403, 412, 313]);

const SINCE_OPTIONS = ['all', '30m', '1h', '6h', '12h', '24h'];

interface ContainerLogsProps {
    target: ContainerInfo | null;
}

/**
 * 容器日志页签：SSE（EventSource）流式读取 docker logs。
 * 对齐旧前端 components/log/container 的实现（先做一次 HTTP 鉴权探测，再开 SSE）。
 */
export default function ContainerLogs({ target }: ContainerLogsProps) {
    const { t } = useTranslation();
    const language = useAppSelector((s) => s.ui.language);
    const currentNode = useAppSelector((s) => s.ui.currentNode);

    const [containerName, setContainerName] = useState('');
    const [since, setSince] = useState('all');
    const [tail, setTail] = useState(100);
    const [follow, setFollow] = useState(true);
    const [timestamp, setTimestamp] = useState(false);

    const [output, setOutput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const esRef = useRef<EventSource | null>(null);
    const outRef = useRef<HTMLPreElement>(null);

    const listQuery = useListContainersQuery();
    const options = useMemo(
        () => (listQuery.data ?? []).map((c) => ({ label: `${c.name} (${c.state})`, value: c.name })),
        [listQuery.data],
    );

    useEffect(() => {
        if (target) {
            setContainerName(target.name);
        }
    }, [target]);

    useEffect(() => {
        return () => {
            esRef.current?.close();
        };
    }, []);

    const stop = () => {
        esRef.current?.close();
        esRef.current = null;
        setStreaming(false);
    };

    const append = (line: string) => {
        setOutput((prev) => {
            const next = prev ? `${prev}\n${line}` : line;
            const parts = next.split('\n');
            return parts.length > MAX_LINES ? parts.slice(parts.length - MAX_LINES).join('\n') : next;
        });
    };

    const checkStreamAuth = async (url: string): Promise<string> => {
        try {
            const csrf = getCookie('pcsrftoken');
            const res = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Accept-Language': language || 'zh',
                    ...(currentNode ? { CurrentNode: encodeURIComponent(currentNode) } : {}),
                    ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
                },
            });
            if (AUTH_ERROR_STATUS.has(res.status)) return `${res.status}`;
            const ct = res.headers.get('content-type') ?? '';
            if (!ct.includes('application/json')) return '';
            const data = (await res.json()) as { code?: number; message?: string };
            if (typeof data.code === 'number' && AUTH_ERROR_CODE.has(data.code))
                return data.message ?? String(data.code);
            return '';
        } catch {
            return '';
        }
    };

    const start = async () => {
        if (!containerName) return;
        stop();
        setOutput('');
        setErrorMsg('');
        const node = currentNode || 'local';
        const url = `/api/v1/containers/search/log?container=${encodeURIComponent(containerName)}&since=${encodeURIComponent(since)}&tail=${tail}&follow=${follow}&timestamp=${timestamp}&operateNode=${encodeURIComponent(node)}`;
        const authError = await checkStreamAuth(url);
        if (authError) {
            setErrorMsg(authError);
            return;
        }
        const es = new EventSource(url);
        esRef.current = es;
        setStreaming(true);
        es.onmessage = (ev) => append(ev.data);
        es.onerror = (ev: Event) => {
            const data = (ev as MessageEvent).data;
            stop();
            if (data) setErrorMsg(String(data));
        };
    };

    useEffect(() => {
        if (outRef.current) {
            outRef.current.scrollTop = outRef.current.scrollHeight;
        }
    }, [output]);

    if (listQuery.isError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{t('container.logs.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>{t('container.overview.noData')}</EmptyTitle>
                            <EmptyDescription>{t('container.overview.backendOffline')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('container.logs.title')}</CardTitle>
                <CardAction>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => listQuery.refetch()}>
                            <RefreshCwIcon data-icon="inline-start" />
                            {t('home.refresh')}
                        </Button>
                        {streaming ? (
                            <Button variant="destructive" onClick={stop}>
                                <SquareIcon data-icon="inline-start" />
                                {t('container.logs.stop')}
                            </Button>
                        ) : (
                            <Button disabled={!containerName} onClick={start}>
                                <PlayIcon data-icon="inline-start" />
                                {t('container.logs.start')}
                            </Button>
                        )}
                    </div>
                </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <Combobox
                        className="w-[240px]"
                        options={options}
                        value={containerName || undefined}
                        onChange={setContainerName}
                        placeholder={t('container.logs.selectContainer')}
                        emptyText={t('container.overview.noData')}
                    />
                    <NativeSelect
                        aria-label="since"
                        className="w-[120px]"
                        value={since}
                        onChange={(e) => setSince(e.target.value)}
                    >
                        {SINCE_OPTIONS.map((value) => (
                            <NativeSelectOption key={value} value={value}>
                                {value === 'all' ? t('container.logs.sinceAll') : value}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm">{t('container.logs.tail')}</span>
                        <Input
                            type="number"
                            min={0}
                            max={10000}
                            value={tail}
                            onChange={(e) => setTail(Math.min(10000, Math.max(0, Number(e.target.value) || 0)))}
                            className="w-[100px]"
                        />
                    </div>
                    <label className="inline-flex items-center gap-1.5">
                        <Switch checked={follow} onCheckedChange={setFollow} />
                        <span className="text-sm">{t('container.logs.follow')}</span>
                    </label>
                    <div className="inline-flex items-center gap-1.5">
                        <Switch checked={timestamp} onCheckedChange={setTimestamp} />
                        <span className="text-sm">{t('container.logs.timestamp')}</span>
                    </div>
                </div>

                {errorMsg ? <span className="text-sm text-destructive">{errorMsg}</span> : null}

                <pre
                    className="bg-muted text-foreground"
                    ref={outRef}
                    style={{
                        margin: 0,
                        height: '52vh',
                        overflow: 'auto',
                        padding: 12,
                        fontSize: 12,
                        lineHeight: 1.5,
                        borderRadius: 8,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                    }}
                    data-testid="container-log-output"
                >
                    {output || (streaming ? t('container.logs.waiting') : t('container.logs.placeholder'))}
                </pre>
            </CardContent>
        </Card>
    );
}
