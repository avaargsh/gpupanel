import type { ReactNode } from 'react';
import { Card, Progress } from '@douyinfe/semi-ui';

export interface StatCardProps {
    title: string;
    value: string;
    percent?: number;
    icon: ReactNode;
    color?: string;
    /** Compact variant for the developer workbench summary only. */
    compact?: boolean;
}

export default function StatCard({ title, value, percent, icon, color = 'var(--semi-color-primary)', compact = false }: StatCardProps) {
    return (
        <Card className={compact ? 'workbench-stat-card' : undefined} style={{ height: '100%' }} bodyStyle={{ padding: compact ? 14 : 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 10 }}>
                <div
                    style={{
                        width: compact ? 30 : 34,
                        height: compact ? 30 : 34,
                        borderRadius: compact ? 8 : 10,
                        display: 'grid',
                        placeItems: 'center',
                        color,
                        backgroundColor: 'var(--semi-color-fill-0)',
                    }}
                >
                    {icon}
                </div>
                <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--semi-color-text-2)' }}>{title}</span>
            </div>
            <div style={{ fontSize: compact ? 22 : 26, fontWeight: 700, letterSpacing: -0.5, marginTop: compact ? 8 : 12 }}>{value}</div>
            {typeof percent === 'number' && (
                <Progress
                    percent={Math.max(0, Math.min(100, percent))}
                    showInfo={false}
                    stroke={color}
                    style={{ marginTop: 12 }}
                    aria-label={title}
                />
            )}
        </Card>
    );
}
