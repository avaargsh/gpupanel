import { FieldDescription, FieldLabel, Field as FieldRoot } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";

export const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 统一的「标签 + 内容 + 操作」行，用于各类设置项。 */
export function SettingRow({ label, value, action, help }: { label: ReactNode; value: ReactNode; action?: ReactNode; help?: ReactNode }) {
    return (
        <>
            <div className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="sm:min-w-40">
                    <div className="text-sm">{label}</div>
                    {help ? <div className="text-xs text-muted-foreground">{help}</div> : null}
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-3 sm:justify-end">
                    <div className="max-w-[560px] text-sm break-all text-muted-foreground">{value}</div>
                    {action}
                </div>
            </div>
            <Separator />
        </>
    );
}

/** 弹窗内的「标签 + 控件」字段（跨目录复用：openresty 等仍从这里引入）。 */
export function Field({ label, help, children }: { label: ReactNode; help?: ReactNode; children: ReactNode }) {
    const generated = useId();
    let controlID = generated;
    let attached = false;
    const bind = (nodes: ReactNode): ReactNode =>
        Children.map(nodes, (node) => {
            if (!isValidElement<{ id?: string; children?: ReactNode; "aria-describedby"?: string }>(node)) return node;
            if (!attached && [Input, InputGroupInput, Textarea, NativeSelect, Switch].some((control) => control === node.type)) {
                attached = true;
                controlID = node.props.id || generated;
                return cloneElement(node, {
                    id: controlID,
                    "aria-describedby": help ? `${generated}-help` : node.props["aria-describedby"],
                });
            }
            return node.props.children ? cloneElement(node, { children: bind(node.props.children) }) : node;
        });
    const controls = bind(children);
    return (
        <FieldRoot className="mb-2">
            <FieldLabel htmlFor={attached ? controlID : undefined}>{label}</FieldLabel>
            {controls}
            {help ? <FieldDescription id={`${generated}-help`}>{help}</FieldDescription> : null}
        </FieldRoot>
    );
}

/** 布尔/开关型设置值 → Yes/No 展示。 */
export function enabledLabel(value: string, enabled: string, disabled: string): string {
    return value === "Enable" ? enabled : disabled;
}
