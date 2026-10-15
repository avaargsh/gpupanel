import { useState } from 'react';
import { Tabs, TabPane } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import DatabaseMysql from './mysql';
import DatabasePostgresql from './postgresql';
import DatabaseRedis from './redis';
import DatabaseMongodb from './mongodb';

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
        <div style={{ padding: '0 4px' }}>
            <Tabs type="line" activeKey={activeKey} onChange={setActiveKey} lazyRender>
                <TabPane itemKey="mysql" tab={t('database.tabs.mysql')}>
                    <div style={{ paddingTop: 16 }}>
                        <DatabaseMysql />
                    </div>
                </TabPane>
                <TabPane itemKey="postgresql" tab={t('database.tabs.postgresql')}>
                    <div style={{ paddingTop: 16 }}>
                        <DatabasePostgresql />
                    </div>
                </TabPane>
                <TabPane itemKey="redis" tab={t('database.tabs.redis')}>
                    <div style={{ paddingTop: 16 }}>
                        <DatabaseRedis />
                    </div>
                </TabPane>
                <TabPane itemKey="mongodb" tab={t('database.tabs.mongodb')}>
                    <div style={{ paddingTop: 16 }}>
                        <DatabaseMongodb />
                    </div>
                </TabPane>
            </Tabs>
        </div>
    );
}
