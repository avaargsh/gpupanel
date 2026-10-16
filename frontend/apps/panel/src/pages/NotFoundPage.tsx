import { Button } from '@douyinfe/semi-ui';
import { IconArrowLeft } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { brandColor } from '@/theme';

export default function NotFoundPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'grid',
                placeItems: 'center',
                backgroundColor: 'var(--semi-color-bg-0)',
            }}
        >
            <div style={{ textAlign: 'center', padding: 24 }}>
                <div
                    style={{
                        fontSize: 56,
                        fontWeight: 800,
                        lineHeight: 1.2,
                        color: brandColor,
                    }}
                >
                    404
                </div>
                <div style={{ fontSize: 18, fontWeight: 650, marginTop: 8 }}>{t('notFound.title')}</div>
                <div style={{ fontSize: 13, color: 'var(--semi-color-text-2)', marginTop: 4 }}>{t('notFound.desc')}</div>
                <Button theme="solid" type="primary" icon={<IconArrowLeft />} style={{ marginTop: 24 }} onClick={() => navigate('/')}>
                    {t('notFound.back')}
                </Button>
            </div>
        </div>
    );
}
