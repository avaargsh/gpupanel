import { useListContainersQuery, type ContainerInfo } from '@/api/containerApi';
import Terminal from '@/components/Terminal';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useAppSelector } from '@/store/hooks';
import { TerminalIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox } from './combobox';

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
            <Card>
                <CardHeader>
                    <CardTitle>{t('container.exec.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Empty>
                        <EmptyHeader>
                            <EmptyTitle>{t('container.overview.noData')}</EmptyTitle>
                            <EmptyDescription>{t('container.overview.backendOffline')}</EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="module-section">
            <Card>
                <CardHeader>
                    <CardTitle>{t('container.exec.title')}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <Combobox
                            className="w-[260px]"
                            options={options}
                            value={containerName || undefined}
                            onChange={setContainerName}
                            placeholder={t('container.exec.selectContainer')}
                            emptyText={t('container.overview.noData')}
                        />
                        <InputGroup className="w-[200px]">
                            <InputGroupAddon>{t('container.exec.command')}</InputGroupAddon>
                            <InputGroupInput value={command} onChange={(e) => setCommand(e.target.value)} />
                        </InputGroup>
                        <InputGroup className="w-[160px]">
                            <InputGroupAddon>{t('container.exec.user')}</InputGroupAddon>
                            <InputGroupInput
                                value={user}
                                placeholder={t('container.exec.userPlaceholder')}
                                onChange={(e) => setUser(e.target.value)}
                            />
                        </InputGroup>
                        <Button disabled={!containerName} onClick={connect}>
                            <TerminalIcon data-icon="inline-start" />
                            {t('container.exec.connect')}
                        </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('container.exec.hint')}</p>
                </CardContent>
            </Card>

            {session && (
                <Card>
                    <CardHeader>
                        <CardTitle>{`${t('container.exec.terminal')} · ${session.name}`}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3">
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
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
