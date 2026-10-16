import { useConfirmAction } from '@/components/use-confirm-action';
import SSHHostForm from './SSHHostForm';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { RefreshCw, Plus, TerminalIcon, Wrench } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Terminal from '@/components/Terminal';
import { useAppSelector } from '@/store/hooks';
import {
    useCreateHostMutation,
    useDeleteHostMutation,
    useSearchHostsQuery,
    useTestHostByIDMutation,
    useUpdateHostMutation,
    type Host,
    type HostOperate,
} from '@/api/hostApi';
type TerminalTarget =
    | {
          kind: 'local';
      }
    | {
          kind: 'ssh';
          id: number;
          title: string;
      };
const emptyOperate: HostOperate = {
    isLocal: false,
    id: 0,
    name: '',
    groupID: 0,
    addr: '',
    port: 22,
    user: 'root',
    authMode: 'password',
    password: '',
    privateKey: '',
    passPhrase: '',
    rememberPassword: true,
    description: '',
};
/**
 * 终端页签：已保存 SSH 主机列表（增删改查）+ xterm 终端（本地 / 已保存主机）。
 */
export default function HostTerminal() {
    const { confirm, dialog } = useConfirmAction();

    const { t } = useTranslation();
    const currentNode = useAppSelector((state) => state.ui.currentNode) || 'local';
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);
    const listQuery = useSearchHostsQuery({ page: 1, pageSize: 100, info: debouncedSearch });
    const hosts = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
    const [createHost] = useCreateHostMutation();
    const [updateHost] = useUpdateHostMutation();
    const [deleteHost] = useDeleteHostMutation();
    const [testHostByID, { isLoading: testing }] = useTestHostByIDMutation();
    // ---------- 添加/编辑弹窗 ----------
    const [modalOpen, setModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<Host | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const openCreate = () => {
        setEditingHost(null);
        setModalOpen(true);
    };
    const openEdit = (row: Host) => {
        setEditingHost(row);
        setModalOpen(true);
    };
    const handleSubmit = async (values: Record<string, unknown>) => {
        const authModeRaw = String(values.authMode ?? 'password');
        const authMode = authModeRaw === 'key' ? ('key' as const) : ('password' as const);
        const payload: HostOperate = {
            isLocal: false,
            id: editingHost?.id ?? 0,
            name: String(values.name ?? ''),
            groupID: 0,
            addr: String(values.addr ?? ''),
            port: Number(values.port ?? 22),
            user: String(values.user ?? ''),
            authMode,
            password: String(values.password ?? ''),
            privateKey: String(values.privateKey ?? ''),
            passPhrase: String(values.passPhrase ?? ''),
            rememberPassword: Boolean(values.rememberPassword),
            description: String(values.description ?? ''),
        };
        setSubmitting(true);
        try {
            if (editingHost) {
                await updateHost(payload).unwrap();
                toast.success(t('host.terminal.updateSuccess'));
            } else {
                await createHost(payload).unwrap();
                toast.success(t('host.terminal.addSuccess'));
            }
            setModalOpen(false);
        } catch (e) {
            const msg =
                (
                    e as {
                        data?: {
                            message?: string;
                        };
                    }
                ).data?.message ?? String(e);
            toast.error(msg);
        } finally {
            setSubmitting(false);
        }
    };
    const handleDelete = (row: Host) => {
        confirm({
            title: t('host.terminal.deleteTitle'),
            description: t('host.terminal.deleteContent', { name: row.name }),
            run: async () => {
                try {
                    await deleteHost([row.id]).unwrap();
                    toast.success(t('host.terminal.deleteSuccess'));
                } catch (e) {
                    const msg =
                        (
                            e as {
                                data?: {
                                    message?: string;
                                };
                            }
                        ).data?.message ?? String(e);
                    toast.error(msg);
                }
            },
        });
    };
    const handleTest = async (row: Host) => {
        try {
            await testHostByID(row.id).unwrap();
            toast.success(t('host.terminal.testSuccess'));
        } catch (e) {
            const msg =
                (
                    e as {
                        data?: {
                            message?: string;
                        };
                    }
                ).data?.message ?? String(e);
            toast.error(`${t('host.terminal.testError')}: ${msg}`);
        }
    };
    // ---------- 终端目标 ----------
    const [target, setTarget] = useState<TerminalTarget>({ kind: 'local' });
    const targetKey = target.kind === 'local' ? 'local' : `ssh-${target.id}`;
    const endpoint = target.kind === 'local' ? '/api/v1/hosts/terminal/local' : '/api/v1/hosts/terminal/ssh';
    const queryParams = target.kind === 'ssh' ? { id: target.id } : undefined;
    const targetLabel = target.kind === 'local' ? t('host.terminal.local') : `${target.title} (${t('host.terminal.remote')})`;
    const initValues: Record<string, unknown> = editingHost
        ? {
              name: editingHost.name,
              addr: editingHost.addr,
              port: editingHost.port,
              user: editingHost.user,
              authMode: editingHost.authMode || 'password',
              password: editingHost.password || '',
              privateKey: editingHost.privateKey || '',
              passPhrase: editingHost.passPhrase || '',
              rememberPassword: editingHost.rememberPassword ?? true,
              description: editingHost.description ?? '',
          }
        : { ...emptyOperate };
    return (
        <>
            {dialog}
            <div className="host-terminal">
                {listQuery.isError ? (
                    <Card className="host-terminal-card">
                        <CardContent className="host-terminal-empty">
                            <Empty className="py-6">
                                <EmptyHeader>
                                    <EmptyTitle>{t('host.overview.noData')}</EmptyTitle>
                                    <EmptyDescription>{t('host.terminal.backendOffline')}</EmptyDescription>
                                </EmptyHeader>
                            </Empty>
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="host-terminal-card">
                        <CardHeader>
                            <CardTitle>{t('host.terminal.hosts')}</CardTitle>
                            <CardAction>
                                <div className="flex flex-row gap-3 items-center">
                                    <Button onClick={() => listQuery.refetch()} variant={'outline'} type={'button'}>
                                        {<RefreshCw />}
                                        {t('home.refresh')}
                                    </Button>
                                    <Button onClick={openCreate} variant={'default'} type={'button'}>
                                        {<Plus />}
                                        {t('host.terminal.add')}
                                    </Button>
                                </div>
                            </CardAction>
                        </CardHeader>
                        <CardContent>
                            <Input
                                aria-label={t('host.terminal.search')}
                                value={searchInput}
                                placeholder={t('host.terminal.search')}
                                className="max-w-[280px] mb-3"
                                onChange={(event) => setSearchInput(event.target.value)}
                            />
                            <div className="flex flex-col gap-3" aria-busy={listQuery.isFetching}>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('host.terminal.name')}</TableHead>
                                            <TableHead>{t('host.terminal.addr')}</TableHead>
                                            <TableHead>{t('host.terminal.user')}</TableHead>
                                            <TableHead>{t('host.terminal.authMode')}</TableHead>
                                            <TableHead className="w-[260px]">{t('host.terminal.actions')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {listQuery.isFetching ? (
                                            <TableRow>
                                                <TableCell colSpan={5}>
                                                    <Spinner role="status" aria-label="Loading" />
                                                </TableCell>
                                            </TableRow>
                                        ) : hosts.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5}>{t('host.terminal.empty')}</TableCell>
                                            </TableRow>
                                        ) : (
                                            hosts.map((row, rowIndex) => (
                                                <TableRow key={row['id'] ?? rowIndex}>
                                                    <TableCell>{<strong className="text-sm">{row.name}</strong>}</TableCell>
                                                    <TableCell>{`${row.addr}:${row.port}`}</TableCell>
                                                    <TableCell>{row['user']}</TableCell>
                                                    <TableCell>
                                                        {row['authMode'] === 'key'
                                                            ? t('host.terminal.keyMode')
                                                            : t('host.terminal.passwordMode')}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-row gap-3 items-center">
                                                            <Button
                                                                onClick={() =>
                                                                    setTarget({ kind: 'ssh', id: row.id, title: row.name })
                                                                }
                                                                variant={'default'}
                                                                size="sm"
                                                                type={'button'}
                                                            >
                                                                {<TerminalIcon />}
                                                                {t('host.terminal.connect')}
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleTest(row)}
                                                                variant={'outline'}
                                                                size="sm"
                                                                type={'button'}
                                                                disabled={false || testing}
                                                            >
                                                                {testing ? <Spinner data-icon="inline-start" /> : <Wrench />}
                                                                {t('host.terminal.test')}
                                                            </Button>
                                                            <Button
                                                                onClick={() => openEdit(row)}
                                                                variant={'outline'}
                                                                size="sm"
                                                                type={'button'}
                                                            >
                                                                {t('host.terminal.edit')}
                                                            </Button>
                                                            <Button
                                                                onClick={() => handleDelete(row)}
                                                                variant={'destructive'}
                                                                size="sm"
                                                                type={'button'}
                                                            >
                                                                {t('host.terminal.delete')}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <Card className="host-terminal-card">
                <CardHeader>
                    <CardTitle>
                        <div className="flex flex-row gap-3 items-center">
                            <TerminalIcon />
                            <span>{t('host.terminal.title')}</span>
                            <span className="text-muted-foreground text-sm ml-2">
                                {targetLabel}
                            </span>
                        </div>
                    </CardTitle>
                    <CardAction>
                        <div className="flex flex-row gap-3 items-center">
                            <Button
                                onClick={() => setTarget({ kind: 'local' })}
                                variant={
                                    (target.kind === 'local' ? 'primary' : 'tertiary') === 'primary' ? 'default' : 'outline'
                                }
                                size="sm"
                                type={'button'}
                            >
                                {t('host.terminal.local')}
                            </Button>
                            <NativeSelect
                                aria-label={t('host.terminal.chooseHost')}
                                className="w-[220px]"
                                onChange={(event) =>
                                    ((id) => {
                                        const h = hosts.find((x) => x.id === Number(id));
                                        if (h) setTarget({ kind: 'ssh', id: h.id, title: h.name });
                                    })(
                                        hosts
                                            .map((h) => ({ label: `${h.name} (${h.addr})`, value: h.id }))
                                            .find((option) => String(option.value) === event.target.value)?.value ??
                                            event.target.value,
                                    )
                                }
                            >
                                <NativeSelectOption value="" disabled>
                                    {t('host.terminal.chooseHost')}
                                </NativeSelectOption>
                                {hosts
                                    .map((h) => ({ label: `${h.name} (${h.addr})`, value: h.id }))
                                    .map((option) => (
                                        <NativeSelectOption key={String(option.value)} value={option.value}>
                                            {option.label}
                                        </NativeSelectOption>
                                    ))}
                            </NativeSelect>
                        </div>
                    </CardAction>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="p-3">
                        <Terminal
                            key={targetKey}
                            endpoint={endpoint}
                            queryParams={queryParams}
                            operateNode={currentNode}
                            height="46vh"
                        />
                    </div>
                </CardContent>
            </Card>

            <Dialog
                open={modalOpen}
                onOpenChange={(open) => {
                    if (!open) setModalOpen(false);
                }}
            >
                <DialogContent
                    aria-describedby={undefined}
                    className="max-h-[90vh] overflow-y-auto w-[560px]"
                    onInteractOutside={(event) => event.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle>{editingHost ? t('host.terminal.edit') : t('host.terminal.add')}</DialogTitle>
                    </DialogHeader>
                    <SSHHostForm
                        key={editingHost ? `edit-${editingHost.id}` : 'new'}
                        initial={initValues}
                        editing={!!editingHost}
                        busy={submitting}
                        onSubmit={handleSubmit}
                        onCancel={() => setModalOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
