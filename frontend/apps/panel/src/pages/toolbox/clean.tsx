import { useMemo, useState } from 'react';
import { Button, Collapse, Modal, Space, Toast, Tree, Typography } from '@douyinfe/semi-ui';
import type { TreeNodeData } from '@douyinfe/semi-ui/lib/es/tree';
import { useTranslation } from 'react-i18next';
import {
    useCleanSystemMutation,
    useGetToolboxSettingQuery,
    useScanSystemMutation,
    type CleanData,
    type CleanItem,
    type CleanTree,
} from '@/api/toolboxApi';
import { formatBytes } from '@/utils/format';
import { errText } from './shared';

const { Text } = Typography;

const LABEL_KEYS: Record<string, string> = {
    'gpupanel_original': 'clean.panelOriginal',
    upgrade: 'clean.upgrade',
    agent_packages: 'clean.agentPackages',
    snapshot: 'clean.snapshot',
    rollback: 'clean.rollback',
    tmp_backup: 'clean.tmpBackup',
    unknown_app: 'clean.unknownApp',
    unknown_database: 'clean.unknownDatabase',
    unknown_website: 'clean.unknownWebsite',
    unknown_snapshot: 'clean.unknownSnapshot',
    container_images: 'clean.images',
    container_containers: 'clean.containers',
    container_volumes: 'clean.volumes',
};

const GROUPS: { key: string; field: keyof CleanData; labelKey: string }[] = [
    { key: 'system', field: 'systemClean', labelKey: 'clean.system' },
    { key: 'backup', field: 'backupClean', labelKey: 'clean.backup' },
    { key: 'docker', field: 'containerClean', labelKey: 'clean.docker' },
    { key: 'upload', field: 'uploadClean', labelKey: 'clean.upload' },
    { key: 'download', field: 'downloadClean', labelKey: 'clean.download' },
    { key: 'systemLog', field: 'systemLogClean', labelKey: 'clean.systemLog' },
];

const normalizeChecked = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    if (v && typeof v === 'object' && Array.isArray((v as { checked?: unknown[] }).checked)) {
        return (v as { checked: unknown[] }).checked.map(String);
    }
    return [];
};

export default function CleanTab() {
    const { t } = useTranslation();
    const { data: setting, refetch: refetchSetting } = useGetToolboxSettingQuery();
    const [scan, { isLoading: scanning }] = useScanSystemMutation();
    const [clean, { isLoading: cleaning }] = useCleanSystemMutation();

    const [data, setData] = useState<CleanData | null>(null);
    const [checked, setChecked] = useState<string[]>([]);
    const [phase, setPhase] = useState<'idle' | 'scanned' | 'done'>('idle');
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

    const label = (l: string) => (LABEL_KEYS[l] ? t(LABEL_KEYS[l]) : l || '-');

    const buildNodes = (key: string, nodes: CleanTree[]): TreeNodeData[] =>
        nodes.map((n) => ({
            key: `${key}/${n.id}`,
            label: (
                <span>
                    {label(n.label)}
                    <Text type="tertiary" size="small" style={{ marginLeft: 8 }}>
                        {formatBytes(n.size)}
                    </Text>
                </span>
            ),
            children: n.children?.length ? buildNodes(`${key}/${n.id}`, n.children) : undefined,
        }));

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
            setPhase('scanned');
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doClean = () => {
        Modal.confirm({
            title: t('clean.clean'),
            content: t('clean.cleanHelper'),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                const items: CleanItem[] = [];
                for (const [k, n] of Object.entries(nodeMap)) {
                    if (checkedSet.has(k) && n.canDelete) items.push({ treeType: n.type, name: n.name, size: n.size });
                }
                try {
                    await clean(items).unwrap();
                    setResult({ count: items.length, size: selectedSize });
                    setPhase('done');
                    Toast.success(t('clean.cleanSuccessful'));
                    refetchSetting();
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space>
                <Button theme="solid" type="primary" loading={scanning} onClick={doScan}>
                    {t('clean.scan')}
                </Button>
                {phase === 'scanned' && (
                    <Button type="danger" loading={cleaning} disabled={selectedSize <= 0} onClick={doClean}>
                        {t('clean.clean')}
                    </Button>
                )}
            </Space>

            {phase === 'idle' && (
                <div>
                    {setting?.lastCleanTime ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Text>{t('clean.lastCleanTime', { time: setting.lastCleanTime })}</Text>
                            <Text type="tertiary">
                                {t('clean.lastCleanHelper', {
                                    num: setting.lastCleanData || '-',
                                    size: setting.lastCleanSize ? formatBytes(Number(setting.lastCleanSize)) : '-',
                                })}
                            </Text>
                        </div>
                    ) : (
                        <Text type="tertiary">{t('clean.scanFirst')}</Text>
                    )}
                </div>
            )}

            {phase === 'done' && result && (
                <div>
                    <Text strong>{t('clean.cleanSuccessful')}</Text>
                    <div style={{ marginTop: 6 }}>
                        <Text>{t('clean.currentCleanHelper', { num: result.count, size: formatBytes(result.size) })}</Text>
                    </div>
                </div>
            )}

            {phase === 'scanned' && data && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Text strong>
                        {t('clean.totalScan')}
                        {formatBytes(topSize)}
                    </Text>
                    <Text type="tertiary">
                        {t('clean.selectScan')}
                        {formatBytes(selectedSize)}
                    </Text>
                    <Collapse defaultActiveKey={GROUPS.map((g) => g.key)}>
                        {GROUPS.map((g) => {
                            const nodes = data[g.field] ?? [];
                            return (
                                <Collapse.Panel header={t(g.labelKey)} itemKey={g.key} key={g.key}>
                                    {nodes.length === 0 ? (
                                        <Text type="tertiary">{t('clean.statusEmpty')}</Text>
                                    ) : (
                                        <Tree
                                            checkable
                                            defaultExpandAll
                                            treeData={buildNodes(g.key, nodes)}
                                            value={checked}
                                            onChange={(v) => setChecked(normalizeChecked(v))}
                                        />
                                    )}
                                </Collapse.Panel>
                            );
                        })}
                    </Collapse>
                </div>
            )}
        </div>
    );
}