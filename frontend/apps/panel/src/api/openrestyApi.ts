import { baseApi } from './baseApi';

/**
 * OpenResty（Nginx）管理接口，对齐旧版 `frontend/src/api/modules/nginx.ts`
 * 与后端 `agent/router/ro_nginx.go`（浏览器经 core 代理到 agent）：
 *
 * - `GET  /openresty`           读取 nginx.conf 全文
 * - `POST /openresty/scope`     按 scope 读取指令参数
 * - `POST /openresty/update`    按 scope 写入指令参数
 * - `GET  /openresty/status`    nginx stub_status 计数
 * - `POST /openresty/file`      保存 nginx.conf（可备份）
 * - `GET  /openresty/modules`   模块列表与构建配置
 * - `POST /openresty/modules/update` 增删改模块
 * - `POST /openresty/build`     构建模块（异步任务）
 * - `GET  /openresty/https`     默认 HTTPS 防窜站状态
 * - `POST /openresty/https`     开启/关闭默认 HTTPS
 *
 * 另含应用侧两个辅助接口：`/apps/installed/conf`（默认配置模板）与
 * `/apps/installed/check`（OpenResty 安装状态，用于页面可用性判断）。
 *
 * 暂缓：旧版「日志」页签的容器日志实时读取（v2 暂无容器日志流接口，见 README）。
 */

export type NginxScope = 'index' | 'limit-conn' | 'ssl' | 'cache' | 'http-per' | 'proxy-cache' | 'brotli';

export interface NginxStatus {
    active: number;
    accepts: number;
    handled: number;
    requests: number;
    reading: number;
    writing: number;
    waiting: number;
}

export interface NginxParam {
    name: string;
    params: string[];
}

export interface NginxBrotliRes {
    params: NginxParam[];
    managedExternally: boolean;
    managedUnavailable: boolean;
}

export interface NginxFile {
    content: string;
}

export interface NginxConfigUpdate {
    scope: NginxScope;
    operate: 'add' | 'update' | 'delete';
    websiteId?: number;
    params: unknown;
}

export interface NginxModuleArtifact {
    name: string;
    path: string;
    checksum: string;
}

export interface NginxModule {
    name: string;
    custom: boolean;
    script: string;
    packages: string;
    params: string;
    enable: boolean;
    buildMode: 'dynamic' | 'static';
    provider: 'local' | 'prebuilt';
    loadOrder: number;
    buildStatus: 'pending' | 'ready' | 'failed';
    loadStatus: 'enabled' | 'disabled';
    artifacts?: NginxModuleArtifact[];
    lastError: string;
}

export interface NginxBuildConfig {
    mirror: string;
    dynamicSupported: boolean;
    modules: NginxModule[];
}

export interface NginxModuleUpdate {
    operate: 'create' | 'update' | 'delete';
    name: string;
    script?: string;
    packages?: string;
    enable?: boolean;
    params?: string;
    buildMode?: 'dynamic' | 'static';
    provider?: 'local' | 'prebuilt';
    loadOrder?: number;
}

export interface NginxBuildReq {
    taskID: string;
    mirror: string;
    modules?: string[];
    force?: boolean;
}

export interface NginxHttpsStatus {
    https: boolean;
    sslRejectHandshake: boolean;
}

export interface NginxHttpsOperate {
    operate: 'enable' | 'disable';
    sslRejectHandshake: boolean;
}

export interface AppInstalledCheck {
    isExist: boolean;
    name: string;
    app: string;
    version: string;
    status: string;
    appInstallId: number;
    containerName: string;
    installPath: string;
    httpPort: number;
    httpsPort: number;
}

export const openrestyApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getNginxFile: build.query<NginxFile, void>({
            query: () => ({ url: '/openresty' }),
        }),
        getNginxConfigByScope: build.query<NginxParam[], NginxScope>({
            query: (scope) => ({ url: '/openresty/scope', method: 'POST', body: { scope } }),
        }),
        getNginxBrotliConfig: build.query<NginxBrotliRes, void>({
            query: () => ({ url: '/openresty/scope', method: 'POST', body: { scope: 'brotli' } }),
        }),
        updateNginxConfig: build.mutation<unknown, NginxConfigUpdate>({
            query: (body) => ({ url: '/openresty/update', method: 'POST', body }),
        }),
        getNginxStatus: build.query<NginxStatus, void>({
            query: () => ({ url: '/openresty/status' }),
        }),
        updateNginxFile: build.mutation<unknown, { content: string; backup: boolean }>({
            query: (body) => ({ url: '/openresty/file', method: 'POST', body }),
        }),
        getNginxModules: build.query<NginxBuildConfig, void>({
            query: () => ({ url: '/openresty/modules' }),
        }),
        updateNginxModule: build.mutation<unknown, NginxModuleUpdate>({
            query: (body) => ({ url: '/openresty/modules/update', method: 'POST', body }),
        }),
        buildNginx: build.mutation<unknown, NginxBuildReq>({
            query: (body) => ({ url: '/openresty/build', method: 'POST', body }),
        }),
        getNginxHttps: build.query<NginxHttpsStatus, void>({
            query: () => ({ url: '/openresty/https' }),
        }),
        operateNginxHttps: build.mutation<unknown, NginxHttpsOperate>({
            query: (body) => ({ url: '/openresty/https', method: 'POST', body }),
        }),

        // ---- 应用辅助 ----
        getAppDefaultConfig: build.mutation<string, { type: string; name: string }>({
            query: (body) => ({ url: '/apps/installed/conf', method: 'POST', body }),
        }),
        checkAppInstalled: build.query<AppInstalledCheck, { key: string; name: string }>({
            query: (body) => ({ url: '/apps/installed/check', method: 'POST', body }),
        }),
    }),
});

export const {
    useGetNginxFileQuery,
    useGetNginxConfigByScopeQuery,
    useGetNginxBrotliConfigQuery,
    useUpdateNginxConfigMutation,
    useGetNginxStatusQuery,
    useUpdateNginxFileMutation,
    useGetNginxModulesQuery,
    useUpdateNginxModuleMutation,
    useBuildNginxMutation,
    useGetNginxHttpsQuery,
    useOperateNginxHttpsMutation,
    useGetAppDefaultConfigMutation,
    useCheckAppInstalledQuery,
} = openrestyApi;
