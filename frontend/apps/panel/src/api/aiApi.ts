import { baseApi } from './baseApi';

/**
 * AI 工具接口（对齐旧版 `frontend/src/api/modules/ai.ts`）。
 *
 * 旧版 AI 模块体量巨大（模型账户 / 本地模型 Ollama·vLLM·TensorRT / MCP / GPU 监控 /
 * 智能体及其角色·渠道·插件·技能等配置）。本轮为「核心首过」：
 * - 模型账户：列表 / 增删改 / 模型池（列表 / 发现 / 新增 / 删除）
 * - 本地模型：Ollama 模型列表 / 同步 / 创建 / 重建 / 关闭 / 删除 / 详情
 * - MCP：列表 / 增删改 / 启停重启 / 状态同步 / 连通性测试 / 域名绑定
 * - GPU：设备快照（`gpuApi`）+ 历史监控（options / search）
 * - 智能体：列表 / 创建 / 操作 / 删除（资源检查）/ 备注 / Token 重置 / 站点绑定 / 概览，
 *   以及设置（模型 / 安全 / 其他 / 配置文件）
 *
 * 暂缓：vLLM、TensorRT、模型下载器、Ollama 域名绑定、智能体角色 / 渠道机器人 /
 * 插件市场 / 技能、Hermes 会话（见 README）。
 *
 * 「加载类」POST 统一用 build.query(method: POST) 声明，便于挂载即取数。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

/* ============================ 模型账户 ============================ */

export interface ProviderModelInfo {
    id: string;
    name: string;
}

export interface ProviderApiInfo {
    apiType: string;
    baseUrl: string;
    editableBaseUrl: boolean;
    supportsModelDiscovery: boolean;
    defaultAuthMode: string;
    authModes: string[];
    models: ProviderModelInfo[];
}

export interface ProviderInfo {
    provider: string;
    displayName: string;
    baseUrl: string;
    defaultApiType: string;
    apiTypes: ProviderApiInfo[];
    models: ProviderModelInfo[];
}

export interface AccountModel {
    recordId: number;
    id: string;
    name: string;
}

export interface AccountItem {
    id: number;
    provider: string;
    providerName: string;
    name: string;
    apiKey: string;
    rememberApiKey: boolean;
    baseUrl: string;
    models: AccountModel[] | null;
    apiType: string;
    authMode: string;
    verifyModel: string;
    verified: boolean;
    remark: string;
    createdAt: string;
}

export interface AccountSearchInput {
    page: number;
    pageSize: number;
    provider: string;
    apiType: string;
    name: string;
}

export interface AccountSaveReq {
    id?: number;
    provider: string;
    name: string;
    apiKey: string;
    rememberApiKey: boolean;
    baseURL: string;
    apiType: string;
    authMode: string;
    verifyModel: string;
    validateAvailability: boolean;
    remark: string;
    syncAgents?: boolean;
}

export interface AccountModelDiscoverReq {
    provider: string;
    baseURL: string;
    apiKey: string;
    apiType: string;
}

export interface AccountModelInput {
    recordId: number;
    id: string;
    name: string;
}

export interface OllamaModelInfo {
    id: number;
    name: string;
    size: string;
    from: string;
    logFileExist: boolean;
    status: string;
    message: string;
    createdAt: string;
}

export interface GpuMonitorOptions {
    supported: boolean;
    gpuType: string;
    options: string[];
    chartHide: Array<Record<string, unknown>>;
}

export interface GpuMonitorData {
    bucketSeconds: number;
    sampleCount: number;
    date: string[];
    gpuValue: Array<number | null>;
    temperatureValue: Array<number | null>;
    powerTotal: Array<number | null>;
    powerUsed: Array<number | null>;
    memoryTotal: Array<number | null>;
    memoryUsed: Array<number | null>;
    memoryPercent: Array<number | null>;
    powerPercent: Array<number | null>;
    [key: string]: unknown;
}

export interface McpServer {
    id: number;
    name: string;
    status: string;
    baseUrl: string;
    ssePath: string;
    command: string;
    port: number;
    message: string;
    createdAt?: string;
    containerName: string;
    environments: Array<{ key: string; value: string }>;
    volumes: Array<{ source: string; target: string; mode?: string }>;
    dir?: string;
    hostIP: string;
    protocol: string;
    url: string;
    outputTransport: string;
    streamableHttpPath: string;
    type: string;
    gatewayImage: string;
    protocolVersion: string;
    gatewayArgs: string;
    taskID?: string;
}

export interface McpStatus {
    id: number;
    status: string;
    message: string;
}

export interface McpDomainRes {
    domain: string;
    sslID: number;
    acmeAccountID: number;
    allowIPs: string[];
    websiteID?: number;
    connUrl: string;
}

export interface AgentItem {
    id: number;
    name: string;
    remark: string;
    agentType: string;
    provider: string;
    providerName: string;
    model: string;
    apiType: string;
    baseUrl: string;
    apiKey: string;
    token: string;
    dashboardUsername: string;
    dashboardPassword: string;
    status: string;
    message: string;
    appInstallId: number;
    websiteId: number;
    websitePrimaryDomain: string;
    websiteType: string;
    websiteProtocol: string;
    accountId: number;
    appVersion: string;
    containerName: string;
    webUIPort: number;
    bridgePort: number;
    path: string;
    configPath: string;
    upgradable: boolean;
    createdAt: string;
}

export interface AgentOverview {
    snapshot: {
        containerStatus: string;
        appVersion: string;
        defaultModel: string;
        channelCount: number;
        skillCount: number;
        jobCount: number;
        sessionCount: number;
    };
}

export interface AgentCreateReq {
    name: string;
    remark: string;
    appVersion: string;
    webUIPort: number;
    bridgePort?: number;
    allowedOrigins?: string[];
    agentType: string;
    model?: string;
    accountId?: number;
    token?: string;
    dashboardUsername?: string;
    dashboardPassword?: string;
    taskID: string;
    advanced: boolean;
    containerName: string;
    allowPort: boolean;
    specifyIP: string;
    restartPolicy: string;
    cpuQuota: number;
    memoryLimit: number;
    memoryUnit: string;
    pullImage: boolean;
    editCompose: boolean;
    dockerCompose: string;
}

export interface AgentModelMetadata {
    model: string;
    inputMode: 'auto' | 'text' | 'image';
    contextWindow: number;
    maxTokens: number;
}

export interface AgentModelConfig {
    accountId: number;
    model: string;
    fallbacks: string[] | null;
    metadata: AgentModelMetadata[] | null;
}

export interface AgentModelConfigUpdateReq {
    agentId: number;
    accountId: number;
    model: string;
    fallbacks: string[];
    metadata: AgentModelMetadata[];
}

export interface AgentSecurityConfig {
    allowedOrigins: string[] | null;
}

export interface AgentOtherConfig {
    userTimezone: string;
    browserEnabled: boolean;
    npmRegistry: string;
    dashboardUsername: string;
    dashboardPassword: string;
}

export interface AgentConfigFile {
    content: string;
}

export const aiApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---- GPU ----
        getGpuOptions: build.query<GpuMonitorOptions, void>({
            query: () => ({ url: '/ai/gpu/options' }),
        }),
        loadGpuMonitor: build.query<GpuMonitorData, { productName: string; startTime: string; endTime: string; aggregation?: string; deviceID?: string }>({
            query: (body) => ({ url: '/ai/gpu/search', method: 'POST', body }),
        }),

        // ---- Ollama ----
        searchOllamaModels: build.query<PageResult<OllamaModelInfo>, { page: number; pageSize: number; info: string }>({
            query: (body) => ({ url: '/ai/ollama/model/search', method: 'POST', body }),
            providesTags: ['AI'],
        }),
        syncOllamaModels: build.mutation<Array<{ id: number; name: string }>, void>({
            query: () => ({ url: '/ai/ollama/model/sync', method: 'POST' }),
            invalidatesTags: ['AI'],
        }),
        loadOllamaModel: build.mutation<string, { name: string }>({
            query: (body) => ({ url: '/ai/ollama/model/load', method: 'POST', body }),
        }),
        createOllamaModel: build.mutation<unknown, { name: string; taskID: string }>({
            query: (body) => ({ url: '/ai/ollama/model', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        recreateOllamaModel: build.mutation<unknown, { name: string; taskID: string }>({
            query: (body) => ({ url: '/ai/ollama/model/recreate', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        closeOllamaModel: build.mutation<unknown, { name: string }>({
            query: (body) => ({ url: '/ai/ollama/close', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        deleteOllamaModels: build.mutation<unknown, { ids: number[]; forceDelete: boolean }>({
            query: (body) => ({ url: '/ai/ollama/model/del', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),

        // ---- MCP ----
        pageMcpServers: build.query<PageResult<McpServer>, { page: number; pageSize: number; name: string }>({
            query: (body) => ({ url: '/ai/mcp/search', method: 'POST', body }),
            providesTags: ['AI'],
        }),
        getMcpServerDetail: build.query<McpServer, number>({
            query: (id) => ({ url: '/ai/mcp/server/detail', method: 'POST', body: { id } }),
        }),
        createMcpServer: build.mutation<unknown, Record<string, unknown>>({
            query: (body) => ({ url: '/ai/mcp/server', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        updateMcpServer: build.mutation<unknown, Record<string, unknown>>({
            query: (body) => ({ url: '/ai/mcp/server/update', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        deleteMcpServer: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/ai/mcp/server/del', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        operateMcpServer: build.mutation<unknown, { id: number; operate: string }>({
            query: (body) => ({ url: '/ai/mcp/server/op', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        syncMcpStatus: build.mutation<McpStatus[], { ids: number[] }>({
            query: (body) => ({ url: '/ai/mcp/server/status/sync', method: 'POST', body }),
        }),
        testMcpConnection: build.mutation<{ success: boolean; endpoint: string; outputTransport: string; protocolVersion?: string; message: string }, { id: number }>({
            query: (body) => ({ url: '/ai/mcp/server/connection/test', method: 'POST', body }),
        }),
        getMcpDomain: build.query<McpDomainRes, void>({
            query: () => ({ url: '/ai/mcp/domain/get' }),
        }),
        bindMcpDomain: build.mutation<unknown, { domain: string; sslID: number; ipList: string }>({
            query: (body) => ({ url: '/ai/mcp/domain/bind', method: 'POST', body }),
        }),
        updateMcpDomain: build.mutation<unknown, { websiteID: number; sslID: number; ipList: string }>({
            query: (body) => ({ url: '/ai/mcp/domain/update', method: 'POST', body }),
        }),

        // ---- Model accounts ----
        getAgentProviders: build.query<ProviderInfo[], void>({
            query: () => ({ url: '/ai/accounts/providers' }),
        }),
        searchAccounts: build.query<PageResult<AccountItem>, { page: number; pageSize: number; provider: string; apiType?: string; name: string }>({
            query: (body) => ({ url: '/ai/accounts/search', method: 'POST', body }),
            providesTags: ['AI'],
        }),
        createAccount: build.mutation<unknown, Record<string, unknown>>({
            query: (body) => ({ url: '/ai/accounts', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        updateAccount: build.mutation<unknown, Record<string, unknown>>({
            query: (body) => ({ url: '/ai/accounts/update', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        deleteAccount: build.mutation<unknown, { id: number }>({
            query: (body) => ({ url: '/ai/accounts/delete', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        getAccountModels: build.query<AccountModel[], number>({
            query: (accountId) => ({ url: '/ai/accounts/models', method: 'POST', body: { accountId } }),
        }),
        discoverAccountModels: build.mutation<AccountModel[], { provider: string; baseURL: string; apiKey: string; apiType: string }>({
            query: (body) => ({ url: '/ai/accounts/models/discover', method: 'POST', body }),
        }),
        createAccountModel: build.mutation<unknown, { accountId: number; model: AccountModelInput }>({
            query: (body) => ({ url: '/ai/accounts/models/create', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        deleteAccountModel: build.mutation<unknown, { accountId: number; recordId: number }>({
            query: (body) => ({ url: '/ai/accounts/models/delete', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),

        // ---- Agents ----
        searchAgents: build.query<PageResult<AgentItem>, { page: number; pageSize: number; name: string }>({
            query: (body) => ({ url: '/ai/agents/search', method: 'POST', body }),
            providesTags: ['AI'],
        }),
        createAgent: build.mutation<AgentItem, AgentCreateReq>({
            query: (body) => ({ url: '/ai/agents', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        deleteCheckAgent: build.mutation<Array<{ type: string; name: string }>, { id: number }>({
            query: (body) => ({ url: '/ai/agents/delete/check', method: 'POST', body }),
        }),
        deleteAgent: build.mutation<unknown, { id: number; taskID: string; forceDelete: boolean }>({
            query: (body) => ({ url: '/ai/agents/delete', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        resetAgentToken: build.mutation<AgentItem, { id: number }>({
            query: (body) => ({ url: '/ai/agents/token/reset', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        updateAgentRemark: build.mutation<unknown, { id: number; remark: string }>({
            query: (body) => ({ url: '/ai/agents/remark', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        bindAgentWebsite: build.mutation<unknown, { agentId: number; websiteId: number }>({
            query: (body) => ({ url: '/ai/agents/website/bind', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        unbindAgentWebsite: build.mutation<unknown, { agentId: number }>({
            query: (body) => ({ url: '/ai/agents/website/unbind', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        getAgentOverview: build.mutation<AgentOverview, { agentId: number }>({
            query: (body) => ({ url: '/ai/agents/overview', method: 'POST', body }),
        }),
        // ---- Agent 设置（模型 / 安全 / 其他 / 配置文件）----
        getAgentModelConfig: build.query<AgentModelConfig, number>({
            query: (agentId) => ({ url: '/ai/agents/model/get', method: 'POST', body: { agentId } }),
        }),
        updateAgentModelConfig: build.mutation<unknown, AgentModelConfigUpdateReq>({
            query: (body) => ({ url: '/ai/agents/model/update', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        getAgentSecurityConfig: build.query<AgentSecurityConfig, number>({
            query: (agentId) => ({ url: '/ai/agents/security/get', method: 'POST', body: { agentId } }),
        }),
        updateAgentSecurityConfig: build.mutation<unknown, { agentId: number; allowedOrigins: string[] }>({
            query: (body) => ({ url: '/ai/agents/security/update', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        getAgentOtherConfig: build.query<AgentOtherConfig, number>({
            query: (agentId) => ({ url: '/ai/agents/other/get', method: 'POST', body: { agentId } }),
        }),
        updateAgentOtherConfig: build.mutation<unknown, { agentId: number } & AgentOtherConfig>({
            query: (body) => ({ url: '/ai/agents/other/update', method: 'POST', body }),
            invalidatesTags: ['AI'],
        }),
        getAgentConfigFile: build.query<AgentConfigFile, number>({
            query: (agentId) => ({ url: '/ai/agents/config-file/get', method: 'POST', body: { agentId } }),
        }),
        updateAgentConfigFile: build.mutation<unknown, { agentId: number; content: string }>({
            query: (body) => ({ url: '/ai/agents/config-file/update', method: 'POST', body }),
        }),
    }),
});

export const {
    useGetGpuOptionsQuery,
    useLoadGpuMonitorQuery,
    useSearchOllamaModelsQuery,
    useSyncOllamaModelsMutation,
    useLoadOllamaModelMutation,
    useCreateOllamaModelMutation,
    useRecreateOllamaModelMutation,
    useCloseOllamaModelMutation,
    useDeleteOllamaModelsMutation,
    useGetMcpServerDetailQuery,
    usePageMcpServersQuery,
    useSearchAccountsQuery,
    useGetAgentProvidersQuery,
    useCreateAccountMutation,
    useUpdateAccountMutation,
    useDeleteAccountMutation,
    useGetAccountModelsQuery,
    useDiscoverAccountModelsMutation,
    useCreateAccountModelMutation,
    useDeleteAccountModelMutation,
    useCreateMcpServerMutation,
    useUpdateMcpServerMutation,
    useDeleteMcpServerMutation,
    useOperateMcpServerMutation,
    useSyncMcpStatusMutation,
    useTestMcpConnectionMutation,
    useSearchAgentsQuery,
    useCreateAgentMutation,
    useDeleteCheckAgentMutation,
    useDeleteAgentMutation,
    useResetAgentTokenMutation,
    useUpdateAgentRemarkMutation,
    useBindAgentWebsiteMutation,
    useUnbindAgentWebsiteMutation,
    useGetAgentOverviewMutation,
    useGetAgentModelConfigQuery,
    useUpdateAgentModelConfigMutation,
    useGetAgentSecurityConfigQuery,
    useUpdateAgentSecurityConfigMutation,
    useGetAgentOtherConfigQuery,
    useUpdateAgentOtherConfigMutation,
    useGetAgentConfigFileQuery,
    useUpdateAgentConfigFileMutation,
    useGetMcpDomainQuery,
    useBindMcpDomainMutation,
    useUpdateMcpDomainMutation,
} = aiApi;
