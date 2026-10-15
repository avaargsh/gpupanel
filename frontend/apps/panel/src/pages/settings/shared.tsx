import type { ReactNode } from 'react';
import { Typography } from '@douyinfe/semi-ui';

const { Text } = Typography;

export const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 统一的「标签 + 内容 + 操作」行，用于各类设置项。 */
export function SettingRow({
    label,
    value,
    action,
    help,
}: {
    label: ReactNode;
    value: ReactNode;
    action?: ReactNode;
    help?: ReactNode;
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
            <div style={{ minWidth: 160 }}>
                <Text>{label}</Text>
                {help ? (
                    <div>
                        <Text type="tertiary" size="small">
                            {help}
                        </Text>
                    </div>
                ) : null}
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
                <Text style={{ maxWidth: 560, textAlign: 'right', wordBreak: 'break-all' }} type="tertiary">
                    {value}
                </Text>
                {action}
            </div>
        </div>
    );
}

/** 弹窗内的「标签 + 控件」字段。 */
export function Field({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 6 }}>
                <Text strong>{label}</Text>
            </div>
            {children}
            {help ? (
                <div style={{ marginTop: 6 }}>
                    <Text type="tertiary" size="small">
                        {help}
                    </Text>
                </div>
            ) : null}
        </div>
    );
}

/** 布尔/开关型设置值 → Yes/No 展示。 */
export function enabledLabel(value: string, enabled: string, disabled: string): string {
    return value === 'Enable' ? enabled : disabled;
}
