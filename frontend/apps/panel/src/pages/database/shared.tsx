import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PencilIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** 输入防抖：用于搜索框，避免每次按键都触发请求 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);
    return debounced;
}

interface DescriptionCellProps {
    value?: string;
    onSave: (next: string) => Promise<void> | void;
}

/**
 * 备注单元格：展示文本 + 编辑按钮，点击弹出输入框保存。
 * 各引擎的描述接口不同，保存逻辑由调用方注入（保持展示组件纯粹）。
 */
export function DescriptionCell({ value, onSave }: DescriptionCellProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(value ?? '');
    const [saving, setSaving] = useState(false);

    const openEditor = () => {
        setDraft(value ?? '');
        setOpen(true);
    };

    const handleOk = async () => {
        setSaving(true);
        try {
            await onSave(draft.trim());
            setOpen(false);
        } catch {
            // 保存失败时保持弹窗打开；调用方已负责错误提示
        } finally {
            setSaving(false);
        }
    };

    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={value ? 'text-sm text-primary' : 'text-sm text-muted-foreground'}>{value || '-'}</span>
            <Button variant="ghost" size="icon-sm" onClick={openEditor} aria-label={t('database.common.description')}>
                <PencilIcon />
            </Button>
            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!saving) setOpen(next);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('database.common.description')}</DialogTitle>
                    </DialogHeader>
                    <Field>
                        <FieldLabel htmlFor="resource-description">{t('database.common.description')}</FieldLabel>
                        <Input
                            id="resource-description"
                            value={draft}
                            maxLength={256}
                            onChange={(e) => setDraft(e.target.value)}
                        />
                    </Field>
                    <DialogFooter>
                        <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleOk} disabled={saving}>
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </span>
    );
}
