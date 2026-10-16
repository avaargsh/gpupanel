import {
    usePruneContainersMutation,
    useRenameContainerMutation,
    type ContainerInfo,
    type ContainerPrunePayload,
} from '@/api/containerApi';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

const PRUNE_TYPES: ContainerPrunePayload['pruneType'][] = ['container', 'image', 'volume', 'network', 'buildcache'];

const PRUNE_TYPE_LABEL: Record<ContainerPrunePayload['pruneType'], string> = {
    container: 'container.prune.container',
    image: 'container.prune.image',
    volume: 'container.prune.volume',
    network: 'container.prune.network',
    buildcache: 'container.prune.buildcache',
};

/** 重命名容器弹窗：提交 name + newName 载荷。 */
export function ContainerRenameDialog({
    target,
    onOpenChange,
}: {
    target: ContainerInfo | null;
    onOpenChange: (open: boolean) => void;
}) {
    const { t } = useTranslation();
    const [renameContainer, { isLoading: renaming }] = useRenameContainerMutation();
    const [newName, setNewName] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (target) {
            setNewName(target.name);
            setError('');
        }
    }, [target]);

    const handleSubmit = async () => {
        if (!target) return;
        if (!newName.trim()) {
            setError(t('container.rename.newNameRequired'));
            return;
        }
        try {
            await renameContainer({ name: target.name, newName }).unwrap();
            toast.success(t('container.rename.success'));
            onOpenChange(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('container.rename.title')}</DialogTitle>
                </DialogHeader>
                {target && (
                    <form
                        className="flex flex-col gap-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void handleSubmit();
                        }}
                    >
                        <Field data-invalid={Boolean(error)}>
                            <FieldLabel htmlFor="container-rename-name">{t('container.rename.newName')}</FieldLabel>
                            <Input
                                id="container-rename-name"
                                value={newName}
                                aria-invalid={Boolean(error)}
                                onChange={(e) => {
                                    setNewName(e.target.value);
                                    if (error) setError('');
                                }}
                            />
                            {error ? <FieldError>{error}</FieldError> : null}
                        </Field>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={renaming}>
                                {renaming ? <Spinner data-icon="inline-start" /> : null}
                                {t('common.confirm')}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}

/** 清理弹窗：选择 pruneType 与 withTagAll，展示回收结果。 */
export function ContainerPruneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation();
    const [prune, { isLoading: pruning }] = usePruneContainersMutation();
    const [pruneType, setPruneType] = useState<ContainerPrunePayload['pruneType']>('container');
    const [withTagAll, setWithTagAll] = useState(false);

    useEffect(() => {
        if (open) {
            setPruneType('container');
            setWithTagAll(false);
        }
    }, [open]);

    const handleSubmit = async () => {
        try {
            const res = await prune({ pruneType, withTagAll }).unwrap();
            toast.success(t('container.prune.success', { count: res.deletedNumber, size: res.spaceReclaimed }));
            onOpenChange(false);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('container.prune.title')}</DialogTitle>
                </DialogHeader>
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void handleSubmit();
                    }}
                >
                    <FieldGroup>
                        <Field>
                            <FieldLabel htmlFor="container-prune-type">{t('container.prune.type')}</FieldLabel>
                            <NativeSelect
                                id="container-prune-type"
                                value={pruneType}
                                onChange={(e) => setPruneType(e.target.value as ContainerPrunePayload['pruneType'])}
                            >
                                {PRUNE_TYPES.map((option) => (
                                    <NativeSelectOption key={option} value={option}>
                                        {t(PRUNE_TYPE_LABEL[option])}
                                    </NativeSelectOption>
                                ))}
                            </NativeSelect>
                        </Field>
                        <Field orientation="horizontal">
                            <FieldLabel htmlFor="container-prune-tag-all">{t('container.prune.withTagAll')}</FieldLabel>
                            <Switch id="container-prune-tag-all" checked={withTagAll} onCheckedChange={setWithTagAll} />
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" variant="destructive" disabled={pruning}>
                            {pruning ? <Spinner data-icon="inline-start" /> : null}
                            {t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
