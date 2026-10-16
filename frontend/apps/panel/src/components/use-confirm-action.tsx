import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Spinner } from '@/components/ui/spinner';

export interface ConfirmActionRequest {
    title: string;
    description?: ReactNode;
    run: () => void | Promise<void>;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

/** Native, page-owned confirmation: execution stays pending until the promise settles. */
export function useConfirmAction() {
    const { t } = useTranslation();
    const [request, setRequest] = useState<ConfirmActionRequest | null>(null);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const active = useRef<ConfirmActionRequest | null>(null);
    const running = useRef(false);
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = null; }; }, []);
    const close = () => {
        if (running.current) return;
        active.current = null;
        setRequest(null);
        setError('');
    };
    const confirm = (next: ConfirmActionRequest): boolean => {
        if (active.current || running.current) return false;
        active.current = next;
        setError('');
        setRequest(next);
        return true; // Queued for consent, not an execution-success receipt.
    };
    const execute = async () => {
        const current = active.current;
        if (!current || running.current) return;
        running.current = true;
        setPending(true);
        setError('');
        try {
            await current.run();
            if (active.current === current) {
                active.current = null;
                setRequest(null);
            }
        } catch {
            if (active.current === current) setError(t('common.operationFailed', 'Request failed. Check the target before retrying.'));
        } finally {
            running.current = false;
            if (mounted.current) setPending(false);
        }
    };
    const dialog = <AlertDialog open={Boolean(request)} onOpenChange={(open) => { if (!open) close(); }}>
        <AlertDialogContent onEscapeKeyDown={(event) => { if (running.current) event.preventDefault(); }}>
            <AlertDialogHeader>
                <AlertDialogTitle>{request?.title}</AlertDialogTitle>
                <AlertDialogDescription>{request?.description || t('common.confirm')}</AlertDialogDescription>
            </AlertDialogHeader>
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>{request?.cancelLabel || t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction disabled={pending} variant={request?.destructive ? 'destructive' : 'default'} onClick={(event) => { event.preventDefault(); void execute(); }}>
                    {pending && <Spinner data-icon="inline-start" />}{request?.confirmLabel || t('common.confirm')}
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>;
    return { confirm, dialog, pending };
}
