import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Modal } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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
            // 等待 Modal 挂载后聚焦搜索框
            setTimeout(() => inputRef.current?.focus(), 40);
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
        <Modal
            visible={open}
            onCancel={() => close()}
            footer={null}
            header={null}
            width={560}
            centered
            bodyStyle={{ padding: 0 }}
            style={{ borderRadius: 14, overflow: 'hidden', top: '16vh' }}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--semi-color-border)',
                }}
            >
                <IconSearch style={{ color: 'var(--semi-color-text-2)' }} />
                <Input
                    ref={inputRef}
                    borderless
                    value={query}
                    placeholder={t('command.placeholder')}
                    onChange={(v) => setQuery(v)}
                    onKeyDown={onKeyDown}
                    style={{ flex: 1 }}
                />
            </div>

            <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
                {items.length === 0 && (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--semi-color-text-2)', fontSize: 13 }}>
                        {t('command.empty')}
                    </div>
                )}
                {items.map((item, index) => (
                    <div
                        key={item.path}
                        role="button"
                        tabIndex={-1}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(item.path)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 12px',
                            borderRadius: 10,
                            cursor: 'pointer',
                            color: index === active ? 'var(--semi-color-primary)' : 'var(--semi-color-text-0)',
                            backgroundColor: index === active ? 'var(--semi-color-primary-light-default)' : 'transparent',
                        }}
                    >
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{item.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 550 }}>{t(item.labelKey)}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'inherit', opacity: 0.7 }}>{item.path}</span>
                    </div>
                ))}
            </div>

            <div
                style={{
                    padding: '8px 14px',
                    fontSize: 11,
                    color: 'var(--semi-color-text-2)',
                    borderTop: '1px solid var(--semi-color-border)',
                }}
            >
                {t('command.hint')}
            </div>
        </Modal>
    );
}
