import { Empty } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

export default function PlaceholderPage() {
    const { t } = useTranslation();
    return (
        <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
            <Empty title={t('placeholder.title')} description={t('placeholder.desc')} style={{ padding: '48px 0' }} />
        </div>
    );
}
