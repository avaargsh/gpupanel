import { baseApi } from './baseApi';

/**
 * 网站模块接口（对齐旧版 `frontend/src/api/modules/website.ts`）。
 *
 * 本轮为「核心首过」：站点列表 / 增删 / 启停、域名、重写、目录、HTTPS、日志、
 * 分组与 PHP 运行时。反向代理、重定向、负载均衡、CORS、鉴权、防盗链、流媒体、
 * 模板 / ACME / DNS 账号等高级子功能暂缓（见 README）。
 *
 * 「加载类」的 POST 接口统一用 build.query(method: POST) 声明，便于组件挂载即取数。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

// ---------- 站点 ----------

export interface WebsiteRes {
    id: number;
    createdAt: string;
    protocol: string;
    primaryDomain: string;
    type: string;
    alias: string;
    remark: string;
    status: string;
    expireDate: string;
    sitePath: string;
    appName: string;
    runtimeName: string;
    runtimeType: string;
    sslExpireDate: string;
    appInstallId?: number;
    favorite?: boolean;
    IPV6?: boolean;
}

export interface WebsiteSearchParams {
    page: number;
    pageSize: number;
    name: string;
    orderBy: string;
    order: string;
    websiteGroupId: number;
    type: string;
}

export interface WebsiteDTO {
    id: number;
    createdAt: string;
    primaryDomain: string;
    type: string;
    alias: string;
    remark: string;
    protocol: string;
    sitePath: string;
    errorLogPath: string;
    accessLogPath: string;
    appName: string;
    runtimeName: string;
    runtimeType: string;
    runtimeID: number;
    siteDir: string;
    rewrite: string;
    user: string;
    group: string;
    webSiteGroupId: number;
    webSiteSSLId: number;
    IPV6: boolean;
    favorite: boolean;
    accessLog?: boolean;
    errorLog?: boolean;
    expireDate: string;
}

export interface WebsiteOption {
    id: number;
    primaryDomain: string;
    alias: string;
}

export interface SubDomain {
    domain: string;
    port: number;
    ssl: boolean;
}

export interface WebsiteCreate {
    type: string;
    alias: string;
    remark: string;
    appType: string;
    webSiteGroupID: number;
    IPV6: boolean;
    domains: SubDomain[];
    siteDir?: string;
    proxy?: string;
    proxyType?: string;
    runtimeID?: number;
    enableSSL?: boolean;
    websiteSSLID?: number;
    createDb?: boolean;
}

export interface WebsiteUpdate {
    id: number;
    primaryDomain: string;
    remark: string;
    webSiteGroupID: number;
    expireDate?: string;
    IPV6: boolean;
    favorite: boolean;
}

export interface WebsiteOp {
    id: number;
    operate: string;
}

export interface WebsiteDelete {
    id: number;
    deleteApp: boolean;
    deleteBackup: boolean;
    forceDelete: boolean;
    deleteDB: boolean;
}

export interface BatchWebsiteOp {
    ids: number[];
    operate: string;
    taskID: string;
}

export interface Domain {
    id: number;
    websiteId: number;
    domain: string;
    port: number;
    ssl: boolean;
}

export interface DomainCreate {
    websiteID: number;
    domains: SubDomain[];
}

export interface DomainUpdate {
    id: number;
    ssl: boolean;
}

export interface NginxParam {
    name: string;
    params: string[];
}

export interface NginxScopeConfig {
    enable: boolean;
    params: NginxParam[];
}

export interface NginxScopeReq {
    websiteId: number;
    scope: string;
}

export interface NginxConfigReq {
    operate: string;
    websiteId: number;
    scope: string;
    params?: NginxParam[];
}

export interface RewriteReq {
    websiteID: number;
    name: string;
}

export interface RewriteRes {
    content: string;
}

export interface RewriteUpdate {
    websiteID: number;
    name: string;
    content: string;
}

export interface DirConfig {
    dirs: string[];
    user: string;
    userGroup: string;
    msg: string;
}

export interface DirUpdate {
    id: number;
    siteDir: string;
}

export interface DirPermissionUpdate {
    id: number;
    user: string;
    group: string;
}

export interface SSLInfo {
    id: number;
    primaryDomain: string;
    domains: string;
    expireDate: string;
    status: string;
    type: string;
    provider: string;
}

export interface HTTPSConfig {
    enable: boolean;
    SSL?: SSLInfo;
    httpConfig: string;
    SSLProtocol: string[];
    algorithm: string;
    hsts: boolean;
    hstsIncludeSubDomains: boolean;
    httpsPort?: string;
    http3: boolean;
}

export interface HTTPSReq {
    websiteId: number;
    enable: boolean;
    websiteSSLId?: number;
    type: string;
    certificate?: string;
    privateKey?: string;
    httpConfig: string;
    SSLProtocol: string[];
    algorithm: string;
    http3: boolean;
}

export interface WebsiteLog {
    enable: boolean;
    content: string;
    end: boolean;
    path: string;
}

export interface WebsiteLogReq {
    id: number;
    logType: string;
    page?: number;
    pageSize?: number;
}

export interface WebsiteOpLog {
    id: number;
    operate: string;
    logType: string;
}

export interface PHPVersionChange {
    websiteID: number;
    runtimeID: number;
}

export interface RuntimeInfo {
    id: number;
    name: string;
    type: string;
    version?: string;
    status?: string;
}

export interface GroupInfo {
    id: number;
    name: string;
    type: string;
    isDefault?: boolean;
}

export const websiteApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---------- 站点 ----------
        searchWebsites: build.query<PageResult<WebsiteRes>, WebsiteSearchParams>({
            query: (body) => ({ url: '/websites/search', method: 'POST', body }),
            providesTags: ['Website'],
        }),
        listWebsites: build.query<WebsiteOption[], void>({
            query: () => ({ url: '/websites/list' }),
            providesTags: ['Website'],
        }),
        getWebsite: build.query<WebsiteDTO, number>({
            query: (id) => ({ url: `/websites/${id}` }),
            providesTags: ['Website'],
        }),
        createWebsite: build.mutation<unknown, WebsiteCreate>({
            query: (body) => ({ url: '/websites', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        updateWebsite: build.mutation<unknown, WebsiteUpdate>({
            query: (body) => ({ url: '/websites/update', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        operateWebsite: build.mutation<unknown, WebsiteOp>({
            query: (body) => ({ url: '/websites/operate', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        deleteWebsite: build.mutation<unknown, WebsiteDelete>({
            query: (body) => ({ url: '/websites/del', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        batchOperateWebsites: build.mutation<unknown, BatchWebsiteOp>({
            query: (body) => ({ url: '/websites/batch/operate', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),

        // ---------- 域名 ----------
        listDomains: build.query<Domain[], number>({
            query: (websiteId) => ({ url: `/websites/domains/${websiteId}` }),
            providesTags: ['Website'],
        }),
        createDomain: build.mutation<unknown, DomainCreate>({
            query: (body) => ({ url: '/websites/domains', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        updateDomain: build.mutation<unknown, DomainUpdate>({
            query: (body) => ({ url: '/websites/domains/update', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        deleteDomain: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/websites/domains/del', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),

        // ---------- 目录 / 重写 / 默认文档 ----------
        getDirConfig: build.query<DirConfig, { id: number }>({
            query: (body) => ({ url: '/websites/dir', method: 'POST', body }),
        }),
        updateWebsiteDir: build.mutation<unknown, DirUpdate>({
            query: (body) => ({ url: '/websites/dir/update', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        updateWebsiteDirPermission: build.mutation<unknown, DirPermissionUpdate>({
            query: (body) => ({ url: '/websites/dir/permission', method: 'POST', body }),
        }),
        getRewriteConfig: build.query<RewriteRes, RewriteReq>({
            query: (body) => ({ url: '/websites/rewrite', method: 'POST', body }),
        }),
        updateRewriteConfig: build.mutation<unknown, RewriteUpdate>({
            query: (body) => ({ url: '/websites/rewrite/update', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        getNginxConfig: build.query<NginxScopeConfig, NginxScopeReq>({
            query: (body) => ({ url: '/websites/config', method: 'POST', body }),
        }),
        updateNginxConfig: build.mutation<unknown, NginxConfigReq>({
            query: (body) => ({ url: '/websites/config/update', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),

        // ---------- HTTPS ----------
        getHTTPSConfig: build.query<HTTPSConfig, number>({
            query: (id) => ({ url: `/websites/${id}/https` }),
            providesTags: ['Website'],
        }),
        updateHTTPSConfig: build.mutation<unknown, HTTPSReq>({
            query: (body) => ({ url: `/websites/${body.websiteId}/https`, method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        searchSSL: build.query<PageResult<SSLInfo>, { page: number; pageSize: number; name: string }>({
            query: (body) => ({ url: '/websites/ssl/search', method: 'POST', body }),
        }),

        // ---------- 日志 ----------
        getWebsiteLog: build.query<WebsiteLog, WebsiteLogReq>({
            query: (body) => ({ url: '/websites/log/search', method: 'POST', body }),
        }),
        operateWebsiteLog: build.mutation<unknown, WebsiteOpLog>({
            query: (body) => ({ url: '/websites/log/operate', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),

        // ---------- PHP 运行时 / 分组 ----------
        changePHPVersion: build.mutation<unknown, PHPVersionChange>({
            query: (body) => ({ url: '/websites/php/version', method: 'POST', body }),
            invalidatesTags: ['Website'],
        }),
        searchRuntimes: build.query<PageResult<RuntimeInfo>, { page: number; pageSize: number; name: string; type: string }>({
            query: (body) => ({ url: '/runtimes/search', method: 'POST', body }),
        }),
        listWebsiteGroups: build.query<GroupInfo[], string>({
            query: (type) => ({ url: '/core/groups/search', method: 'POST', body: { type } }),
        }),
    }),
});

export const {
    useSearchWebsitesQuery,
    useListWebsitesQuery,
    useGetWebsiteQuery,
    useCreateWebsiteMutation,
    useUpdateWebsiteMutation,
    useOperateWebsiteMutation,
    useDeleteWebsiteMutation,
    useBatchOperateWebsitesMutation,
    useListDomainsQuery,
    useCreateDomainMutation,
    useUpdateDomainMutation,
    useDeleteDomainMutation,
    useGetDirConfigQuery,
    useUpdateWebsiteDirMutation,
    useUpdateWebsiteDirPermissionMutation,
    useGetRewriteConfigQuery,
    useUpdateRewriteConfigMutation,
    useGetNginxConfigQuery,
    useUpdateNginxConfigMutation,
    useGetHTTPSConfigQuery,
    useUpdateHTTPSConfigMutation,
    useSearchSSLQuery,
    useGetWebsiteLogQuery,
    useOperateWebsiteLogMutation,
    useChangePHPVersionMutation,
    useSearchRuntimesQuery,
    useListWebsiteGroupsQuery,
} = websiteApi;
