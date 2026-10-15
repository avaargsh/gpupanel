import { Banner, Button, Card, Space } from '@douyinfe/semi-ui';
import { Link } from 'react-router-dom';
import { useGetContainerStatusQuery, useGetDockerStatusQuery } from '@/api/containerApi';
import { useAppSelector } from '@/store/hooks';

export const workstationLinks = [
    { path: '/host?tab=overview', label: '主机 / Host' },
    { path: '/host?tab=monitor', label: '监控 / Monitor' },
    { path: '/host?tab=terminal', label: '终端 / Terminal' },
    { path: '/containers', label: 'Docker' },
    { path: '/apps', label: '本地应用 / Local applications' },
    { path: '/ai?tab=gpu', label: 'GPU' },
    { path: '/ai?tab=accounts', label: '模型账户 / Model accounts' },
];
export default function FirstRun() {
    const node = useAppSelector((state) => state.ui.currentNode) || 'local';
    const daemon = useGetDockerStatusQuery();
    const containers = useGetContainerStatusQuery(undefined, { skip: !daemon.currentData?.isActive });
    let status = '正在检查 Docker / Checking Docker';
    if (daemon.isError || containers.isError) status = 'Docker 状态不可用 / Docker status unavailable';
    else if (daemon.currentData && !daemon.currentData.isExist) status = 'Docker 未安装 / Docker not installed';
    else if (daemon.currentData && !daemon.currentData.isActive) status = 'Docker 未运行 / Docker inactive';
    else if (typeof containers.currentData?.running === 'number' && Number.isFinite(containers.currentData.running)) status = `Docker · ${containers.currentData.running} running`;
    return <Card title="工作站起步 / Workstation first run">
        <p>Host: {node}</p>
        <Banner type="info" description={status} closeIcon={null} />
        {daemon.isError || containers.isError ? <Button onClick={() => { void daemon.refetch(); if (daemon.currentData?.isActive) void containers.refetch(); }}>重试 / Retry</Button> : null}
        <Space wrap style={{ marginTop: 12 }}>{workstationLinks.map((link) => <Link key={link.path} to={link.path}>{link.label}</Link>)}</Space>
        <p>状态观察不代表安装验收完成 / Observations do not prove installation acceptance.</p>
    </Card>;
}
