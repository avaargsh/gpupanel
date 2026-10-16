import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { useGetAppStoreConfigQuery, useUpdateAppStoreConfigMutation, type AppStoreConfig, type AppStoreConfigScope } from '@/api/appApi';
const errText = (e: unknown) =>
    (
        e as {
            data?: {
                message?: string;
            };
        }
    ).data?.message ?? String(e);
interface ConfigRow {
    scope: AppStoreConfigScope;
    key: keyof AppStoreConfig;
    label: string;
}
/**
 * 应用商店「设置」页：OSS 版仅含五个开关，分别经 `/core/settings/apps/store/update`
 * 按 scope 更新。自定义应用商店 / 离线包上传属 xpack，见页脚说明与 README。
 */
export default function AppSettingsTab() {
    const { t } = useTranslation();
    const { data, refetch, isLoading: loading, isError } = useGetAppStoreConfigQuery();
    const [update, { isLoading }] = useUpdateAppStoreConfigMutation();
    const config = (data ?? {}) as Partial<AppStoreConfig>;
    const rows: ConfigRow[] = [
        { scope: 'UninstallDeleteBackup', key: 'uninstallDeleteBackup', label: t('apps.settings.uninstallDeleteBackup') },
        { scope: 'UninstallDeleteImage', key: 'uninstallDeleteImage', label: t('apps.settings.uninstallDeleteImage') },
        { scope: 'UpgradeBackup', key: 'upgradeBackup', label: t('apps.settings.upgradeBackup') },
        { scope: 'UpgradeDeleteImage', key: 'upgradeDeleteImage', label: t('apps.settings.upgradeDeleteImage') },
        { scope: 'InstallAllowPort', key: 'installAllowPort', label: t('apps.settings.installAllowPort') },
    ];
    const onToggle = async (scope: AppStoreConfigScope, checked: boolean) => {
        try {
            await update({ scope, status: checked ? 'Enable' : 'Disable' }).unwrap();
            toast.success(t('apps.settings.saved'));
            refetch();
        } catch (e) {
            toast.error(errText(e));
        }
    };
    return (
        <div className="app-settings max-w-[640px] flex flex-col gap-3">
            {loading && <Spinner role="status" aria-label={t('common.loading')} />}
            {isError && (
                <Alert variant="destructive">
                    <AlertDescription>
                        {t('hostOps.loadError')}{' '}
                        <Button variant="outline" onClick={() => void refetch()}>
                            {t('common.refresh')}
                        </Button>
                    </AlertDescription>
                </Alert>
            )}
            {rows.map((row) => (
                <label key={row.scope} className="list-row">
                    <span className="text-sm">{row.label}</span>
                    <Switch
                        aria-label={row.label}
                        checked={config[row.key] === 'Enable'}
                        onCheckedChange={(v) => onToggle(row.scope, Boolean(v))}
                        disabled={isLoading || loading || isError || !data}
                    />
                </label>
            ))}
            <span className="text-muted-foreground text-sm mt-2">
                {t('apps.settings.customStoreHint')}
            </span>
        </div>
    );
}
