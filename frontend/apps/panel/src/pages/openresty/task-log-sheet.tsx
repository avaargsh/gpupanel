import { useLazyReadTaskLogQuery } from '@/api/logsApi';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { errText } from '@/pages/toolbox/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
export function TaskLogSheet({ taskID, onClose }: { taskID: string; onClose: () => void }) {
    const { t } = useTranslation();
    const [readTaskLog] = useLazyReadTaskLogQuery();
    const [lines, setLines] = useState<string[]>([]);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let active = true;
        setError('');
        let timer: number | undefined;
        const tick = async () => {
            try {
                const res = await readTaskLog({
                    taskID,
                    page: 1,
                    pageSize: 500,
                }).unwrap();
                if (!active) return;
                setLines(res.lines);
                setDone(res.end);
                if (!res.end) timer = window.setTimeout(tick, 2000);
            } catch (cause) {
                if (active) setError(errText(cause));
            }
        };
        tick();
        return () => {
            active = false;
            if (timer) window.clearTimeout(timer);
        };
    }, [taskID, readTaskLog, attempt]);

    return (
        <Sheet open onOpenChange={(next) => !next && onClose()}>
            <SheetContent className="sm:max-w-3xl">
                <SheetHeader>
                    <SheetTitle>{t('openresty.modules.buildLog')}</SheetTitle>
                </SheetHeader>
                <pre className="log-output max-h-[70vh]">
                    {lines.length ? lines.join('\n') : t('common.loading')}
                </pre>
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>{error}</AlertTitle>
                        <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                            {t('common.retry')}
                        </Button>
                    </Alert>
                ) : null}
                {done ? <p className="text-sm text-muted-foreground">{t('openresty.modules.buildFinished')}</p> : null}
            </SheetContent>
        </Sheet>
    );
}
