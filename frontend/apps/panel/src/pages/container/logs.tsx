import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, InputNumber, Select, Space, Switch, Typography } from '@douyinfe/semi-ui';
import { IconPlay, IconRefresh, IconStop } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useListContainersQuery, type ContainerInfo } from '@/api/containerApi';
import { getCookie } from '@/utils/cookie';
import { useAppSelector } from '@/store/hooks';

const { Text } = Typography;

const MAX_LINES = 3000;

/** 与 Terminal 一致的鉴权探测：仅 401/403/313 等鉴权错误才阻断 */
const AUTH_ERROR_STATUS = new Set([401, 403, 313]);
const AUTH_ERROR_CODE = new Set([401, 403, 412, 313]);

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
            if (typeof data.code === 'number' && AUTH_ERROR_CODE.has(data.code)) return data.message ?? String(data.code);
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
            <Card title={t('container.logs.title')}>
                <Empty title={t('container.overview.noData')} description={t('container.overview.backendOffline')} style={{ padding: '24px 0' }} />
            </Card>
        );
    }

    return (
        <Card
            title={t('container.logs.title')}
            headerExtraContent={
                <Space>
                    <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>{t('home.refresh')}</Button>
                    {streaming ? (
                        <Button type="danger" icon={<IconStop />} onClick={stop}>{t('container.logs.stop')}</Button>
                    ) : (
                        <Button type="primary" icon={<IconPlay />} disabled={!containerName} onClick={start}>{t('container.logs.start')}</Button>
                    )}
                </Space>
            }
        >
            <Space spacing={12} wrap style={{ marginBottom: 12 }}>
                <Select
                    placeholder={t('container.logs.selectContainer')}
                    value={containerName || undefined}
                    optionList={options}
                    filter
                    style={{ width: 240 }}
                    onChange={(v) => setContainerName(String(v))}
                />
                <Select
                    value={since}
                    style={{ width: 120 }}
                    optionList={[
                        { label: t('container.logs.sinceAll'), value: 'all' },
                        { label: '30m', value: '30m' },
                        { label: '1h', value: '1h' },
                        { label: '6h', value: '6h' },
                        { label: '12h', value: '12h' },
                        { label: '24h', value: '24h' },
                    ]}
                    onChange={(v) => setSince(String(v))}
                />
                <Space spacing={4}>
                    <Text size="small">{t('container.logs.tail')}</Text>
                    <InputNumber value={tail} min={0} max={10000} style={{ width: 100 }} onChange={(v) => setTail(Number(v ?? 0))} />
                </Space>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Switch size="small" checked={follow} onChange={setFollow} />
                    <Text size="small">{t('container.logs.follow')}</Text>
                </label>
                <Space spacing={4}>
                    <Switch size="small" checked={timestamp} onChange={setTimestamp} />
                    <Text size="small">{t('container.logs.timestamp')}</Text>
                </Space>
            </Space>

            {errorMsg && <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>{errorMsg}</Text>}

            <pre
                ref={outRef}
                style={{
                    margin: 0,
                    height: '52vh',
                    overflow: 'auto',
                    padding: 12,
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: '#e8eaf0',
                    background: '#14151a',
                    borderRadius: 8,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                }}
                data-testid="container-log-output"
            >
                {output || (streaming ? t('container.logs.waiting') : t('container.logs.placeholder'))}
            </pre>
        </Card>
    );
}
