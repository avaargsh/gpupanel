import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DatabaseMongodb from './mongodb';
import DatabaseMysql from './mysql';
import DatabasePostgresql from './postgresql';
import DatabaseRedis from './redis';

/**
 * 数据库模块（迁移自旧版 frontend/ 的 database 模块）。
 * 四个页签：MySQL / PostgreSQL / Redis / MongoDB。
 *
 * 每个引擎共用一个「实例选择器」：先选本机已安装或远程接入的数据库实例，
 * 再管理该实例内的库（Redis 为键值型，展示状态 / 配置 / 持久化）。
 */
export default function DatabasesPage() {
    const { t } = useTranslation();
    const [activeKey, setActiveKey] = useState('mysql');

    return (
        <div className="px-1">
            <Tabs value={activeKey} onValueChange={setActiveKey}>
                <TabsList variant="line">
                    <TabsTrigger value="mysql">{t('database.tabs.mysql')}</TabsTrigger>
                    <TabsTrigger value="postgresql">{t('database.tabs.postgresql')}</TabsTrigger>
                    <TabsTrigger value="redis">{t('database.tabs.redis')}</TabsTrigger>
                    <TabsTrigger value="mongodb">{t('database.tabs.mongodb')}</TabsTrigger>
                </TabsList>
                <TabsContent value="mysql" className="pt-4">
                    <DatabaseMysql />
                </TabsContent>
                <TabsContent value="postgresql" className="pt-4">
                    <DatabasePostgresql />
                </TabsContent>
                <TabsContent value="redis" className="pt-4">
                    <DatabaseRedis />
                </TabsContent>
                <TabsContent value="mongodb" className="pt-4">
                    <DatabaseMongodb />
                </TabsContent>
            </Tabs>
        </div>
    );
}
