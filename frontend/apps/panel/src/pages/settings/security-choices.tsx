import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const NO_AUTH_CODES = ["200", "400", "401", "403", "404", "408", "416", "444", "500"];

export type SafeEdit = "port" | "bind" | "entrance" | "noAuth" | "allowIPs" | "bindDomain" | "expiration" | "ssl" | null;

export function randomEntrance(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 10; i += 1) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

export function ChoiceToggle({
    value,
    options,
    onChange,
}: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (next: string) => void;
}) {
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="text-foreground"
            value={value}
            onValueChange={(next) => {
                if (next) onChange(next);
            }}
        >
            {options.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                    {option.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}
