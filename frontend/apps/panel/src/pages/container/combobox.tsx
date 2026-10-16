import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';

export interface ComboboxOption {
    label: string;
    value: string;
}

export interface ComboboxProps {
    options: ComboboxOption[];
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    emptyText?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * 可搜索下拉：
 * Popover + Command 组合，保留按名称过滤的能力。
 */
export function Combobox({ options, value, onChange, placeholder, emptyText, disabled, className }: ComboboxProps) {
    const [open, setOpen] = useState(false);
    const selected = options.find((option) => option.value === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('justify-between font-normal', className)}
                >
                    <span className="truncate">{selected ? selected.label : (placeholder ?? '')}</span>
                    <ChevronsUpDownIcon data-icon="inline-end" className="opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-60 p-0">
                <Command>
                    <CommandInput placeholder={placeholder} />
                    <CommandList>
                        <CommandEmpty>{emptyText ?? ''}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    key={option.value}
                                    value={option.value}
                                    keywords={[option.label]}
                                    onSelect={(next) => {
                                        onChange(next);
                                        setOpen(false);
                                    }}
                                >
                                    <CheckIcon
                                        className={cn('mr-1', value === option.value ? 'opacity-100' : 'opacity-0')}
                                    />
                                    <span className="truncate">{option.label}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
