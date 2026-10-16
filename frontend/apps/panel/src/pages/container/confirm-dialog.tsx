import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRef, useState } from 'react';

export interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmText: string;
    cancelText: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
}

/** Await the owned operation before allowing another confirmation or dismissal. */
export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText,
    cancelText,
    destructive = false,
    onConfirm,
}: ConfirmDialogProps) {
    const busy = useRef(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const confirm = async () => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setError('');
        try {
            await onConfirm();
            onOpenChange(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            busy.current = false;
            setPending(false);
        }
    };
    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                if (!busy.current) {
                    setError('');
                    onOpenChange(next);
                }
            }}
        >
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
                </AlertDialogHeader>
                {error ? (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                ) : null}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>{cancelText}</AlertDialogCancel>
                    <Button variant={destructive ? 'destructive' : 'default'} disabled={pending} aria-busy={pending} onClick={confirm}>
                        {pending ? <Spinner aria-hidden="true" /> : null}
                        {confirmText}
                    </Button>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
