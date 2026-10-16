import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { flatNav } from '@/config/nav';
import { setCommandOpen } from '@/features/ui/uiSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export default function CommandPalette() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const open = useAppSelector((s) => s.ui.commandOpen);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    const items = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return flatNav;
        return flatNav.filter((item) => t(item.labelKey).toLowerCase().includes(q) || item.path.includes(q));
    }, [query, t]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActive(0);
        }
    }, [open]);

    useEffect(() => {
        setActive(0);
    }, [query]);

    const close = () => {
        dispatch(setCommandOpen(false));
    };

    const go = (path: string) => {
        navigate(path);
        close();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = items[active];
            if (target) go(target.path);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
            <DialogContent
                data-command-palette
                aria-label={t('command.title')}
                className="top-[16vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[560px]"
                onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
            >
                <DialogTitle className="sr-only">{t('command.title')}</DialogTitle>
                <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                    <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Input
                        ref={inputRef}
                        value={query}
                        placeholder={t('command.placeholder')}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        className="h-auto flex-1 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
                    />
                </div>

                <div role="listbox" aria-label={t('command.title')} className="max-h-[380px] overflow-y-auto p-2">
                    {items.length === 0 && (
                        <div className="px-4 py-7 text-center text-[13px] text-muted-foreground">
                            {t('command.empty')}
                        </div>
                    )}
                    {items.map((item, index) => (
                        <div
                            key={item.path}
                            role="option"
                            aria-selected={index === active}
                            tabIndex={-1}
                            onMouseEnter={() => setActive(index)}
                            onClick={() => go(item.path)}
                            className={cn(
                                'flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5',
                                index === active ? 'bg-accent text-primary' : 'text-foreground',
                            )}
                        >
                            <span className="inline-flex items-center">{item.icon}</span>
                            <span className="text-sm font-medium">{t(item.labelKey)}</span>
                            <span className="ml-auto text-[11px] opacity-70">{item.path}</span>
                        </div>
                    ))}
                </div>

                <div className="border-t border-border px-3.5 py-2 text-[11px] text-muted-foreground">
                    {t('command.hint')}
                </div>
            </DialogContent>
        </Dialog>
    );
}
