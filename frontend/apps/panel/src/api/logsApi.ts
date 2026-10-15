import { baseApi } from './baseApi';

/**
 * 日志接口（对齐旧版 `frontend/src/api/modules/log.ts`、`modules/host.ts` 中
 * SSH 登录日志部分，以及后端路由）：
 *
 * - 面板日志 / 登录日志：`core/router/ro_log.go` → `/core/logs/{operation,login,clean}`
 *   （后端 `core/app/dto/logs.go`，注意分页返回 `{ items, total }`）。
 * - 主机系统日志：`agent/router/ro_log.go` → `/logs/system/{status,services,read}`
 *   （后端 `agent/app/dto/logs.go`，游标分页 `{ items, hasMore, nextCursor }`）。
 * - 任务日志：`/logs/tasks/{search,read,executing/count}`（后端 `agent/app/model/task.go`、
 *   `response.FileLineContent`）。
 * - SSH 登录日志：`agent/router/ro_host.go` → `/hosts/ssh/log{,/clean}`（后端 `agent/app/dto/ssh.go`）。
 *
 * 暂缓：`/logs/system/files` 原始系统日志文件读取器、网站日志（nginx access/error 实时流）、
 * SSH / 任务日志导出与实时 tail 终端（见 README）。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

// ---------------- 面板日志 ----------------

export interface OperationLog {
    id: number;
    source: string;
    user: string;
    apiKeyID?: string;
    apiKeyName?: string;
    authMethod?: string;
    node: string;
    ip: string;
    path: string;
    method: string;
    userAgent: string;
    status: string;
    latency: number;
    message: string;
    detailZH: string;
    detailEN: string;
    createdAt: string;
}

export interface OperationLogSearch {
    page: number;
    pageSize: number;
    operation: string;
    status: string;
    source: string;
}

// ---------------- 登录日志 ----------------

export interface LoginLog {
    id: number;
    ip: string;
    user: string;
    address: string;
    agent: string;
    status: string;
    message: string;
    createdAt: string;
}

export interface LoginLogSearch {
    page: number;
    pageSize: number;
    info: string;
    status: string;
}

// ---------------- 主机系统日志 ----------------

export interface SystemLogStatus {
    source: string;
    version: string;
    keywordFilterSupported: boolean;
    message: string;
}

export interface SystemLogItem {
    time: string;
    priority: string;
    service: string;
    message: string;
    raw: string;
}

export interface SystemLogRes {
    source: string;
    items: SystemLogItem[];
    hasMore: boolean;
    nextCursor: string;
}

export interface SystemLogSearch {
    pageSize: number;
    cursor: string;
    startTime: string;
    endTime: string;
    keyword: string;
    priority: string;
    service: string;
}

// ---------------- 任务日志 ----------------

export interface TaskInfo {
    id: string;
    name: string;
    type: string;
    operate: string;
    logFile: string;
    status: string;
    errorMsg: string;
    operationLogID: number;
    resourceID: number;
    currentStep: string;
    endAt: string;
    createdAt: string;
}

export interface FileLineContent {
    end: boolean;
    path: string;
    total: number;
    taskStatus: string;
    lines: string[];
    scope: string;
    totalLines: number;
}

export interface TaskLogSearch {
    page: number;
    pageSize: number;
    type: string;
    status: string;
}

// ---------------- SSH 登录日志 ----------------

export interface SSHHistory {
    date: string;
    dateStr: string;
    area: string;
    user: string;
    authMode: string;
    address: string;
    port: string;
    status: string;
    message: string;
}

export interface SSHLogSearch {
    page: number;
    pageSize: number;
    info: string;
    status: string;
}

export const logsApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        // -------- 面板日志 --------
        searchOperationLogs: builder.query<PageResult<OperationLog>, OperationLogSearch>({
            query: (body) => ({ url: '/core/logs/operation', method: 'POST', body }),
            providesTags: ['Log'],
        }),
        searchLoginLogs: builder.query<PageResult<LoginLog>, LoginLogSearch>({
            query: (body) => ({ url: '/core/logs/login', method: 'POST', body }),
            providesTags: ['Log'],
        }),
        cleanLogs: builder.mutation<unknown, { logType: 'operation' | 'login' }>({
            query: (body) => ({ url: '/core/logs/clean', method: 'POST', body }),
            invalidatesTags: ['Log'],
        }),

        // -------- 主机系统日志 --------
        getSystemLogStatus: builder.query<SystemLogStatus, void>({
            query: () => ({ url: '/logs/system/status' }),
        }),
        listRunningServices: builder.query<string[], void>({
            query: () => ({ url: '/logs/system/services' }),
        }),
        readSystemLog: builder.query<SystemLogRes, SystemLogSearch>({
            query: (body) => ({ url: '/logs/system/read', method: 'POST', body }),
        }),

        // -------- 任务日志 --------
        searchTasks: builder.query<PageResult<TaskInfo>, TaskLogSearch>({
            query: (body) => ({ url: '/logs/tasks/search', method: 'POST', body }),
            providesTags: ['Log'],
        }),
        readTaskLog: builder.query<FileLineContent, { taskID: string; page: number; pageSize: number }>({
            query: (body) => ({ url: '/logs/tasks/read', method: 'POST', body }),
        }),
        countExecutingTasks: builder.query<number, void>({
            query: () => ({ url: '/logs/tasks/executing/count' }),
        }),

        // -------- SSH 登录日志 --------
        searchSSHLogs: builder.query<PageResult<SSHHistory>, SSHLogSearch>({
            query: (body) => ({ url: '/hosts/ssh/log', method: 'POST', body }),
            providesTags: ['Log'],
        }),
        cleanSSHLogs: builder.mutation<unknown, void>({
            query: () => ({ url: '/hosts/ssh/log/clean', method: 'POST', body: {} }),
            invalidatesTags: ['Log'],
        }),
    }),
});

export const {
    useSearchOperationLogsQuery,
    useSearchLoginLogsQuery,
    useCleanLogsMutation,
    useGetSystemLogStatusQuery,
    useListRunningServicesQuery,
    useReadSystemLogQuery,
    useSearchTasksQuery,
    useLazyReadTaskLogQuery,
    useCountExecutingTasksQuery,
    useSearchSSHLogsQuery,
    useCleanSSHLogsMutation,
} = logsApi;
