import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export interface StatCardProps {
    title: string;
    value: string;
    percent?: number;
    icon: ReactNode;
    color?: string;
    /** Compact variant for the developer workbench summary only. */
    compact?: boolean;
}

export default function StatCard({ title, value, percent, icon, color = 'var(--primary)', compact = false }: StatCardProps) {
    return (
        <Card className={cn('h-full', compact ? 'workbench-stat-card [--card-spacing:14px]' : '[--card-spacing:18px]')}>
            <CardContent>
                <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 10 }}>
                    <div
                        style={{
                            width: compact ? 30 : 34,
                            height: compact ? 30 : 34,
                            borderRadius: compact ? 8 : 10,
                            display: 'grid',
                            placeItems: 'center',
                            color,
                            backgroundColor: 'var(--muted)',
                        }}
                    >
                        {icon}
                    </div>
                    <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--muted-foreground)' }}>{title}</span>
                </div>
                <div style={{ fontSize: compact ? 22 : 26, fontWeight: 700, letterSpacing: -0.5, marginTop: compact ? 8 : 12 }}>{value}</div>
                {typeof percent === 'number' && (
                    <Progress
                        value={Math.max(0, Math.min(100, percent))}
                        aria-label={title}
                        className="mt-3 [&>[data-slot=progress-indicator]]:bg-current"
                        style={{ color }}
                    />
                )}
            </CardContent>
        </Card>
    );
}
