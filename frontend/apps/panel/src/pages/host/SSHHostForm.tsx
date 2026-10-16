import { useId, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
/** Saved SSH credentials remain scoped to the existing host API; never submit a command. */
export default function SSHHostForm({
    initial,
    editing,
    busy,
    onSubmit,
    onCancel,
}: {
    initial: Record<string, unknown>;
    editing: boolean;
    busy: boolean;
    onSubmit: (values: Record<string, unknown>) => Promise<void>;
    onCancel: () => void;
}) {
    const { t } = useTranslation();
    const prefix = useId();
    const textFields = ['name', 'addr', 'port', 'user', 'password', 'privateKey', 'passPhrase', 'description'] as const;
    const required = new Set(['name', 'addr', 'port', 'user']);
    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(event.currentTarget);
        const values: Record<string, unknown> = Object.fromEntries(data.entries());
        values.rememberPassword = data.get('rememberPassword') === 'on';
        void onSubmit(values);
    };
    return (
        <form onSubmit={submit}>
            <FieldGroup>
                {textFields.map((name) => {
                    const id = `${prefix}-${name}`;
                    const secret = name === 'password' || name === 'passPhrase';
                    const multiline = name === 'privateKey' || name === 'description';
                    return (
                        <Field key={name} data-disabled={busy}>
                            <FieldLabel htmlFor={id}>{t(`host.terminal.${name}`)}</FieldLabel>
                            {multiline ? (
                                <Textarea
                                    id={id}
                                    name={name}
                                    disabled={busy}
                                    rows={name === 'privateKey' ? 4 : 2}
                                    defaultValue={String(initial[name] ?? '')}
                                    placeholder={editing && name === 'privateKey' ? t('host.terminal.keepSecretPlaceholder') : undefined}
                                />
                            ) : (
                                <Input
                                    id={id}
                                    name={name}
                                    disabled={busy}
                                    required={required.has(name)}
                                    type={secret ? 'password' : name === 'port' ? 'number' : 'text'}
                                    min={name === 'port' ? 1 : undefined}
                                    max={name === 'port' ? 65535 : undefined}
                                    defaultValue={String(initial[name] ?? '')}
                                    autoComplete={secret ? 'new-password' : 'off'}
                                    placeholder={editing && secret ? t('host.terminal.keepSecretPlaceholder') : undefined}
                                />
                            )}
                        </Field>
                    );
                })}
                <Field data-disabled={busy}>
                    <FieldLabel htmlFor={`${prefix}-auth`}>{t('host.terminal.authMode')}</FieldLabel>
                    <NativeSelect
                        id={`${prefix}-auth`}
                        name="authMode"
                        disabled={busy}
                        defaultValue={String(initial.authMode ?? 'password')}
                    >
                        <NativeSelectOption value="password">{t('host.terminal.passwordMode')}</NativeSelectOption>
                        <NativeSelectOption value="key">{t('host.terminal.keyMode')}</NativeSelectOption>
                    </NativeSelect>
                </Field>
                <Field orientation="horizontal">
                    <Input
                        id={`${prefix}-remember`}
                        name="rememberPassword"
                        type="checkbox"
                        className="size-4"
                        disabled={busy}
                        defaultChecked={Boolean(initial.rememberPassword)}
                    />
                    <FieldLabel htmlFor={`${prefix}-remember`}>{t('host.terminal.rememberPassword')}</FieldLabel>
                </Field>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
                        {t('host.terminal.cancel')}
                    </Button>
                    <Button type="submit" disabled={busy}>
                        {busy && <Spinner data-icon="inline-start" />}
                        {t('host.terminal.save')}
                    </Button>
                </div>
            </FieldGroup>
        </form>
    );
}
