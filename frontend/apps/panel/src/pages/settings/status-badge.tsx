import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

export type StatusTone = "green" | "red" | "blue" | "orange" | "purple" | "grey";
/** Status text stays authoritative; the shared theme supplies contrast in both modes. */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
    return <Badge variant={tone === "red" ? "destructive" : tone === "grey" ? "outline" : "secondary"}>{children}</Badge>;
}
