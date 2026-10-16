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
                <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-2.5')}>
                    <div
                        className={cn(
                            'grid place-items-center bg-muted',
                            compact ? 'size-[30px] rounded-lg' : 'size-[34px] rounded-[10px]',
                        )}
                        style={{ color }}
                    >
                        {icon}
                    </div>
                    <span className={cn('font-semibold text-muted-foreground', compact ? 'text-xs' : 'text-[13px]')}>{title}</span>
                </div>
                <div className={cn('font-bold tracking-[-0.5px]', compact ? 'text-[22px] mt-2' : 'text-[26px] mt-3')}>{value}</div>
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
