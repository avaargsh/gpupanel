import { baseApi } from '@/api/baseApi';

/**
 * 容器模块 API —— 对齐旧前端 frontend/src/api/modules/container.ts。
 *
 * 说明：前端只面向 Core 的 /api/v1 容器接口，Core 再代理到 Agent。
 * 这里刻意不暴露 Docker 细节（inspect 返回的原始 JSON 除外），
 * 便于后续把 Provider 从 Docker 平滑切换到 Containerd / K8s。
 */

/** 分页响应（后端通用封套内的 data） */
export interface PageResult<T> {
    items: T[];
    total: number;
}

/** 容器状态（与后端 dto.PageContainer.State 的 oneof 对齐） */
export type ContainerState =
    | 'all'
    | 'created'
    | 'running'
    | 'paused'
    | 'restarting'
    | 'removing'
    | 'exited'
    | 'dead';

/** 容器操作（与后端 dto.ContainerOperation.Operation 的 oneof 对齐） */
export type ContainerOperation =
    | 'up'
    | 'start'
    | 'stop'
    | 'restart'
    | 'kill'
    | 'pause'
    | 'unpause'
    | 'remove';

export interface ContainerNetworkInfo {
    network: string;
    ipv4: string;
    ipv6: string;
    macAddr: string;
    links?: string[];
    aliases?: string[];
    driverOpts?: Record<string, string>;
    gwPriority?: number;
    linkLocalIPs?: string[];
}

/** 容器列表项（/containers/search 返回） */
export interface ContainerInfo {
    containerID: string;
    name: string;
    imageName: string;
    createTime: string;
    state: string;
    runTime: string;
    network: ContainerNetworkInfo[] | null;
    ports: string[];
    isFromApp: boolean;
    isFromCompose: boolean;

    hasLoad?: boolean;
    cpuPercent?: number;
    memoryPercent?: number;
    // 由 /containers/list/stats 合并进来的原始字段
    cpuTotalUsage?: number;
    systemUsage?: number;
    percpuUsage?: number;
    memoryCache?: number;
    memoryUsage?: number;
    memoryLimit?: number;
}

export interface ContainerSearchParams {
    page?: number;
    pageSize?: number;
    name?: string;
    state?: ContainerState;
    orderBy?: 'name' | 'createdAt' | 'state';
    order?: 'null' | 'ascending' | 'descending';
    filters?: string;
    excludeAppStore?: boolean;
}

/** 容器列表统计（GET /containers/list/stats） */
export interface ContainerListStats {
    containerID: string;
    cpuTotalUsage: number;
    systemUsage: number;
    cpuPercent: number;
    percpuUsage: number;
    memoryCache: number;
    memoryUsage: number;
    memoryLimit: number;
    memoryPercent: number;
}

/** 容器概览统计（GET /containers/status） */
export interface ContainerStatus {
    created: number;
    running: number;
    paused: number;
    restarting: number;
    removing: number;
    exited: number;
    dead: number;

    containerCount: number;
    composeCount: number;
    composeTemplateCount: number;
    imageCount: number;
    networkCount: number;
    volumeCount: number;
    repoCount: number;

    containerUsage: number;
    containerReclaimable: number;
    imageUsage: number;
    imageReclaimable: number;
    volumeUsage: number;
    volumeReclaimable: number;
    buildCacheUsage: number;
    buildCacheReclaimable: number;
}

/** 容器磁盘占用（POST /containers/item/stats） */
export interface ContainerItemStats {
    sizeRw: number;
    sizeRootFs: number;
    containerUsage: number;
    containerReclaimable: number;
    imageUsage: number;
    imageReclaimable: number;
    volumeUsage: number;
    volumeReclaimable: number;
    buildCacheUsage: number;
    buildCacheReclaimable: number;
}

/** 容器实时指标（GET /containers/stats/:id） */
export interface ContainerStats {
    cpuPercent: number;
    memory: number;
    cache: number;
    ioRead: number;
    ioWrite: number;
    networkRX: number;
    networkTX: number;
    shotTime: string;
}

/** 新建/编辑容器表单（后端 dto.ContainerOperate 的子集） */
export interface ContainerOperate {
    taskID?: string;
    forcePull?: boolean;
    name: string;
    image: string;

    hostname?: string;
    domainName?: string;
    dns?: string[];
    networks?: ContainerNetworkInfo[];

    publishAllPorts?: boolean;
    exposedPorts?: ContainerPortHelper[];
    tty?: boolean;
    openStdin?: boolean;
    workingDir?: string;
    user?: string;
    cmd?: string[];
    entrypoint?: string[];
    cpuShares?: number;
    nanoCPUs?: number;
    memory?: number;
    privileged?: boolean;
    autoRemove?: boolean;
    volumes?: ContainerVolumeHelper[];
    extraHosts?: { hostname: string; ip: string }[];
    labels?: string[];
    env?: string[];
    restartPolicy?: string;
}

export interface ContainerPortHelper {
    hostIP?: string;
    hostPort: string;
    containerPort: string;
    protocol: string;
}

export interface ContainerVolumeHelper {
    type?: string;
    sourceDir: string;
    containerDir: string;
    mode?: string;
}

export interface ContainerOperationPayload {
    names: string[];
    operation: ContainerOperation;
    taskID?: string;
}

export interface ContainerRenamePayload {
    name: string;
    newName: string;
}

export interface ContainerPrunePayload {
    pruneType: 'container' | 'image' | 'volume' | 'network' | 'buildcache';
    withTagAll: boolean;
}

export interface ContainerPruneReport {
    deletedNumber: number;
    spaceReclaimed: number;
}

export interface ContainerInspectPayload {
    id: string;
    type: string;
    detail?: string;
}

export interface ResourceLimit {
    cpu: number;
    memory: number;
}

export interface DockerStatus {
    isActive: boolean;
    isExist: boolean;
}

export interface ContainerOption {
    name: string;
    state: string;
}

/** 镜像（/containers/image/* ，对齐 agent dto.ImageInfo） */
export interface ImageInfo {
    id: string;
    createdAt: string;
    isUsed: boolean;
    tags: string[] | null;
    size: number;
    isPinned?: boolean;
    description?: string;
}

export interface ImageSearchParams {
    page?: number;
    pageSize?: number;
    name?: string;
    orderBy?: 'size' | 'tags' | 'createdAt' | 'isUsed';
    order?: 'null' | 'ascending' | 'descending';
}

export interface ImagePullPayload {
    taskID?: string;
    repoID?: number;
    imageName: string[];
}

export const containerApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---------- 列表 / 详情 ----------
        searchContainers: build.query<PageResult<ContainerInfo>, ContainerSearchParams | void>({
            query: (params) => ({
                url: '/containers/search',
                method: 'POST',
                body: {
                    page: params?.page ?? 1,
                    pageSize: params?.pageSize ?? 20,
                    name: params?.name ?? '',
                    state: params?.state ?? 'all',
                    orderBy: params?.orderBy ?? 'createdAt',
                    order: params?.order ?? 'descending',
                    filters: params?.filters ?? '',
                    excludeAppStore: params?.excludeAppStore ?? false,
                },
            }),
            providesTags: ['Container'],
        }),
        listContainers: build.query<ContainerOption[], void>({
            query: () => ({ url: '/containers/list', method: 'POST', body: {} }),
        }),
        getContainerInfo: build.query<Record<string, unknown>, string>({
            query: (name) => ({ url: '/containers/info', method: 'POST', body: { name } }),
            providesTags: ['Container'],
        }),
        getContainerStatus: build.query<ContainerStatus, void>({
            query: () => ({ url: '/containers/status', method: 'GET' }),
            providesTags: ['Container'],
        }),
        getContainerListStats: build.query<ContainerListStats[], void>({
            query: () => ({ url: '/containers/list/stats', method: 'GET' }),
        }),
        getContainerStats: build.query<ContainerStats, string>({
            query: (id) => ({ url: `/containers/stats/${encodeURIComponent(id)}`, method: 'GET' }),
        }),
        getContainerItemStats: build.mutation<ContainerItemStats, { name: string }>({
            query: (body) => ({ url: '/containers/item/stats', method: 'POST', body }),
        }),

        // ---------- 创建 / 更新 / 操作 ----------
        createContainer: build.mutation<unknown, ContainerOperate>({
            query: (body) => ({ url: '/containers', method: 'POST', body }),
            invalidatesTags: ['Container'],
        }),
        updateContainer: build.mutation<unknown, ContainerOperate>({
            query: (body) => ({ url: '/containers/update', method: 'POST', body }),
            invalidatesTags: ['Container'],
        }),
        operateContainer: build.mutation<unknown, ContainerOperationPayload>({
            query: (body) => ({ url: '/containers/operate', method: 'POST', body }),
            invalidatesTags: ['Container'],
        }),
        renameContainer: build.mutation<unknown, ContainerRenamePayload>({
            query: (body) => ({ url: '/containers/rename', method: 'POST', body }),
            invalidatesTags: ['Container'],
        }),
        pruneContainers: build.mutation<ContainerPruneReport, ContainerPrunePayload>({
            query: (body) => ({ url: '/containers/prune', method: 'POST', body }),
            invalidatesTags: ['Container', 'ContainerImage'],
        }),
        inspectContainer: build.mutation<string, ContainerInspectPayload>({
            query: (body) => ({ url: '/containers/inspect', method: 'POST', body }),
        }),

        // ---------- Docker 环境 ----------
        getResourceLimit: build.query<ResourceLimit, void>({
            query: () => ({ url: '/containers/limit', method: 'GET' }),
        }),
        getDockerStatus: build.query<DockerStatus, void>({
            query: () => ({ url: '/containers/docker/status', method: 'GET' }),
        }),
        dockerOperate: build.mutation<unknown, { operation: string }>({
            query: (body) => ({ url: '/containers/docker/operate', method: 'POST', body }),
        }),

        // ---------- 镜像 ----------
        searchImages: build.query<PageResult<ImageInfo>, ImageSearchParams | void>({
            query: (params) => ({
                url: '/containers/image/search',
                method: 'POST',
                body: {
                    page: params?.page ?? 1,
                    pageSize: params?.pageSize ?? 20,
                    name: params?.name ?? '',
                    orderBy: params?.orderBy ?? 'createdAt',
                    order: params?.order ?? 'descending',
                },
            }),
            providesTags: ['ContainerImage'],
        }),
        listAllImages: build.query<ImageInfo[], void>({
            query: () => ({ url: '/containers/image/all', method: 'GET' }),
        }),
        pullImage: build.mutation<unknown, ImagePullPayload>({
            query: (body) => ({ url: '/containers/image/pull', method: 'POST', body }),
            invalidatesTags: ['ContainerImage'],
        }),
        removeImage: build.mutation<unknown, { names: string[] }>({
            query: (body) => ({ url: '/containers/image/remove', method: 'POST', body }),
            invalidatesTags: ['ContainerImage'],
        }),
    }),
});

export const {
    useSearchContainersQuery,
    useListContainersQuery,
    useGetContainerInfoQuery,
    useGetContainerStatusQuery,
    useGetContainerListStatsQuery,
    useGetContainerStatsQuery,
    useGetContainerItemStatsMutation,
    useCreateContainerMutation,
    useUpdateContainerMutation,
    useOperateContainerMutation,
    useRenameContainerMutation,
    usePruneContainersMutation,
    useInspectContainerMutation,
    useGetResourceLimitQuery,
    useGetDockerStatusQuery,
    useDockerOperateMutation,
    useSearchImagesQuery,
    useListAllImagesQuery,
    usePullImageMutation,
    useRemoveImageMutation,
} = containerApi;
