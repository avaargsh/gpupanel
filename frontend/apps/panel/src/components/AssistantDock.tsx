import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { WandSparklesIcon } from 'lucide-react';
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
    const page = currentNav(location.pathname, location.search);
    const copyDraft = async () => {
        try { await navigator.clipboard.writeText(draft); setFeedback(t('workbench.assistantCopied')); }
        catch { setFeedback(t('workbench.assistantCopyFailed')); }
    };
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button
                    type="button"
                    aria-label={t('workbench.assistantLauncher')}
                    title={t('workbench.assistantLauncher')}
                    className="assistant-launcher"
                    variant="outline"
                    size="icon"
                >
                    <WandSparklesIcon />
                </Button>
            </SheetTrigger>
            <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 sm:max-w-[460px]">
                <div className="assistant-heading">
                    <SheetTitle>GPUPanel Assistant</SheetTitle>
                    <Button type="button" variant="ghost" aria-label={t('common.close')} onClick={() => setOpen(false)}>{t('common.close')}</Button>
                </div>
                <SheetDescription className="sr-only">{t('workbench.assistantContext')}</SheetDescription>
                <div className="assistant-body">
                    <div className="assistant-conversation">
                        <div className="assistant-context">
                            <small>{t('workbench.assistantContext')}</small>
                            <strong>{t(page?.labelKey || 'workbench.title')}</strong>
                            <span>{node === 'local' ? t('workbench.local') : node}</span>
                        </div>
                        <div className="assistant-intro">
                            <span className="assistant-intro-icon" aria-hidden="true"><WandSparklesIcon className="size-5" /></span>
                            <p className="assistant-intro-title" role="status">{t('workbench.assistantUnavailable', 'Chat is not connected yet')}</p>
                            <p className="assistant-description">{t('workbench.assistantDescription')}</p>
                        </div>
                        <nav className="assistant-links" aria-label={t('workbench.tools')}>
                            {workstationLinks.map((link) => <Link key={link.path} to={link.path} onClick={() => setOpen(false)}>{t(link.labelKey)}</Link>)}
                        </nav>
                    </div>
                    <div className="assistant-composer">
                        <label htmlFor="assistant-draft">{t('workbench.assistantDraft')}</label>
                        <Textarea className="assistant-textarea" id="assistant-draft" value={draft} maxLength={2000} rows={4}
                            onChange={(event) => { setDraft(event.target.value); if (feedback) setFeedback(''); }} />
                        <div className="assistant-composer-actions">
                            <span role="status" aria-live="polite">{feedback}</span>
                            <Button type="button" size="sm" disabled={!draft.trim()} onClick={copyDraft}>{t('workbench.assistantCopy')}</Button>
                        </div>
                        <p className="assistant-description">{t('workbench.assistantPrivacy')}</p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
