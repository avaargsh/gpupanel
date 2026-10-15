import type { ReactNode } from 'react';
import { Card, Progress } from '@douyinfe/semi-ui';

export interface StatCardProps {
    title: string;
    value: string;
    percent?: number;
    icon: ReactNode;
    color?: string;
}

export default function StatCard({ title, value, percent, icon, color = 'var(--semi-color-primary)' }: StatCardProps) {
    return (
        <Card style={{ height: '100%' }} bodyStyle={{ padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        display: 'grid',
                        placeItems: 'center',
                        color,
                        backgroundColor: 'var(--semi-color-fill-0)',
                    }}
                >
                    {icon}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--semi-color-text-2)' }}>{title}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, marginTop: 12 }}>{value}</div>
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
