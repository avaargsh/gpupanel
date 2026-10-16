import type { ReactNode } from 'react';

export interface DescriptionItem {
    key: string;
    value: ReactNode;
}

/**
 * 基础设施页面共用的原生标签与值网格。
 */
export function Descriptions({ data, column = 1 }: { data: DescriptionItem[]; column?: number }) {
    return (
        <dl className="grid gap-x-6 gap-y-3" style={{ gridTemplateColumns: `repeat(${column}, minmax(0, 1fr))` }}>
            {data.map((item) => (
                <div key={item.key} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">{item.key}</dt>
                    <dd className="min-w-0 text-sm break-words">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}
