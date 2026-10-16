import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { useId, type ReactNode } from 'react';
export function ConfigField({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
    const id = useId();
    return (
        <Field aria-labelledby={id}>
            <FieldLabel id={id}>{label}</FieldLabel>
            {children}
            {help ? <FieldDescription>{help}</FieldDescription> : null}
        </Field>
    );
}
