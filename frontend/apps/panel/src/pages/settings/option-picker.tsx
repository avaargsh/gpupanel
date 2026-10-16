import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PlusIcon, XIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Option {
    value: string | number;
    label: ReactNode;
    disabled?: boolean;
}
interface BaseProps {
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    creatable?: boolean;
    searchable?: boolean;
}
type Props = BaseProps &
    (
        | { multiple: true; value: string[]; onValueChange: (value: string[]) => void }
        | { multiple?: false; value: string; onValueChange: (value: string) => void }
    );

/** Searchable choices and explicit user-created entries used by cron schedules and backup forms. */
export function OptionPicker(props: Props) {
    const { t } = useTranslation();
    const id = useId();
    const [query, setQuery] = useState("");
    if (!props.multiple)
        return (
            <>
                <Input
                    list={id}
                    value={props.value}
                    disabled={props.disabled}
                    aria-label={props.placeholder || t("common.select")}
                    placeholder={props.placeholder}
                    onChange={(event) => props.onValueChange(event.target.value)}
                />
                <datalist id={id}>
                    {props.options.map((option) => (
                        <option key={option.value} value={String(option.value)}>
                            {option.label}
                        </option>
                    ))}
                </datalist>
            </>
        );
    const selected = props.value;
    const choose = (value: string, checked: boolean) => {
        if (props.disabled) return;
        props.onValueChange(checked ? Array.from(new Set([...selected, value])) : selected.filter((item) => item !== value));
    };
    const create = () => {
        const value = query.trim();
        if (!value || !props.creatable || props.disabled) return;
        choose(value, true);
        setQuery("");
    };
    const options = props.options.filter(
        (option) =>
            String(option.label).toLowerCase().includes(query.toLowerCase()) ||
            String(option.value).toLowerCase().includes(query.toLowerCase()),
    );
    return (
        <FieldSet disabled={props.disabled} className="min-w-0 gap-2">
            <FieldLegend variant="label" className="sr-only">
                {props.placeholder || t("common.select")}
            </FieldLegend>
            <div className="flex flex-wrap gap-2">
                {selected.map((value) => (
                    <Badge key={value} variant="secondary">
                        {props.options.find((option) => String(option.value) === value)?.label ?? value}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            disabled={props.disabled}
                            aria-label={`${t("common.delete")} ${value}`}
                            onClick={() => choose(value, false)}
                        >
                            <XIcon />
                        </Button>
                    </Badge>
                ))}
            </div>
            {(props.searchable || props.creatable) && (
                <div className="flex gap-2">
                    <Input
                        value={query}
                        disabled={props.disabled}
                        placeholder={props.placeholder || t("common.search")}
                        aria-label={props.placeholder || t("common.search")}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && props.creatable) {
                                event.preventDefault();
                                create();
                            }
                        }}
                    />
                    {props.creatable && (
                        <Button type="button" variant="outline" disabled={!query.trim() || props.disabled} onClick={create}>
                            <PlusIcon data-icon="inline-start" />
                            {t("common.add")}
                        </Button>
                    )}
                </div>
            )}
            <div className="max-h-48 overflow-y-auto rounded-lg border p-2">
                {options.map((option, index) => (
                    <Field key={option.value} orientation="horizontal" className="py-1">
                        <Checkbox
                            id={`${id}-${index}`}
                            disabled={props.disabled || option.disabled}
                            checked={selected.includes(String(option.value))}
                            onCheckedChange={(checked) => choose(String(option.value), checked === true)}
                        />
                        <label htmlFor={`${id}-${index}`}>{option.label}</label>
                    </Field>
                ))}
                {!options.length && <span className="text-muted-foreground">{t("common.empty")}</span>}
            </div>
        </FieldSet>
    );
}
