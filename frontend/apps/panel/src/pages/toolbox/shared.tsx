import { useEffect, useState, type ReactNode } from 'react';
import { Button, Modal, TabPane, Tabs, TextArea, Toast, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 统一的「标签 + 内容 + 设置按钮」行，用于系统设备等快速设置页。 */
export function SettingRow({
    label,
    value,
    onSet,
    setLabel,
}: {
    label: ReactNode;
    value: ReactNode;
    onSet?: () => void;
    setLabel: string;
}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                padding: '10px 0',
                borderBottom: '1px solid var(--semi-color-border)',
            }}
        >
            <Text style={{ minWidth: 160 }}>{label}</Text>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                <Text style={{ maxWidth: 560, textAlign: 'right', wordBreak: 'break-all' }}>{value}</Text>
                {onSet ? (
                    <Button size="small" onClick={onSet}>
                        {setLabel}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

/** 简单的表单字段容器（标签在上、说明在下）。 */
export function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Text strong>{label}</Text>
            {children}
            {help ? (
                <Text size="small" type="tertiary">
                    {help}
                </Text>
            ) : null}
        </div>
    );
}

/** 原始配置文件编辑页签：`load` 拉取内容，`save` 存在则可编辑，否则只读（如日志文件）。 */
export interface ConfigTab {
    key: string;
    label: string;
    load: () => Promise<string>;
    save?: (content: string) => Promise<unknown>;
    readOnly?: boolean;
}

/**
 * 原始配置文件编辑器（对齐旧版 CodeMirror 编辑器，v2 用 Semi `TextArea` 代替）。
 * 支持多文件页签（系统设备的 DNS / Hosts、病毒扫描的 clamd / freshclam 及日志）。
 */
export function ConfigEditorModal({
    title,
    tabs,
    onClose,
}: {
    title: string;
    tabs: ConfigTab[];
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const [active, setActive] = useState(tabs[0]?.key ?? '');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const current = tabs.find((tab) => tab.key === active);

    useEffect(() => {
        const tab = tabs.find((item) => item.key === active);
        if (!tab) return undefined;
        let cancelled = false;
        setLoading(true);
        tab.load()
            .then((value) => {
                if (!cancelled) setContent(value ?? '');
            })
            .catch((e) => {
                if (!cancelled) {
                    Toast.error(errText(e));
                    setContent('');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // 仅在切换页签 / 挂载时拉取，tabs 由父组件一次性传入
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    const doSave = async () => {
        if (!current?.save) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            await current.save(content);
            Toast.success(t('toolbox.config.saved'));
            onClose();
        } catch (e) {
            Toast.error(errText(e));
        } finally {
            setSaving(false);
        }
    };

    const footer = current?.readOnly ? (
        <Button onClick={onClose}>{t('common.close')}</Button>
    ) : undefined;

    return (
        <Modal
            title={title}
            visible
            width={800}
            confirmLoading={saving}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
            onOk={doSave}
            onCancel={onClose}
            footer={footer}
        >
            <Tabs type="button" activeKey={active} onChange={(key) => setActive(String(key))}>
                {tabs.map((tab) => (
                    <TabPane tab={tab.label} itemKey={tab.key} key={tab.key} />
                ))}
            </Tabs>
            <TextArea
                value={content}
                onChange={setContent}
                readOnly={Boolean(current?.readOnly) || loading}
                autosize={{ minRows: 16, maxRows: 26 }}
                placeholder={loading ? t('toolbox.config.loading') : ''}
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', marginTop: 12 }}
            />
        </Modal>
    );
}
