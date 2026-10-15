import { useState } from 'react';
import { Button, Card, Modal, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
    useGetCoreSettingsQuery,
    useLazyGetUpgradeInfoQuery,
    useUpdateUpgradeMutation,
    type UpgradeInfo,
} from '@/api/settingsApi';
import { SettingRow, errText } from './shared';

const { Text, Title } = Typography;

export default function AboutTab() {
    const { t } = useTranslation();
    const { data } = useGetCoreSettingsQuery();
    const [trigger, { isFetching }] = useLazyGetUpgradeInfoQuery();
    const [upgrade, { isLoading: upgrading }] = useUpdateUpgradeMutation();
    const [info, setInfo] = useState<UpgradeInfo | null>(null);

    const check = async () => {
        try {
            const res = await trigger().unwrap();
            setInfo(res);
            if (!res.latestVersion) Toast.info(t('settings.about.upToDate'));
        } catch (e) {
            Toast.error(errText(e));
        }
    };

    const doUpgrade = (version: string) => {
        Modal.confirm({
            title: t('settings.about.upgrade'),
            content: t('settings.about.upgradeConfirm', { version }),
            okText: t('common.confirm'),
            cancelText: t('common.cancel'),
            onOk: async () => {
                try {
                    await upgrade({ version }).unwrap();
                    Toast.success(t('settings.about.upgrading'));
                } catch (e) {
                    Toast.error(errText(e));
                }
            },
        });
    };

    const hasNew = !!info?.latestVersion && info.latestVersion !== data?.systemVersion;

    return (
        <Card loading={!data}>
            <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
                <Title heading={4} style={{ marginBottom: 4 }}>
                    {data?.panelName || t('app.name')}
                </Title>
                <Text type="tertiary">{t('settings.about.slogan')}</Text>
            </div>
            <SettingRow label={t('settings.about.version')} value={data?.systemVersion || '-'} />
            <SettingRow
                label={t('settings.about.edition')}
                value={data?.edition === 'intl' ? t('settings.about.intl') : t('settings.about.cn')}
            />
            <SettingRow
                label={t('settings.about.checkUpdate')}
                value={
                    info?.latestVersion ? (
                        <span>
                            {info.latestVersion}{' '}
                            {hasNew ? <Tag color="orange">{t('settings.about.new')}</Tag> : <Tag color="green">{t('settings.about.latest')}</Tag>}
                        </span>
                    ) : (
                        '-'
                    )
                }
                action={
                    <Button theme="light" loading={isFetching} onClick={() => void check()}>
                        {t('settings.about.checkUpdate')}
                    </Button>
                }
            />
            {hasNew ? (
                <>
                    {info?.releaseNote ? (
                        <div style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>
                            <Text strong>{t('settings.about.releaseNote')}</Text>
                            <div>
                                <Text type="tertiary">{info.releaseNote}</Text>
                            </div>
                        </div>
                    ) : null}
                    <div style={{ marginTop: 16 }}>
                        <Button type="primary" loading={upgrading} onClick={() => doUpgrade(info!.latestVersion)}>
                            {t('settings.about.upgrade')}
                        </Button>
                    </div>
                </>
            ) : null}
        </Card>
    );
}
