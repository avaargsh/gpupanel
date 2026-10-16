import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ClamTab from './clam';
import CleanTab from './clean';
import DeviceTab from './device';
import Fail2banTab from './fail2ban';
import FtpTab from './ftp';

export default function ToolboxPage() {
    const { t } = useTranslation();
    const [tab, setTab] = useState('device');

    return (
        <div className="module-shell">
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList variant="line" className="module-tabs">
                    <TabsTrigger value="device">{t('toolbox.tabs.device')}</TabsTrigger>
                    <TabsTrigger value="clean">{t('toolbox.tabs.clean')}</TabsTrigger>
                    <TabsTrigger value="fail2ban">{t('toolbox.tabs.fail2ban')}</TabsTrigger>
                    <TabsTrigger value="ftp">{t('toolbox.tabs.ftp')}</TabsTrigger>
                    <TabsTrigger value="clam">{t('toolbox.tabs.clam')}</TabsTrigger>
                </TabsList>
                <TabsContent value="device" className="module-tab-content">
                    <DeviceTab />
                </TabsContent>
                <TabsContent value="clean" className="module-tab-content">
                    <CleanTab />
                </TabsContent>
                <TabsContent value="fail2ban" className="module-tab-content">
                    <Fail2banTab />
                </TabsContent>
                <TabsContent value="ftp" className="module-tab-content">
                    <FtpTab />
                </TabsContent>
                <TabsContent value="clam" className="module-tab-content">
                    <ClamTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
