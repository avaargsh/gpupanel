import { Checkbox } from '@/components/ui/checkbox';
import { useId } from 'react';

/**
 * 复选框 + 标签的内联组合：Radix Checkbox 为按钮，需显式 id + label 关联以保证可访问性。
 */
export function CheckLine({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (value: boolean) => void;
    label: string;
}) {
    const id = useId();
    return (
        <div className="flex w-fit items-center gap-2">
            <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
            <label htmlFor={id} className="cursor-pointer text-sm">
                {label}
            </label>
        </div>
    );
}
