import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useConfirmAction } from "@/components/use-confirm-action";
import type { TFunction } from "i18next";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
    useCleanSystemMutation,
    useGetToolboxSettingQuery,
    useScanSystemMutation,
    type CleanData,
    type CleanItem,
    type CleanTree,
} from "@/api/toolboxApi";
import { formatBytes } from "@/utils/format";
import { useTranslation } from "react-i18next";
import { errText } from "./shared";

const LABEL_KEYS: Record<string, string> = {
    gpupanel_original: "clean.panelOriginal",
    upgrade: "clean.upgrade",
    agent_packages: "clean.agentPackages",
    snapshot: "clean.snapshot",
    rollback: "clean.rollback",
    tmp_backup: "clean.tmpBackup",
    unknown_app: "clean.unknownApp",
    unknown_database: "clean.unknownDatabase",
    unknown_website: "clean.unknownWebsite",
    unknown_snapshot: "clean.unknownSnapshot",
    container_images: "clean.images",
    container_containers: "clean.containers",
    container_volumes: "clean.volumes",
};

const GROUPS: { key: string; field: keyof CleanData; labelKey: string }[] = [
    { key: "system", field: "systemClean", labelKey: "clean.system" },
    { key: "backup", field: "backupClean", labelKey: "clean.backup" },
    { key: "docker", field: "containerClean", labelKey: "clean.docker" },
    { key: "upload", field: "uploadClean", labelKey: "clean.upload" },
    { key: "download", field: "downloadClean", labelKey: "clean.download" },
    { key: "systemLog", field: "systemLogClean", labelKey: "clean.systemLog" },
];

function CleanNodes({
    nodes,
    scope,
    checked,
    onChange,
    t,
}: {
    nodes: CleanTree[];
    scope: string;
    checked: string[];
    onChange: (keys: string[]) => void;
    t: TFunction;
}) {
    const selectableKeys = (node: CleanTree, key: string): string[] => [
        ...(node.canDelete ? [key] : []),
        ...(node.children ?? []).flatMap((child) => selectableKeys(child, `${key}/${child.id}`)),
    ];
    return (
        <ul className="flex flex-col gap-2 pl-4">
            {nodes.map((node) => {
                const key = `${scope}/${node.id}`;
                const keys = selectableKeys(node, key);
                const count = keys.filter((item) => checked.includes(item)).length;
                return (
                    <li key={key} className="flex flex-col gap-2">
                        <label className="flex items-center gap-2">
                            <Checkbox
                                disabled={keys.length === 0}
                                checked={count === 0 ? false : count === keys.length ? true : "indeterminate"}
                                onCheckedChange={(next) =>
                                    onChange(
                                        next ? Array.from(new Set([...checked, ...keys])) : checked.filter((item) => !keys.includes(item)),
                                    )
                                }
                            />
                            {LABEL_KEYS[node.label] ? t(LABEL_KEYS[node.label]) : node.label || "-"}
                            <span className="text-muted-foreground">{formatBytes(node.size)}</span>
                        </label>
                        {node.children?.length ? (
                            <CleanNodes nodes={node.children} scope={key} checked={checked} onChange={onChange} t={t} />
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

export default function CleanTab() {
    const { confirm, dialog: confirmationDialog } = useConfirmAction();
    const { t } = useTranslation();
    const { data: setting, refetch: refetchSetting } = useGetToolboxSettingQuery();
    const [scan, { isLoading: scanning }] = useScanSystemMutation();
    const [clean, { isLoading: cleaning }] = useCleanSystemMutation();

    const [data, setData] = useState<CleanData | null>(null);
    const [checked, setChecked] = useState<string[]>([]);
    const [phase, setPhase] = useState<"idle" | "scanned" | "done">("idle");
    const [result, setResult] = useState<{ count: number; size: number } | null>(null);

    const nodeMap = useMemo(() => {
        const map: Record<string, CleanTree> = {};
        if (!data) return map;
        const walk = (key: string, nodes: CleanTree[]) => {
            for (const node of nodes) {
                const k = `${key}/${node.id}`;
                map[k] = node;
                if (node.children?.length) walk(k, node.children);
            }
        };
        for (const g of GROUPS) walk(g.key, data[g.field] ?? []);
        return map;
    }, [data]);

    const topSize = useMemo(() => {
        if (!data) return 0;
        let sum = 0;
        for (const g of GROUPS) for (const n of data[g.field] ?? []) sum += n.size;
        return sum;
    }, [data]);

    const checkedSet = useMemo(() => new Set(checked), [checked]);
    const selectedSize = useMemo(() => {
        let sum = 0;
        for (const [k, n] of Object.entries(nodeMap)) {
            if (checkedSet.has(k) && n.canDelete) sum += n.size;
        }
        return sum;
    }, [nodeMap, checkedSet]);

    const doScan = async () => {
        try {
            const res = await scan().unwrap();
            setData(res);
            const defaults: string[] = [];
            const walk = (key: string, nodes: CleanTree[]) => {
                for (const n of nodes) {
                    const k = `${key}/${n.id}`;
                    if (n.canDelete && n.isCheck) defaults.push(k);
                    if (n.children?.length) walk(k, n.children);
                }
            };
            for (const g of GROUPS) walk(g.key, res[g.field] ?? []);
            setChecked(defaults);
            setPhase("scanned");
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const doClean = () => {
        confirm({
            title: t("clean.clean"),
            description: t("clean.cleanHelper"),
            confirmLabel: t("common.confirm"),
            cancelLabel: t("common.cancel"),
            run: async () => {
                const items: CleanItem[] = [];
                for (const [k, n] of Object.entries(nodeMap)) {
                    if (checkedSet.has(k) && n.canDelete) items.push({ treeType: n.type, name: n.name, size: n.size });
                }
                try {
                    await clean(items).unwrap();
                    setResult({ count: items.length, size: selectedSize });
                    setPhase("done");
                    toast.success(t("clean.cleanSuccessful"));
                    refetchSetting();
                } catch (e) {
                    toast.error(errText(e));
                }
            },
        });
    };

    return (
        <>
            {confirmationDialog}
            {
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button onClick={doScan} type="button" variant="default" disabled={scanning}>
                            {scanning ? <Spinner data-icon="inline-start" /> : null}
                            {t("clean.scan")}
                        </Button>
                        {phase === "scanned" && (
                            <Button onClick={doClean} type="button" variant="destructive" disabled={selectedSize <= 0 || cleaning}>
                                {cleaning ? <Spinner data-icon="inline-start" /> : null}
                                {t("clean.clean")}
                            </Button>
                        )}
                    </div>

                    {phase === "idle" && (
                        <div>
                            {setting?.lastCleanTime ? (
                                <div className="flex flex-col gap-1.5">
                                    <span>{t("clean.lastCleanTime", { time: setting.lastCleanTime })}</span>
                                    <span className="text-muted-foreground">
                                        {t("clean.lastCleanHelper", {
                                            num: setting.lastCleanData || "-",
                                            size: setting.lastCleanSize ? formatBytes(Number(setting.lastCleanSize)) : "-",
                                        })}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-muted-foreground">{t("clean.scanFirst")}</span>
                            )}
                        </div>
                    )}

                    {phase === "done" && result && (
                        <div>
                            <strong>{t("clean.cleanSuccessful")}</strong>
                            <div className="mt-1.5">
                                <span>{t("clean.currentCleanHelper", { num: result.count, size: formatBytes(result.size) })}</span>
                            </div>
                        </div>
                    )}

                    {phase === "scanned" && data && (
                        <div className="flex flex-col gap-3">
                            <strong>
                                {t("clean.totalScan")}
                                {formatBytes(topSize)}
                            </strong>
                            <span className="text-muted-foreground">
                                {t("clean.selectScan")}
                                {formatBytes(selectedSize)}
                            </span>
                            <Accordion type="multiple" defaultValue={GROUPS.map((group) => group.key)}>
                                {GROUPS.map((group) => (
                                    <AccordionItem key={group.key} value={group.key}>
                                        <AccordionTrigger>{t(group.labelKey)}</AccordionTrigger>
                                        <AccordionContent>
                                            {(data[group.field] ?? []).length === 0 ? (
                                                <span className="text-muted-foreground">{t("clean.statusEmpty")}</span>
                                            ) : (
                                                <CleanNodes
                                                    nodes={data[group.field] ?? []}
                                                    scope={group.key}
                                                    checked={checked}
                                                    onChange={setChecked}
                                                    t={t}
                                                />
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                    )}
                </div>
            }
        </>
    );
}
