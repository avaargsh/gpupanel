import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="grid min-h-dvh place-items-center bg-background">
            <div className="px-6 text-center">
                <div className="text-[56px] leading-tight font-extrabold text-primary">404</div>
                <div className="mt-2 text-lg font-semibold">{t('notFound.title')}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">{t('notFound.desc')}</div>
                <Button type="button" className="mt-6" onClick={() => navigate('/')}>
                    <ArrowLeftIcon data-icon="inline-start" />
                    {t('notFound.back')}
                </Button>
            </div>
        </div>
    );
}
