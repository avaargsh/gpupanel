import {
    useBuildNginxMutation,
    useUpdateNginxModuleMutation,
    type NginxBuildConfig,
    type NginxModule,
} from '@/api/openrestyApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { errText } from '@/pages/toolbox/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfigField } from './fields';
import { TaskLogSheet } from './task-log-sheet';

const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const MIRRORS = [
    'http://archive.ubuntu.com/ubuntu/',
    'http://mirrors.aliyun.com/ubuntu/',
    'http://mirrors.tuna.tsinghua.edu.cn/ubuntu/',
];

interface ModuleForm {
    name: string;
    script: string;
    packages: string;
    params: string;
    buildMode: 'dynamic' | 'static';
    provider: 'local' | 'prebuilt';
    loadOrder: number;
    enable: boolean;
}

const DEFAULT_MODULE: ModuleForm = {
    name: '',
    script: '',
    packages: '',
    params: '',
    buildMode: 'dynamic',
    provider: 'local',
    loadOrder: 50,
    enable: true,
};

export function ModuleOperateSheet({
    mode,
    target,
    dynamicSupported,
    onClose,
    onSaved,
}: {
    mode: 'create' | 'update' | 'view';
    target?: NginxModule;
    dynamicSupported: boolean;
    onClose: () => void;
    onSaved: () => void;
}) {
    const { t } = useTranslation();
    const [updateModule, { isLoading }] = useUpdateNginxModuleMutation();
    const [form, setForm] = useState<ModuleForm>(DEFAULT_MODULE);

    useEffect(() => {
        if (target) {
            setForm({
                name: target.name,
                script: target.script ?? '',
                packages: target.packages ?? '',
                params: target.params ?? '',
                buildMode: target.buildMode ?? 'dynamic',
                provider: target.provider ?? 'local',
                loadOrder: target.loadOrder ?? 50,
                enable: target.enable,
            });
        } else {
            setForm(DEFAULT_MODULE);
        }
    }, [target]);

    const readOnly = mode === 'view';

    const submit = async () => {
        if (!readOnly) {
            if (!form.name.trim()) return toast.error(t('openresty.modules.nameRequired'));
            if (!form.params.trim()) return toast.error(t('openresty.modules.paramsRequired'));
        }
        try {
            await updateModule({
                operate: mode === 'create' ? 'create' : 'update',
                name: form.name.trim(),
                script: form.script,
                packages: form.packages,
                params: form.params,
                buildMode: form.buildMode,
                provider: form.provider,
                loadOrder: form.loadOrder,
                enable: form.enable,
            }).unwrap();
            toast.success(t('openresty.saveSuccess'));
            onSaved();
        } catch (e) {
            toast.error(errText(e));
        }
    };

    const title = mode === 'view' ? t('openresty.modules.view') : t(`openresty.modules.${mode}`);
    return (
        <Sheet
            open
            onOpenChange={(next) => {
                if (!next && !isLoading) onClose();
            }}
        >
            <SheetContent className="sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{title}</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-3.5">
                    <ConfigField label={t('openresty.modules.name')}>
                        <Input
                            aria-label={t('openresty.modules.name')}
                            value={form.name}
                            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                            disabled={mode === 'update' || readOnly}
                        />
                    </ConfigField>
                    <ConfigField
                        label={t('openresty.modules.buildMode')}
                        help={!dynamicSupported ? t('openresty.modules.dynamicUnsupported') : undefined}
                    >
                        <RadioGroup
                            aria-label={t('openresty.modules.buildMode')}
                            value={form.buildMode}
                            onValueChange={(value) => {
                                if (value === 'dynamic' || value === 'static')
                                    setForm((s) => ({
                                        ...s,
                                        buildMode: value,
                                    }));
                            }}
                            disabled={readOnly}
                        >
                            <label className="flex items-center gap-2">
                                <RadioGroupItem value="dynamic" disabled={!dynamicSupported} />
                                {t('openresty.modules.buildModeDynamic')}
                            </label>
                            <label className="flex items-center gap-2">
                                <RadioGroupItem value="static" />
                                {t('openresty.modules.buildModeStatic')}
                            </label>
                        </RadioGroup>
                    </ConfigField>
                    <ConfigField label={t('openresty.modules.params')} help={t('openresty.modules.paramsHelper')}>
                        <Input
                            aria-label={t('openresty.modules.params')}
                            value={form.params}
                            onChange={(e) =>
                                setForm((s) => ({
                                    ...s,
                                    params: e.target.value,
                                }))
                            }
                            disabled={readOnly}
                        />
                    </ConfigField>
                    <ConfigField label={t('openresty.modules.packages')} help={t('openresty.modules.packagesHelper')}>
                        <Input
                            aria-label={t('openresty.modules.packages')}
                            value={form.packages}
                            onChange={(e) =>
                                setForm((s) => ({
                                    ...s,
                                    packages: e.target.value,
                                }))
                            }
                            disabled={readOnly}
                        />
                    </ConfigField>
                    <ConfigField label={t('openresty.modules.script')} help={t('openresty.modules.scriptHelper')}>
                        <Textarea
                            aria-label={t('openresty.modules.script')}
                            value={form.script}
                            onChange={(e) =>
                                setForm((s) => ({
                                    ...s,
                                    script: e.target.value,
                                }))
                            }
                            rows={6}
                            disabled={readOnly}
                        />
                    </ConfigField>
                    {form.buildMode !== 'static' ? (
                        <ConfigField label={t('openresty.modules.loadOrder')}>
                            <Input
                                type="number"
                                aria-label={t('openresty.modules.loadOrder')}
                                value={String(form.loadOrder)}
                                onChange={(e) =>
                                    setForm((s) => ({
                                        ...s,
                                        loadOrder: e.target.valueAsNumber,
                                    }))
                                }
                                disabled={readOnly}
                            />
                        </ConfigField>
                    ) : null}
                    {target?.lastError ? (
                        <Alert variant="destructive">
                            <AlertTitle>{t('openresty.modules.buildFailed')}</AlertTitle>
                            <AlertDescription>{target.lastError}</AlertDescription>
                        </Alert>
                    ) : null}
                </div>
                <SheetFooter>
                    <Button variant="outline" disabled={isLoading} onClick={onClose}>
                        {readOnly ? t('common.close') : t('common.cancel')}
                    </Button>
                    {!readOnly ? (
                        <Button disabled={isLoading} onClick={submit}>
                            {isLoading ? <Spinner /> : null}
                            {t('common.confirm')}
                        </Button>
                    ) : null}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

export function BuildModal({ config, onClose }: { config: NginxBuildConfig; onClose: () => void }) {
    const { t } = useTranslation();
    const [build, { isLoading }] = useBuildNginxMutation();
    const dynamicModules = config.modules.filter((m) => m.enable && m.buildMode === 'dynamic');
    const staticModules = config.modules.filter((m) => m.enable && m.buildMode === 'static');
    const [mirror, setMirror] = useState(config.mirror || MIRRORS[0]);
    const [selected, setSelected] = useState<string[]>(dynamicModules.map((m) => m.name));
    const [force, setForce] = useState(false);
    const [taskID, setTaskID] = useState('');

    const submit = async () => {
        if (staticModules.length === 0 && selected.length === 0) {
            toast.error(t('openresty.modules.selectRequired'));
            return;
        }
        try {
            const id = uuid();
            await build({
                taskID: id,
                mirror,
                modules: selected,
                force,
            }).unwrap();
            setTaskID(id);
        } catch (e) {
            toast.error(errText(e));
        }
    };

    if (taskID) {
        return <TaskLogSheet taskID={taskID} onClose={onClose} />;
    }

    return (
        <Dialog
            open
            onOpenChange={(next) => {
                if (!next && !isLoading) onClose();
            }}
        >
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('openresty.modules.build')}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3.5">
                    <Alert>
                        <AlertTitle>{t('openresty.modules.buildPurposeHint')}</AlertTitle>
                    </Alert>
                    <ConfigField label={t('openresty.modules.mirrorUrl')}>
                        <NativeSelect
                            aria-label={t('openresty.modules.mirrorUrl')}
                            value={mirror}
                            onChange={(e) => setMirror(e.target.value)}
                        >
                            {MIRRORS.map((m) => (
                                <NativeSelectOption key={m} value={m}>
                                    {m}
                                </NativeSelectOption>
                            ))}
                        </NativeSelect>
                    </ConfigField>
                    {dynamicModules.length ? (
                        <ConfigField label={t('openresty.modules.modulesToBuild')}>
                            <div className="flex flex-col gap-2">
                                {dynamicModules.map((m) => (
                                    <label key={m.name} className="flex items-center gap-2">
                                        <Checkbox
                                            checked={selected.includes(m.name)}
                                            onCheckedChange={(checked) =>
                                                setSelected((values) =>
                                                    checked
                                                        ? [...values, m.name]
                                                        : values.filter((value) => value !== m.name),
                                                )
                                            }
                                        />
                                        {m.name}
                                    </label>
                                ))}
                            </div>
                        </ConfigField>
                    ) : null}
                    {staticModules.length ? (
                        <ConfigField
                            label={t('openresty.modules.staticModules')}
                            help={t('openresty.modules.staticModulesHelper')}
                        >
                            <div className="flex flex-col">
                                {staticModules.map((m) => (
                                    <p key={m.name}>{m.name}</p>
                                ))}
                            </div>
                        </ConfigField>
                    ) : null}
                    <ConfigField label={t('openresty.modules.forceBuild')}>
                        <Switch
                            aria-label={t('openresty.modules.forceBuild')}
                            checked={force}
                            onCheckedChange={setForce}
                        />
                    </ConfigField>
                    {!config.dynamicSupported ? (
                        <Alert>
                            <AlertTitle>{t('openresty.modules.dynamicUnsupported')}</AlertTitle>
                        </Alert>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" disabled={isLoading} onClick={onClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button disabled={isLoading} onClick={submit}>
                        {isLoading ? <Spinner /> : null}
                        {t('common.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
