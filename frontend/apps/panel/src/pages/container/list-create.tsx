import {
    useCreateContainerMutation,
    useListAllImagesQuery,
    type ContainerOperate,
    type ContainerPortHelper,
    type ContainerVolumeHelper,
} from '@/api/containerApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

/** 解析端口文本，每行 "hostPort:containerPort[/proto]" 或 "containerPort" */
function parsePorts(text: string): ContainerPortHelper[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const [portsPart, protoRaw] = line.split('/');
            const protocol = protoRaw?.trim() || 'tcp';
            const [a, b] = portsPart.split(':');
            if (b !== undefined) {
                return { hostIP: '', hostPort: a.trim(), containerPort: b.trim(), protocol };
            }
            return { hostIP: '', hostPort: '', containerPort: a.trim(), protocol };
        });
}

/** 解析环境变量文本，每行 KEY=VALUE */
function parseEnv(text: string): string[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.includes('='));
}

/** 解析挂载文本，每行 "host:container[:ro|rw]" */
function parseVolumes(text: string): ContainerVolumeHelper[] {
    return text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split(':');
            const sourceDir = parts[0] ?? '';
            const containerDir = parts[1] ?? '';
            const modeRaw = parts[2];
            const mode = modeRaw === 'ro' ? 'ro' : 'rw';
            const isVolume = sourceDir && !sourceDir.startsWith('/') && !sourceDir.startsWith('~');
            return { type: isVolume ? 'volume' : 'bind', sourceDir, containerDir, mode };
        })
        .filter((v) => v.sourceDir && v.containerDir);
}

interface CreateFormState {
    name: string;
    image: string;
    network: string;
    ports: string;
    env: string;
    volumes: string;
    cmd: string;
    hostname: string;
    restartPolicy: string;
    cpus: string;
    memory: string;
    publishAllPorts: boolean;
    privileged: boolean;
    autoRemove: boolean;
}

const EMPTY_CREATE_FORM: CreateFormState = {
    name: '',
    image: '',
    network: 'bridge',
    ports: '',
    env: '',
    volumes: '',
    cmd: '',
    hostname: '',
    restartPolicy: 'no',
    cpus: '',
    memory: '',
    publishAllPorts: false,
    privileged: false,
    autoRemove: false,
};

const NETWORK_OPTIONS = ['bridge', 'host', 'none'];
const RESTART_OPTIONS = ['no', 'always', 'unless-stopped', 'on-failure'];

/** 创建容器弹窗：保留字段、默认值与请求载荷语义。 */
export function ContainerCreateDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const [createContainer] = useCreateContainerMutation();
    const imagesQuery = useListAllImagesQuery(undefined, { skip: !open });
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<CreateFormState>(EMPTY_CREATE_FORM);
    const [errors, setErrors] = useState<{ name?: string; image?: string }>({});

    useEffect(() => {
        if (open) {
            setForm(EMPTY_CREATE_FORM);
            setErrors({});
        }
    }, [open]);

    const imageOptions = useMemo(
        () => (imagesQuery.data ?? []).flatMap((img) => (img.tags?.length ? img.tags : [img.id])),
        [imagesQuery.data],
    );

    const set = <K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleSubmit = async () => {
        const nextErrors: { name?: string; image?: string } = {};
        if (!form.name.trim()) nextErrors.name = t('container.create.nameRequired');
        if (!form.image.trim()) nextErrors.image = t('container.create.imageRequired');
        if (nextErrors.name || nextErrors.image) {
            setErrors(nextErrors);
            return;
        }

        const payload: ContainerOperate = {
            name: form.name,
            image: form.image,
            networks: [{ network: form.network || 'bridge', ipv4: '', ipv6: '', macAddr: '' }],
            exposedPorts: parsePorts(form.ports),
            env: parseEnv(form.env),
            volumes: parseVolumes(form.volumes),
            cmd: form.cmd
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean),
            hostname: form.hostname,
            restartPolicy: form.restartPolicy || 'no',
            publishAllPorts: form.publishAllPorts,
            privileged: form.privileged,
            autoRemove: form.autoRemove,
            tty: true,
            openStdin: true,
            nanoCPUs: form.cpus ? Number(form.cpus) : 0,
            memory: form.memory ? Number(form.memory) : 0,
        };

        setCreating(true);
        try {
            await createContainer(payload).unwrap();
            toast.success(t('container.create.success'));
            onOpenChange(false);
        } catch (e) {
            toast.error(errText(e));
        } finally {
            setCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('container.create.title')}</DialogTitle>
                </DialogHeader>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleSubmit();
                    }}
                >
                    <FieldGroup>
                        <Field data-invalid={Boolean(errors.name)}>
                            <FieldLabel htmlFor="container-create-name">{t('container.create.name')}</FieldLabel>
                            <Input
                                id="container-create-name"
                                value={form.name}
                                aria-invalid={Boolean(errors.name)}
                                onChange={(e) => {
                                    set('name', e.target.value);
                                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                                }}
                            />
                            {errors.name ? <FieldError>{errors.name}</FieldError> : null}
                        </Field>

                        <Field data-invalid={Boolean(errors.image)}>
                            <FieldLabel htmlFor="container-create-image">{t('container.create.image')}</FieldLabel>
                            <Input
                                id="container-create-image"
                                list="container-create-image-options"
                                value={form.image}
                                aria-invalid={Boolean(errors.image)}
                                onChange={(e) => {
                                    set('image', e.target.value);
                                    if (errors.image) setErrors((prev) => ({ ...prev, image: undefined }));
                                }}
                            />
                            <datalist id="container-create-image-options">
                                {imageOptions.map((option) => (
                                    <option key={option} value={option} />
                                ))}
                            </datalist>
                            {errors.image ? <FieldError>{errors.image}</FieldError> : null}
                        </Field>

                        <Field>
                            <FieldLabel htmlFor="container-create-network">{t('container.create.network')}</FieldLabel>
                            <NativeSelect
                                id="container-create-network"
                                value={form.network}
                                onChange={(e) => set('network', e.target.value)}
                            >
                                {NETWORK_OPTIONS.map((option) => (
                                    <NativeSelectOption key={option} value={option}>
                                        {option}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field>
                                <FieldLabel htmlFor="container-create-ports">{t('container.create.ports')}</FieldLabel>
                                <Textarea
                                    id="container-create-ports"
                                    className="min-h-[60px]"
                                    placeholder="8080:80/tcp"
                                    value={form.ports}
                                    onChange={(e) => set('ports', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-env">{t('container.create.env')}</FieldLabel>
                                <Textarea
                                    id="container-create-env"
                                    className="min-h-[60px]"
                                    placeholder="KEY=VALUE"
                                    value={form.env}
                                    onChange={(e) => set('env', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-volumes">
                                    {t('container.create.volumes')}
                                </FieldLabel>
                                <Textarea
                                    id="container-create-volumes"
                                    className="min-h-[60px]"
                                    placeholder="/host/path:/container/path:rw"
                                    value={form.volumes}
                                    onChange={(e) => set('volumes', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-cmd">{t('container.create.cmd')}</FieldLabel>
                                <Textarea
                                    id="container-create-cmd"
                                    className="min-h-[60px]"
                                    value={form.cmd}
                                    onChange={(e) => set('cmd', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-hostname">
                                    {t('container.create.hostname')}
                                </FieldLabel>
                                <Input
                                    id="container-create-hostname"
                                    value={form.hostname}
                                    onChange={(e) => set('hostname', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-cpus">{t('container.create.cpus')}</FieldLabel>
                                <Input
                                    id="container-create-cpus"
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={form.cpus}
                                    onChange={(e) => set('cpus', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-memory">
                                    {t('container.create.memory')}
                                </FieldLabel>
                                <Input
                                    id="container-create-memory"
                                    type="number"
                                    min={0}
                                    value={form.memory}
                                    onChange={(e) => set('memory', e.target.value)}
                                />
                            </Field>
                            <Field>
                                <FieldLabel htmlFor="container-create-restart">
                                    {t('container.create.restartPolicy')}
                                </FieldLabel>
                                <NativeSelect
                                    id="container-create-restart"
                                    value={form.restartPolicy}
                                    onChange={(e) => set('restartPolicy', e.target.value)}
                                >
                                    {RESTART_OPTIONS.map((option) => (
                                        <NativeSelectOption key={option} value={option}>
                                            {option}
                                        </NativeSelectOption>
                                    ))}
                                </NativeSelect>
                            </Field>
                        </div>

                        <Field orientation="horizontal">
                            <FieldLabel htmlFor="container-create-publish-all">
                                {t('container.create.publishAllPorts')}
                            </FieldLabel>
                            <Switch
                                id="container-create-publish-all"
                                checked={form.publishAllPorts}
                                onCheckedChange={(checked) => set('publishAllPorts', checked)}
                            />
                        </Field>
                        <Field orientation="horizontal">
                            <FieldLabel htmlFor="container-create-privileged">
                                {t('container.create.privileged')}
                            </FieldLabel>
                            <Switch
                                id="container-create-privileged"
                                checked={form.privileged}
                                onCheckedChange={(checked) => set('privileged', checked)}
                            />
                        </Field>
                        <Field orientation="horizontal">
                            <FieldLabel htmlFor="container-create-auto-remove">
                                {t('container.create.autoRemove')}
                            </FieldLabel>
                            <Switch
                                id="container-create-auto-remove"
                                checked={form.autoRemove}
                                onCheckedChange={(checked) => set('autoRemove', checked)}
                            />
                        </Field>
                    </FieldGroup>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={creating}>
                            {creating ? <Spinner data-icon="inline-start" /> : null}
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
