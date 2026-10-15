import { useEffect, useState } from 'react';
import { Button, Modal, Typography } from '@douyinfe/semi-ui';
import { IconEdit } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

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

    const openEditor = () => {
        setDraft(value ?? '');
        setOpen(true);
    };

    const handleOk = async () => {
        await onSave(draft.trim());
        setOpen(false);
    };

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Text size="small" type={value ? 'primary' : 'tertiary'}>
                {value || '-'}
            </Text>
            <Button size="small" theme="borderless" icon={<IconEdit />} onClick={openEditor} />
            <Modal
                title={t('database.common.description')}
                visible={open}
                onOk={handleOk}
                onCancel={() => setOpen(false)}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                width={420}
            >
                <input
                    className="semi-input semi-input-default"
                    style={{ width: '100%', height: 32, padding: '0 12px', borderRadius: 4 }}
                    value={draft}
                    maxLength={256}
                    onChange={(e) => setDraft(e.target.value)}
                />
            </Modal>
        </span>
    );
}
