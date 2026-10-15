import { Switch, Toast, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useGetAppStoreConfigQuery,
    useUpdateAppStoreConfigMutation,
    type AppStoreConfig,
    type AppStoreConfigScope,
} from '@/api/appApi';

const { Text } = Typography;
const errText = (e: unknown) => (e as { data?: { message?: string } }).data?.message ?? String(e);

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
    const { data, refetch } = useGetAppStoreConfigQuery();
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
            Toast.success(t('apps.settings.saved'));
            refetch();
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    return (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
                <label
                    key={row.scope}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        padding: '10px 0',
                        borderBottom: '1px solid var(--semi-color-border)',
                    }}
                >
                    <Text>{row.label}</Text>
                    <Switch
                        checked={config[row.key] === 'Enable'}
                        loading={isLoading}
                        onChange={(v) => onToggle(row.scope, Boolean(v))}
                    />
                </label>
            ))}
            <Text size="small" type="tertiary" style={{ marginTop: 8 }}>
                {t('apps.settings.customStoreHint')}
            </Text>
        </div>
    );
}
