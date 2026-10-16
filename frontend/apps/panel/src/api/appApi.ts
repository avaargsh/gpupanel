import { baseApi } from './baseApi';
import { installedSearchRequest, parseInstalledPage, type ScopedInstalledSearch } from '@/utils/installed-list';

/**
 * 应用商店接口（对齐旧版 `frontend/src/api/modules/app.ts`）。
 *
 * 本轮为「核心首过」：应用商店列表 / 同步 / 安装、已安装应用列表 / 启停重启重建 /
 * 卸载（含资源删除检查）/ 升级 / 参数查看与更新，以及应用商店设置（五个开关）、
 * 忽略升级（含忽略列表与取消）、自定义排序。compose 差异对比、多节点批量安装、
 * 自定义应用商店 / 离线包上传等 xpack 子功能仍暂缓（见 README）。
 *
 * 「加载类」的 POST 接口统一用 build.query(method: POST) 声明，便于组件挂载即取数。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

export interface Tag {
    key: string;
    name: string;
    sort: number;
}

export interface AppFormValue {
    label: string;
    value: string;
}

export interface AppFormField {
    type: string;
    labelZh: string;
    labelEn: string;
    label?: Record<string, string>;
    required?: boolean;
    default?: unknown;
    envKey: string;
    disabled?: boolean;
    edit?: boolean;
    rule?: string;
    multiple?: boolean;
    values?: AppFormValue[];
}

export interface AppItem {
    id: number;
    name: string;
    key: string;
    description: string;
    status: string;
    installed: boolean;
    limit: number;
    tags: string[];
    gpuSupport: boolean;
    recommend: number;
    batchInstallSupport: boolean;
}

export interface AppDTO {
    id: number;
    name: string;
    key: string;
    type: string;
    versions: string[];
    installed: boolean;
    architectures: string;
    shortDescZh: string;
    shortDescEn: string;
    description: string;
    author: string;
    source: string;
    readme: string;
    tags: Tag[];
}

export interface AppDetail {
    id: number;
    dockerCompose: string;
    hostMode?: boolean;
    memoryRequired: number;
    gpuSupport: boolean;
    params?: { formFields: AppFormField[] } | null;
}

export interface AppSearchParams {
    page: number;
    pageSize: number;
    name: string;
    tags: string[];
    type?: string;
    recommend?: boolean;
    resource: string;
    showCurrentArch: boolean;
}

export interface AppInstall {
    appDetailId: number;
    params: Record<string, unknown>;
    name: string;
    taskID: string;
    advanced?: boolean;
    cpuQuota?: number;
    memoryLimit?: number;
    memoryUnit?: string;
    containerName?: string;
    allowPort?: boolean;
    editCompose?: boolean;
    dockerCompose?: string;
    hostMode?: boolean;
    pullImage?: boolean;
    gpuConfig?: boolean;
    webUI?: string;
    type?: string;
    specifyIP?: string;
    restartPolicy?: string;
}

export interface AppInstallDto {
    id: number;
    name: string;
    appID: number;
    appDetailID: number;
    version: string;
    status: string;
    message: string;
    httpPort: number;
    httpsPort: number;
    path: string;
    canUpdate: boolean;
    icon: string;
    appName: string;
    appKey: string;
    appType: string;
    appStatus: string;
    linkDB: boolean;
    webUI?: string;
}

export interface AppInstalledSearchParams {
    page: number;
    pageSize: number;
    name: string;
    tags: string[];
    update?: boolean;
    unused?: boolean;
    sync?: boolean;
    checkUpdate?: boolean;
}

export interface AppInstalledInfo {
    id: number;
    name: string;
    version: string;
    status: string;
    message: string;
    httpPort: number;
    container: string;
    env: Record<string, unknown>;
    appKey: string;
}

export interface AppInstalledOperate {
    installId: number;
    operate: string;
    backupId?: number;
    detailId?: number;
    forceDelete?: boolean;
    deleteBackup?: boolean;
    deleteDB?: boolean;
    backup?: boolean;
    pullImage?: boolean;
    dockerCompose?: string;
    taskID?: string;
    deleteImage?: boolean;
    favorite?: boolean;
}

export interface AppInstallParams {
    labelZh: string;
    labelEn: string;
    value: unknown;
    edit: boolean;
    key: string;
    rule: string;
    type: string;
    values?: AppFormValue[];
    showValue?: string;
    required?: boolean;
    multiple?: boolean;
}

export interface AppConfig {
    params: AppInstallParams[];
    rawCompose?: string;
    cpuQuota: number;
    memoryLimit: number;
    memoryUnit: string;
    containerName: string;
    allowPort: boolean;
    dockerCompose: string;
    hostMode?: boolean;
    type: string;
    webUI: string;
    specifyIP: string;
    restartPolicy: string;
}

export interface AppResource {
    type: string;
    name: string;
}

export interface AppVersion {
    version: string;
    detailId: number;
}

export interface AppSearchParamsInput {
    page: number;
    pageSize: number;
    name: string;
    tags: string[];
    resource: string;
    showCurrentArch: boolean;
}

export interface AppInstalledSearchInput {
    page: number;
    pageSize: number;
    name: string;
    tags: string[];
    update: boolean;
    sync: boolean;
}

export interface AppStoreConfig {
    uninstallDeleteImage: string;
    upgradeBackup: string;
    upgradeDeleteImage: string;
    uninstallDeleteBackup: string;
    installAllowPort: string;
}

export type AppStoreConfigScope =
    | 'UninstallDeleteImage'
    | 'UpgradeBackup'
    | 'UpgradeDeleteImage'
    | 'UninstallDeleteBackup'
    | 'InstallAllowPort';

export interface IgnoredApp {
    ID: number;
    appID: number;
    appDetailID: number;
    scope: string;
    name: string;
    version: string;
}

export interface AppInstallSortItem {
    installID: number;
    sortOrder: number;
}

export const appApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        searchApps: build.query<PageResult<AppItem>, AppSearchParamsInput>({
            query: (body) => ({ url: '/apps/search', method: 'POST', body }),
            providesTags: ['App'],
        }),
        getAppTags: build.query<Tag[], void>({
            query: () => ({ url: '/apps/tags' }),
        }),
        getAppByKey: build.query<AppDTO, string>({
            query: (key) => ({ url: `/apps/${key}` }),
        }),
        getAppDetail: build.query<AppDetail, { appId: number; version: string; type: string }>({
            query: ({ appId, version, type }) => ({ url: `/apps/detail/${appId}/${version}/${type}` }),
        }),
        syncApps: build.mutation<unknown, { taskID: string }>({
            query: (body) => ({ url: '/apps/sync/remote', method: 'POST', body }),
        }),
        syncLocalApps: build.mutation<unknown, { taskID: string }>({
            query: (body) => ({ url: '/apps/sync/local', method: 'POST', body }),
        }),
        installApp: build.mutation<unknown, { appDetailId: number } & Record<string, unknown>>({
            query: (body) => ({ url: '/apps/install', method: 'POST', body }),
            invalidatesTags: ['App'],
        }),

        searchInstalled: build.query<PageResult<AppInstallDto>, ScopedInstalledSearch>({
            query: installedSearchRequest,
            transformResponse: (response: unknown) => parseInstalledPage(response),
            providesTags: ['App'],
        }),
        getInstalledInfo: build.query<AppInstalledInfo, number>({
            query: (id) => ({ url: `/apps/installed/info/${id}` }),
        }),
        installedOp: build.mutation<unknown, AppInstalledOperate>({
            query: (body) => ({ url: '/apps/installed/op', method: 'POST', body }),
            invalidatesTags: ['App'],
        }),
        getInstallParams: build.query<AppConfig, number>({
            query: (id) => ({ url: `/apps/installed/params/${id}` }),
        }),
        updateInstallParams: build.mutation<unknown, { installId: number; params: Record<string, unknown> } & Record<string, unknown>>({
            query: (body) => ({ url: '/apps/installed/params/update', method: 'POST', body }),
            invalidatesTags: ['App'],
        }),
        deleteCheck: build.query<AppResource[], number>({
            query: (id) => ({ url: `/apps/installed/delete/check/${id}` }),
        }),
        getUpdateVersions: build.mutation<AppVersion[], { appInstallID: number; updateVersion?: string }>({
            query: (body) => ({ url: '/apps/installed/update/versions', method: 'POST', body }),
        }),
        updateAppConfig: build.mutation<unknown, { installID: number; webUI: string }>({
            query: (body) => ({ url: '/apps/installed/config/update', method: 'POST', body }),
        }),

        // ---- 设置 / 忽略升级 / 自定义排序（core 设置接口 + agent 应用接口）----
        getAppStoreConfig: build.query<AppStoreConfig, void>({
            query: () => ({ url: '/core/settings/apps/store/config' }),
        }),
        updateAppStoreConfig: build.mutation<unknown, { scope: AppStoreConfigScope; status: 'Enable' | 'Disable' }>({
            query: (body) => ({ url: '/core/settings/apps/store/update', method: 'POST', body }),
        }),
        ignoreAppUpgrade: build.mutation<unknown, { appID: number; appDetailID?: number; scope: 'all' | 'version' }>({
            query: (body) => ({ url: '/apps/installed/ignore', method: 'POST', body }),
            invalidatesTags: ['App'],
        }),
        listIgnoredApps: build.query<IgnoredApp[], void>({
            query: () => ({ url: '/apps/ignored/detail' }),
        }),
        cancelIgnoreAppUpgrade: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/apps/ignored/cancel', method: 'POST', body }),
            invalidatesTags: ['App'],
        }),
        updateInstalledSort: build.mutation<unknown, { items: AppInstallSortItem[] }>({
            query: (body) => ({ url: '/apps/installed/sort/update', method: 'POST', body }),
            invalidatesTags: ['App'],
        }),
    }),
});

export const {
    useSearchAppsQuery,
    useGetAppTagsQuery,
    useGetAppByKeyQuery,
    useGetAppDetailQuery,
    useSyncAppsMutation,
    useSyncLocalAppsMutation,
    useInstallAppMutation,
    useSearchInstalledQuery,
    useGetInstalledInfoQuery,
    useInstalledOpMutation,
    useGetInstallParamsQuery,
    useUpdateInstallParamsMutation,
    useDeleteCheckQuery,
    useGetUpdateVersionsMutation,
    useUpdateAppConfigMutation,
    useGetAppStoreConfigQuery,
    useUpdateAppStoreConfigMutation,
    useIgnoreAppUpgradeMutation,
    useListIgnoredAppsQuery,
    useCancelIgnoreAppUpgradeMutation,
    useUpdateInstalledSortMutation,
} = appApi;

export function getAppIconUrl(key: string): string {
    const baseURL = (import.meta.env.VITE_API_URL as string) || '/api/v1';
    return `${baseURL}/apps/icon/${key}`;
}
