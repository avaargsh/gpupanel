import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { InboxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function PlaceholderPage() {
    const { t } = useTranslation();
    return (
        <div className="grid min-h-[60vh] place-items-center">
            <Empty className="p-0 py-12">
                <EmptyMedia variant="icon"><InboxIcon /></EmptyMedia>
                <EmptyTitle>{t('placeholder.title')}</EmptyTitle>
                <EmptyDescription>{t('placeholder.desc')}</EmptyDescription>
            </Empty>
        </div>
    );
}
