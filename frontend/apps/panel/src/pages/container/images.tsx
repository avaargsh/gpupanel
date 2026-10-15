import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, Modal, Space, Table, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { IconPlus, IconRefresh, IconUpload } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
    useRemoveImageMutation,
    useSearchImagesQuery,
    usePullImageMutation,
    type ImageInfo,
} from '@/api/containerApi';
import { formatBytes } from '@/utils/format';

const { Text } = Typography;

/**
 * 镜像页签：镜像列表 + 拉取 + 删除。
 */
export default function ContainerImages() {
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [nameInput, setNameInput] = useState('');
    const [name, setName] = useState('');
    const [selected, setSelected] = useState<string[]>([]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setName(nameInput);
            setPage(1);
        }, 300);
        return () => window.clearTimeout(timer);
    }, [nameInput]);

    const listQuery = useSearchImagesQuery({ page, pageSize, name, orderBy: 'createdAt', order: 'descending' });
    const rows = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

    const [removeImage] = useRemoveImageMutation();
    const [pullImage, { isLoading: pulling }] = usePullImageMutation();
    const [pullOpen, setPullOpen] = useState(false);

    const confirmRemove = (names: string[]) => {
        Modal.confirm({
            title: t('container.images.removeTitle'),
            content: t('container.images.removeContent', { names: names.join(', ') }),
            okButtonProps: { type: 'danger' },
            onOk: async () => {
                try {
                    await removeImage({ names }).unwrap();
                    Toast.success(t('container.images.removeSuccess'));
                    setSelected([]);
                } catch (e) {
                    Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
                }
            },
        });
    };

    const handlePull = async (values: Record<string, unknown>) => {
        const imageName = String(values.imageName ?? '')
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
        try {
            await pullImage({ imageName, repoID: 0 }).unwrap();
            Toast.success(t('container.images.pullSuccess'));
            setPullOpen(false);
        } catch (e) {
            Toast.error((e as { data?: { message?: string } }).data?.message ?? String(e));
        }
    };

    const columns = [
        {
            title: t('container.images.name'),
            dataIndex: 'tags',
            render: (tags: string[] | null, row: ImageInfo) => (
                <Space spacing={4} wrap>
                    {tags && tags.length ? (
                        tags.map((tag) => <Tag key={tag} color="blue">{tag}</Tag>)
                    ) : (
                        <Text size="small" type="tertiary">{row.id.slice(0, 12)}</Text>
                    )}
                    {row.isUsed && <Tag color="green">{t('container.images.inUse')}</Tag>}
                </Space>
            ),
        },
        { title: t('container.images.id'), dataIndex: 'id', width: 140, render: (v: string) => <Text size="small">{v.slice(0, 12)}</Text> },
        { title: t('container.images.size'), dataIndex: 'size', width: 120, render: (v: number) => formatBytes(v) },
        { title: t('container.images.created'), dataIndex: 'createdAt', width: 200 },
        {
            title: t('container.table.actions'),
            key: 'actions',
            width: 100,
            render: (_: unknown, row: ImageInfo) => (
                <Button size="small" type="danger" theme="borderless" disabled={row.isUsed} onClick={() => confirmRemove(row.tags && row.tags.length ? row.tags : [row.id])}>
                    {t('container.images.remove')}
                </Button>
            ),
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {listQuery.isError ? (
                <Card>
                    <Empty title={t('container.overview.noData')} description={t('container.overview.backendOffline')} style={{ padding: '24px 0' }} />
                </Card>
            ) : (
                <Card
                    title={t('container.images.title')}
                    headerExtraContent={
                        <Space>
                            <Button icon={<IconRefresh />} onClick={() => listQuery.refetch()}>{t('home.refresh')}</Button>
                            {selected.length > 0 && (
                                <Button type="danger" onClick={() => confirmRemove(selected)}>
                                    {t('container.images.remove')} ({selected.length})
                                </Button>
                            )}
                            <Button type="primary" icon={<IconPlus />} onClick={() => setPullOpen(true)}>
                                {t('container.images.pull')}
                            </Button>
                        </Space>
                    }
                >
                    <Input
                        placeholder={t('container.images.search')}
                        value={nameInput}
                        onChange={(v: string) => setNameInput(v)}
                        style={{ maxWidth: 280, marginBottom: 12 }}
                        showClear
                    />
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={rows}
                        loading={listQuery.isFetching}
                        empty={t('container.images.empty')}
                        size="small"
                        rowSelection={{
                            selectedRowKeys: selected,
                            onChange: (keys) => setSelected((keys ?? []) as string[]),
                            getCheckboxProps: (row: ImageInfo) => (row.isUsed ? { disabled: true } : {}),
                        }}
                        pagination={{
                            currentPage: page,
                            pageSize,
                            total: listQuery.data?.total ?? 0,
                            showSizeChanger: true,
                            pageSizeOpts: [10, 20, 50, 100],
                            onPageSizeChange: (size) => setPageSize(size),
                            onChange: (p) => setPage(p),
                        }}
                    />
                </Card>
            )}

            <Modal title={t('container.images.pull')} visible={pullOpen} onCancel={() => setPullOpen(false)} footer={null} maskClosable={false}>
                <Form onSubmit={handlePull}>
                    <Form.TextArea
                        field="imageName"
                        label={t('container.images.pullName')}
                        placeholder={'nginx:latest\nredis:7'}
                        rules={[{ required: true, message: t('container.images.pullRequired') }]}
                        style={{ height: 100, minHeight: 100 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                        <Button onClick={() => setPullOpen(false)}>{t('common.cancel')}</Button>
                        <Button htmlType="submit" type="primary" loading={pulling} icon={<IconUpload />}>{t('common.confirm')}</Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
