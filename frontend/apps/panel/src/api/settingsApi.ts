import { baseApi } from './baseApi';

/**
 * 设置模块 API —— 对应旧版 `frontend/src/api/modules/setting.ts` 与 `api-key.ts`。
 *
 * 面板级设置（主题、会话超时、端口、SSL、代理、升级等）由 core 服务提供
 * （`/core/settings/*`）；系统 IP 等主机级设置由 agent 提供（`/settings/*`）；
 * API 密钥走 `/core/auth/api/keys/*`。
 */

/** core `POST /core/settings/search` 返回的面板设置（节选当前面板用到的字段）。 */
export interface CoreSettingInfo {
    systemVersion: string;
    developerMode: string;
    sessionTimeout: string;
    port: string;
    ipv6: string;
    bindAddress: string;
    panelName: string;
    edition: string;
    theme: string;
    menuTabs: string;
    menuAccordion: string;
    language: string;
    docSource: string;
    serverPort: string;
    ssl: string;
    sslType: string;
    bindDomain: string;
    allowIPs: string;
    allowIPTrustedProxies: string;
    securityEntrance: string;
    expirationDays: string;
    complexityVerification: string;
    hideMenu: string;
    noAuthSetting: string;
    proxyUrl: string;
    proxyType: string;
    proxyPort: string;
    proxyUser: string;
    proxyPasswd: string;
    proxyPasswdKeep: string;
}

/** agent `POST /settings/search` 返回的主机级设置（节选）。 */
export interface AgentSettingInfo {
    systemVersion: string;
    systemIP: string;
    localTime: string;
    timeZone: string;
    ntpSite: string;
    defaultNetwork: string;
    defaultIO: string;
    monitorStatus: string;
    monitorInterval: string;
    monitorStoreDays: string;
}

export interface SettingUpdate {
    key: string;
    value: string;
}

export interface PortUpdate {
    serverPort: number;
}

export interface BindInfo {
    ipv6: string;
    bindAddress: string;
}

export interface ProxyUpdate {
    proxyUrl: string;
    proxyType: string;
    proxyPort: string;
    proxyUser: string;
    proxyPasswd: string;
    proxyPasswdKeep: string;
    proxyDocker?: boolean;
    withDockerRestart?: boolean;
}

export interface SSLInfo {
    domain: string;
    timeout: string;
    rootPath: string;
    cert: string;
    key: string;
    sslID: number;
}

export interface SSLUpdate {
    sslType: string;
    domain: string;
    ssl: string;
    cert: string;
    key: string;
    sslID: number;
}

export interface UpgradeInfo {
    testVersion: string;
    newVersion: string;
    latestVersion: string;
    releaseNote: string;
}

export type APIKeyStatus = 'Enable' | 'Disable' | 'Revoked' | 'Expired';
export type APIKeyKind = 'legacy' | 'apiKey';

export interface APIKeyItem {
    id: string;
    kind: APIKeyKind;
    name: string;
    description: string;
    keyHint: string;
    status: APIKeyStatus;
    ipWhiteList: string;
    apiTrustedProxies: string;
    apiKeyValidityTime: number;
    expiresAt: string | null;
    allowAppBinding: boolean;
    revision: number;
    createdAt: string | null;
}

export interface APIKeyPage {
    items: APIKeyItem[];
    total: number;
}

export interface APIKeyEditable {
    name: string;
    description: string;
    ipWhiteList: string;
    apiTrustedProxies: string;
    apiKeyValidityTime: number;
    expiresAt: string | null;
    allowAppBinding: boolean;
}

export interface APIKeyReference {
    id: string;
    revision: number;
}

export interface APIKeyCreated {
    item: APIKeyItem;
    apiKey: string;
    alreadyCreated?: boolean;
}

export interface PageResult<T> {
    items: T[];
    total: number;
}

// ---- 系统快照（agent `/settings/snapshot/*`） ----

/** 快照创建时可选的数据树节点（应用 / 面板 / 备份数据）。 */
export interface DataTree {
    id: string;
    label: string;
    key: string;
    name: string;
    isLocal: boolean;
    size: number;
    isCheck: boolean;
    isDisable: boolean;
    path: string;
    relationItemID: string;
    children: DataTree[];
}

/** `GET /settings/snapshot/load` 返回的默认快照数据。 */
export interface SnapshotData {
    appData: DataTree[];
    panelData: DataTree[];
    backupData: DataTree[];
    withDockerConf: boolean;
    withMonitorData: boolean;
    withLoginLog: boolean;
    withOperationLog: boolean;
    withSystemLog: boolean;
    withTaskLog: boolean;
    ignoreFiles: string[];
}

export interface SnapshotCreate {
    sourceAccountIDs: string;
    downloadAccountID: number;
    description: string;
    secret: string;
    timeout: number;
    appData: DataTree[];
    panelData: DataTree[];
    backupData: DataTree[];
    withDockerConf: boolean;
    withMonitorData: boolean;
    withLoginLog: boolean;
    withOperationLog: boolean;
    withSystemLog: boolean;
    withTaskLog: boolean;
}

export interface SnapshotRecover {
    id: number;
    taskID: string;
    isNew: boolean;
    reDownload: boolean;
    secret: string;
}

export interface SnapshotInfo {
    id: number;
    name: string;
    description: string;
    sourceAccounts: string[];
    downloadAccount: string;
    status: string;
    message: string;
    createdAt: string;
    version: string;
    size: number;
    taskID: string;
    taskRecoverID: string;
    taskRollbackID: string;
    interruptStep: string;
    recoverStatus: string;
    recoverMessage: string;
    lastRecoveredAt: string;
    rollbackStatus: string;
    rollbackMessage: string;
    lastRollbackedAt: string;
}

// ---- 备份账号（agent `/backups/*`） ----

export interface BackupOption {
    id: number;
    name: string;
    type: string;
    isPublic: boolean;
}

export interface BackupInfo {
    id: number;
    name: string;
    type: string;
    isPublic: boolean;
    bucket: string;
    accessKey: string;
    credential: string;
    backupPath: string;
    vars: string;
    createdAt: string;
    rememberAuth: boolean;
}

export interface BackupOperate {
    id?: number;
    name: string;
    type: string;
    isPublic: boolean;
    bucket: string;
    accessKey: string;
    credential: string;
    backupPath: string;
    vars: string;
    rememberAuth: boolean;
}

export interface BackupCheckRes {
    isOk: boolean;
    msg: string;
    token: string;
}

// ---- 告警（agent `/alert/*`） ----

export interface AlertRule {
    id: number;
    type: string;
    cycle: number;
    count: number;
    method: string;
    title: string;
    project: string;
    status: string;
    sendCount: number;
    advancedParams: string;
    createUser: string;
    updateUser: string;
    createdAt: string;
    updatedAt: string;
}

export interface AlertCreate {
    type: string;
    cycle: number;
    count: number;
    method: string;
    title: string;
    project: string;
    status: string;
    sendCount: number;
    advancedParams: string;
}

export interface AlertUpdate extends Partial<AlertCreate> {
    id: number;
}

export interface AlertLog {
    id: number;
    type: string;
    count: number;
    alertId: number;
    status: string;
    method: string;
    message: string;
    createdAt: string;
    updatedAt: string;
}

export const settingsApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---- 面板设置（core） ----
        getCoreSettings: build.query<CoreSettingInfo, void>({
            query: () => ({ url: '/core/settings/search', method: 'POST' }),
            providesTags: ['Setting'],
        }),
        updateSetting: build.mutation<unknown, SettingUpdate>({
            query: (body) => ({ url: '/core/settings/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateMenu: build.mutation<unknown, SettingUpdate>({
            query: (body) => ({ url: '/core/settings/menu/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        defaultMenu: build.mutation<unknown, void>({
            query: () => ({ url: '/core/settings/menu/default', method: 'POST' }),
            invalidatesTags: ['Setting'],
        }),
        loadInterfaceAddr: build.query<string[], void>({
            query: () => ({ url: '/core/settings/interface', method: 'GET' }),
        }),
        updatePort: build.mutation<unknown, PortUpdate>({
            query: (body) => ({ url: '/core/settings/port/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateBind: build.mutation<unknown, BindInfo>({
            query: (body) => ({ url: '/core/settings/bind/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateProxy: build.mutation<unknown, ProxyUpdate>({
            query: (body) => ({ url: '/core/settings/proxy/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        loadSSLInfo: build.query<SSLInfo, void>({
            query: () => ({ url: '/core/settings/ssl/info', method: 'GET' }),
        }),
        updateSSL: build.mutation<unknown, SSLUpdate>({
            query: (body) => ({ url: '/core/settings/ssl/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        getUpgradeInfo: build.query<UpgradeInfo, void>({
            query: () => ({ url: '/core/settings/upgrade', method: 'GET' }),
        }),
        updateUpgrade: build.mutation<unknown, { version: string }>({
            query: (body) => ({ url: '/core/settings/upgrade', method: 'POST', body }),
        }),

        // ---- 主机设置（agent） ----
        getAgentSettings: build.query<AgentSettingInfo, void>({
            query: () => ({ url: '/settings/search', method: 'POST' }),
            providesTags: ['Setting'],
        }),
        updateAgentSetting: build.mutation<unknown, SettingUpdate>({
            query: (body) => ({ url: '/settings/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),

        // ---- API 密钥（core） ----
        searchAPIKeys: build.query<APIKeyPage, { page: number; pageSize: number; excludeRevoked?: boolean }>({
            query: (body) => ({ url: '/core/auth/api/keys/search', method: 'POST', body }),
            providesTags: ['Setting'],
        }),
        createAPIKey: build.mutation<APIKeyCreated, APIKeyEditable & { requestID: string }>({
            query: (body) => ({ url: '/core/auth/api/keys/create', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateAPIKey: build.mutation<unknown, APIKeyEditable & APIKeyReference>({
            query: (body) => ({ url: '/core/auth/api/keys/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        setAPIKeyStatus: build.mutation<unknown, APIKeyReference & { status: 'Enable' | 'Disable' }>({
            query: (body) => ({ url: '/core/auth/api/keys/status', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        revokeAPIKey: build.mutation<unknown, APIKeyReference>({
            query: (body) => ({ url: '/core/auth/api/keys/revoke', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),

        // ---- 系统快照（agent） ----
        loadSnapshotData: build.query<SnapshotData, void>({
            query: () => ({ url: '/settings/snapshot/load', method: 'GET' }),
        }),
        searchSnapshots: build.query<PageResult<SnapshotInfo>, { page: number; pageSize: number; info: string }>({
            query: (body) => ({
                url: '/settings/snapshot/search',
                method: 'POST',
                body: { ...body, orderBy: 'createdAt', order: 'null' },
            }),
            providesTags: ['Setting'],
        }),
        createSnapshot: build.mutation<unknown, SnapshotCreate>({
            query: (body) => ({ url: '/settings/snapshot', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        deleteSnapshots: build.mutation<unknown, { ids: number[]; deleteWithFile: boolean }>({
            query: (body) => ({ url: '/settings/snapshot/del', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateSnapshotDescription: build.mutation<unknown, { id: number; description: string }>({
            query: (body) => ({ url: '/settings/snapshot/description/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        recoverSnapshot: build.mutation<unknown, SnapshotRecover>({
            query: (body) => ({ url: '/settings/snapshot/recover', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        rollbackSnapshot: build.mutation<unknown, SnapshotRecover>({
            query: (body) => ({ url: '/settings/snapshot/rollback', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),

        // ---- 备份账号（agent） ----
        listBackupOptions: build.query<BackupOption[], void>({
            query: () => ({ url: '/backups/options', method: 'GET' }),
            providesTags: ['Setting'],
        }),
        searchBackups: build.query<PageResult<BackupInfo>, { page: number; pageSize: number; info: string; type?: string }>({
            query: (body) => ({ url: '/backups/search', method: 'POST', body }),
            providesTags: ['Setting'],
        }),
        createBackup: build.mutation<unknown, BackupOperate>({
            query: (body) => ({ url: '/backups', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateBackup: build.mutation<unknown, BackupOperate>({
            query: (body) => ({ url: '/backups/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        deleteBackup: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/backups/del', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        checkBackupConn: build.mutation<BackupCheckRes, BackupOperate>({
            query: (body) => ({ url: '/backups/conn/check', method: 'POST', body }),
        }),
        refreshBackupToken: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/backups/refresh/token', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),

        // ---- 告警（agent） ----
        searchAlerts: build.query<PageResult<AlertRule>, { page: number; pageSize: number; type?: string; status?: string; method?: string }>({
            query: (body) => ({
                url: '/alert/search',
                method: 'POST',
                body: { ...body, orderBy: 'created_at', order: 'null' },
            }),
            providesTags: ['Setting'],
        }),
        createAlert: build.mutation<unknown, AlertCreate>({
            query: (body) => ({ url: '/alert', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        updateAlert: build.mutation<unknown, AlertUpdate>({
            query: (body) => ({ url: '/alert/update', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        setAlertStatus: build.mutation<unknown, { id: number; status: string }>({
            query: (body) => ({ url: '/alert/status', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        deleteAlert: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/alert/del', method: 'POST', body }),
            invalidatesTags: ['Setting'],
        }),
        searchAlertLogs: build.query<PageResult<AlertLog>, { page: number; pageSize: number; status?: string }>({
            query: (body) => ({ url: '/alert/logs/search', method: 'POST', body }),
            providesTags: ['Setting'],
        }),
        cleanAlertLogs: build.mutation<unknown, void>({
            query: () => ({ url: '/alert/logs/clean', method: 'POST' }),
            invalidatesTags: ['Setting'],
        }),
    }),
});

export const {
    useGetCoreSettingsQuery,
    useUpdateSettingMutation,
    useUpdateMenuMutation,
    useDefaultMenuMutation,
    useLoadInterfaceAddrQuery,
    useUpdatePortMutation,
    useUpdateBindMutation,
    useUpdateProxyMutation,
    useLoadSSLInfoQuery,
    useUpdateSSLMutation,
    useGetUpgradeInfoQuery,
    useLazyGetUpgradeInfoQuery,
    useUpdateUpgradeMutation,
    useGetAgentSettingsQuery,
    useUpdateAgentSettingMutation,
    useSearchAPIKeysQuery,
    useCreateAPIKeyMutation,
    useUpdateAPIKeyMutation,
    useSetAPIKeyStatusMutation,
    useRevokeAPIKeyMutation,
    useLoadSnapshotDataQuery,
    useSearchSnapshotsQuery,
    useCreateSnapshotMutation,
    useDeleteSnapshotsMutation,
    useUpdateSnapshotDescriptionMutation,
    useRecoverSnapshotMutation,
    useRollbackSnapshotMutation,
    useListBackupOptionsQuery,
    useSearchBackupsQuery,
    useCreateBackupMutation,
    useUpdateBackupMutation,
    useDeleteBackupMutation,
    useCheckBackupConnMutation,
    useRefreshBackupTokenMutation,
    useSearchAlertsQuery,
    useCreateAlertMutation,
    useUpdateAlertMutation,
    useSetAlertStatusMutation,
    useDeleteAlertMutation,
    useSearchAlertLogsQuery,
    useCleanAlertLogsMutation,
} = settingsApi;
