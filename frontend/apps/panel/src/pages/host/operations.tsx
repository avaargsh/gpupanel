import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Card, Empty, Input, Select, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@/store/hooks';
import { useGetHostOperationsQuery, usePlanHostOperationMutation, useConfirmHostOperationMutation, type HostOperation } from '@/api/hostOperationsApi';

export default function HostOperations() {
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const { t } = useTranslation();
    return node === 'local' ? <LocalOperations key={node} /> : <Empty description={t('hostOps.localOnly')} />;
}
function LocalOperations() {
    const { t } = useTranslation();
    const [kind, setKind] = useState('host.diagnose');
    const [target, setTarget] = useState('');
    const [preview, setPreview] = useState<HostOperation | null>(null);
    const [error, setError] = useState('');
    const [plan, planning] = usePlanHostOperationMutation();
    const [confirm, executing] = useConfirmHostOperationMutation();
    const receipts = useGetHostOperationsQuery(undefined, { pollingInterval: 5000, refetchOnMountOrArgChange: true });
    const epoch = useRef(0);
    const pending = useRef<{ abort(): void } | null>(null);
    const busy = planning.isLoading || executing.isLoading;
    useEffect(() => {
        epoch.current += 1;
        pending.current?.abort();
        setPreview(null); setError('');
        return () => { epoch.current += 1; pending.current?.abort(); };
    }, [kind, target]);
    const createPlan = async () => {
        const version = epoch.current;
        setError(''); setPreview(null);
        const request = plan({ kind, target: kind === 'host.diagnose' ? 'local' : target.trim(), key: crypto.randomUUID() });
        pending.current = request;
        try { const result = await request.unwrap(); if (epoch.current === version) setPreview(result); }
        catch { if (epoch.current === version) setError(t('hostOps.planError')); }
    };
    const execute = async () => {
        if (!preview) return;
        const version = epoch.current;
        const request = confirm({ id: preview.id, hash: preview.hash });
        pending.current = request;
        try { const result = await request.unwrap(); if (epoch.current === version) setPreview(result); }
        catch { if (epoch.current === version) setError(t('hostOps.uncertain')); }
        finally { void receipts.refetch(); }
    };
    const expired = preview ? Date.now() >= Date.parse(preview.expiresAt) : true;
    return <Space vertical align="start" style={{ width: '100%' }} spacing={16}>
        <Card title={t('hostOps.title')} style={{ width: '100%' }}>
            <p>{t('hostOps.description')}</p>
            <Space wrap>
                <Select aria-label={t('hostOps.operation')} value={kind} disabled={busy} onChange={(value) => setKind(String(value))}
                    optionList={[{ value: 'host.diagnose', label: t('hostOps.diagnose') }, { value: 'container.restart', label: t('hostOps.restart') }]} style={{ width: 220 }} />
                {kind === 'container.restart' && <Input aria-label={t('hostOps.containerId')} placeholder={t('hostOps.containerId')} value={target} disabled={busy} onChange={setTarget} style={{ width: 420, maxWidth: '100%' }} />}
                <Button onClick={() => void createPlan()} loading={planning.isLoading} disabled={busy || (kind === 'container.restart' && !/^[a-f0-9]{64}$/.test(target.trim()))}>{t('hostOps.preview')}</Button>
            </Space>
            {error && <Banner type="warning" description={error} closeIcon={null} style={{ marginTop: 16 }} />}
            {preview && <div style={{ marginTop: 16 }}>
                <Typography.Text strong>{preview.kind} · {t('hostOps.target')}: local · {preview.target}</Typography.Text>
                <p>{preview.impact}</p>
                <p>{t('hostOps.expires')}: {preview.expiresAt} · ID: {preview.id}</p>
                <Tag>{preview.state}</Tag>
                {preview.state === 'planned' && <Button type="danger" onClick={() => void execute()} loading={executing.isLoading} disabled={busy || expired || !!error} style={{ marginLeft: 12 }}>{t('hostOps.confirm')}</Button>}
                {preview.output && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{preview.output}</pre>}
                {preview.error && <p role="alert">{preview.error}</p>}
            </div>}
        </Card>
        <Card title={t('hostOps.receipts')} style={{ width: '100%' }}
            headerExtraContent={<Button onClick={() => void receipts.refetch()} loading={receipts.isFetching}>{t('common.refresh')}</Button>}>
            <p>{t('hostOps.retention')}</p>
            {receipts.isLoading ? <p role="status">{t('hostOps.loading')}</p> : receipts.isError ? <Banner type="danger" description={t('hostOps.loadError')} /> : !receipts.currentData?.length ? <Empty description={t('hostOps.empty')} /> :
                receipts.currentData.map((row) => <details key={row.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--semi-color-border)' }}>
                    <summary>{row.kind} · {row.state} · {row.createdAt} · {row.target}</summary>
                    <p>ID: {row.id} · {row.impact}</p>
                    {row.error && <p role="alert">{row.error}</p>}
                    {row.state === 'unknown' && <p>{t('hostOps.uncertain')}</p>}
                    <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.output || t('hostOps.noOutput')}</pre>
                    {row.state === 'planned' && <Button disabled={busy} onClick={() => { epoch.current += 1; setPreview(row); setError(''); }}>{t('hostOps.review')}</Button>}
                </details>)}
        </Card>
    </Space>;
}
