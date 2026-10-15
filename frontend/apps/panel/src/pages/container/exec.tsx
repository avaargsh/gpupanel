import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Select, Space, Typography } from '@douyinfe/semi-ui';
import { IconTerminal } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useListContainersQuery, type ContainerInfo } from '@/api/containerApi';
import Terminal from '@/components/Terminal';
import { useAppSelector } from '@/store/hooks';

const { Text } = Typography;

interface ContainerExecProps {
    target: ContainerInfo | null;
}

/**
 * 容器 exec 页签：通过 WebSocket（/hosts/terminal/container）在容器内开启交互式终端。
 * 复用 Host 模块沉淀的 Terminal 组件（上行 cmd/resize/heartbeat，下行 cmd/session/heartbeat）。
 */
export default function ContainerExec({ target }: ContainerExecProps) {
    const { t } = useTranslation();
    const currentNode = useAppSelector((s) => s.ui.currentNode);

    const [containerName, setContainerName] = useState('');
    const [command, setCommand] = useState('/bin/sh');
    const [user, setUser] = useState('');
    const [session, setSession] = useState<{ id: string; name: string; command: string; user: string } | null>(null);

    const listQuery = useListContainersQuery();
    const options = useMemo(() => {
        const list = listQuery.data ?? [];
        // 优先展示运行中的容器
        const running = list.filter((c) => c.state === 'running');
        const others = list.filter((c) => c.state !== 'running');
        return [...running, ...others].map((c) => ({
            label: `${c.name} (${c.state})`,
            value: c.name,
        }));
    }, [listQuery.data]);

    useEffect(() => {
        if (target) {
            setContainerName(target.name);
            setSession(null);
        }
    }, [target]);

    const connect = () => {
        if (!containerName) return;
        setSession({ id: `${containerName}-${Date.now()}`, name: containerName, command, user });
    };

    if (listQuery.isError) {
        return (
            <Card title={t('container.exec.title')}>
                <Empty title={t('container.overview.noData')} description={t('container.overview.backendOffline')} style={{ padding: '24px 0' }} />
            </Card>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card title={t('container.exec.title')}>
                <Space spacing={12} wrap>
                    <Select
                        placeholder={t('container.exec.selectContainer')}
                        value={containerName || undefined}
                        optionList={options}
                        filter
                        style={{ width: 260 }}
                        onChange={(v) => setContainerName(String(v))}
                    />
                    <Input
                        value={command}
                        onChange={setCommand}
                        style={{ width: 200 }}
                        prefix={<Text type="tertiary">{t('container.exec.command')}</Text>}
                    />
                    <Input
                        value={user}
                        onChange={setUser}
                        style={{ width: 160 }}
                        placeholder={t('container.exec.userPlaceholder')}
                        prefix={<Text type="tertiary">{t('container.exec.user')}</Text>}
                    />
                    <Button type="primary" icon={<IconTerminal />} disabled={!containerName} onClick={connect}>
                        {t('container.exec.connect')}
                    </Button>
                </Space>
                <Text type="tertiary" size="small" style={{ display: 'block', marginTop: 8 }}>
                    {t('container.exec.hint')}
                </Text>
            </Card>

            {session && (
                <Card
                    title={`${t('container.exec.terminal')} · ${session.name}`}
                    bodyStyle={{ padding: 12 }}
                >
                    <Terminal
                        key={session.id}
                        endpoint="/hosts/terminal/container"
                        operateNode={currentNode || 'local'}
                        queryParams={{
                            source: 'container',
                            containerid: session.name,
                            command: session.command || '/bin/sh',
                            user: session.user,
                        }}
                        height="46vh"
                    />
                </Card>
            )}
        </div>
    );
}
