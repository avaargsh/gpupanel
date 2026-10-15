import { useEffect, useRef, useState } from 'react';
import { Button, TextArea, Space } from '@douyinfe/semi-ui';
import { IconAIWandLevel1 } from '@douyinfe/semi-icons';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { workstationLinks } from './FirstRun';
import { currentNav } from '@/config/nav';
import { useAppSelector } from '@/store/hooks';

/** Optional draft only: no chat/execution provider, credentials or automatic log collection. */
export default function AssistantDock() {
    const node = useAppSelector((s) => s.ui.currentNode) || 'local';
    return <AssistantPanel key={node} node={node} />;
}
function AssistantPanel({ node }: { node: string }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [feedback, setFeedback] = useState('');
    const { t } = useTranslation();
    const location = useLocation();
    const dialog = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        if (open && !dialog.current?.open) dialog.current?.showModal();
        if (!open && dialog.current?.open) dialog.current.close();
    }, [open]);
    const page = currentNav(location.pathname, location.search);
    return <>
        <Button aria-label={t('workbench.assistantLauncher')} title={t('workbench.assistantLauncher')} className="assistant-launcher" icon={<IconAIWandLevel1 />} onClick={() => setOpen(true)} />
        <dialog ref={dialog} className="workspace-assistant" aria-labelledby="assistant-title"
            onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClose={() => setOpen(false)}>
            <header className="assistant-heading"><h2 id="assistant-title">GPUPanel Assistant</h2><Button aria-label={t('common.close')} onClick={() => setOpen(false)}>{t('common.close')}</Button></header>
            <div className="assistant-body">
            <div className="assistant-context"><small>{t('workbench.assistantContext')}</small><strong>{t(page?.labelKey || 'workbench.title')}</strong><span>{node === 'local' ? t('workbench.local') : node}</span></div>
            <p role="status">{t('workbench.assistantUnavailable', 'Chat is not connected yet')}</p>
            <p className="assistant-description">{t('workbench.assistantDescription')}</p>
            <label htmlFor="assistant-draft">{t('workbench.assistantDraft')}</label>
            <TextArea id="assistant-draft" value={draft} maxCount={2000} rows={7} onChange={setDraft} />
            <Button disabled={!draft.trim()} onClick={async () => {
                try { await navigator.clipboard.writeText(draft); setFeedback(t('workbench.assistantCopied')); }
                catch { setFeedback(t('workbench.assistantCopyFailed')); }
            }}>{t('workbench.assistantCopy')}</Button>
            <span role="status">{feedback}</span>
            <p className="assistant-description">{t('workbench.assistantPrivacy')}</p>
            <Space wrap>{workstationLinks.map((link) => <Link key={link.path} to={link.path} onClick={() => setOpen(false)}>{t(link.labelKey)}</Link>)}</Space>
            </div>
        </dialog>
    </>;
}
