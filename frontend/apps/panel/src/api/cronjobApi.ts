import { baseApi } from './baseApi';

/**
 * 计划任务接口（对齐旧版 `frontend/src/api/modules/cronjob.ts` 与后端 `agent/router/ro_cronjob.go`）。
 *
 * 本轮为「核心首过」：
 * - 计划任务：列表 / 增删改 / 启停 / 立即执行 / 分组筛选 / 周期预览（`/cronjobs/next`）
 * - 执行记录：记录分页 / 记录日志 / 清空记录 / 停止
 * - 脚本库：列表 / 增删改 / 分组（`/core/script/*`，对齐旧版 API 与后端 Swagger）
 *
 * 暂缓：任务导入 / 导出、备份列表查看、系统分组管理弹窗、脚本即时运行终端、
 * 消息告警（企业版 xpack）等（见 README）。
 *
 * 「加载类」POST 统一用 build.query(method: POST) 声明，便于挂载即取数。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

export interface GroupInfo {
    id: number;
    name: string;
    type: string;
    isDefault?: boolean;
}

export interface SpecObj {
    specType: string;
    week: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

export interface SnapshotRule {
    withImage: boolean;
    ignoreAppIDs: number[];
}

export interface CronjobInfo {
    id: number;
    name: string;
    type: string;
    groupID: number;
    specCustom: boolean;
    spec: string;

    executor: string;
    scriptMode: string;
    script: string;
    command: string;
    containerName: string;
    user: string;

    scriptID: number;
    appID: string;
    website: string;
    exclusionRules: string;
    dbType: string;
    dbName: string;
    url: string;
    isDir: boolean;
    sourceDir: string;
    snapshotRule: SnapshotRule;

    sourceAccounts: string[];
    downloadAccount: string;
    sourceAccountIDs: string;
    downloadAccountID: number;

    lastRecordStatus: string;
    lastRecordTime: string;
    status: string;
    secret: string;
    args: string;

    alertCount: number;
    alertTriggerMode: string;
}

export interface CronjobSearchParams {
    page: number;
    pageSize: number;
    info: string;
    groupIDs: number[];
    orderBy: string;
    order: string;
}

/** 计划任务提交体（对齐 `dto.CronjobOperate`）。 */
export interface CronjobOperate {
    id?: number;
    name: string;
    type: string;
    groupID: number;
    specCustom: boolean;
    spec: string;

    executor?: string;
    scriptMode?: string;
    script?: string;
    command?: string;
    containerName?: string;
    user?: string;

    scriptID?: number;
    appID?: string;
    website?: string;
    exclusionRules?: string;
    dbType?: string;
    dbName?: string;
    url?: string;
    isDir?: boolean;
    sourceDir?: string;
    snapshotRule?: SnapshotRule;

    sourceAccountIDs?: string;
    downloadAccountID?: number;
    retainCopies?: number;
    retryTimes?: number;
    timeout?: number;
    ignoreErr?: boolean;
    secret?: string;
    args?: string;

    alertCount?: number;
    alertTitle?: string;
    alertMethod?: string;
    alertTriggerMode?: string;
    scopes?: string[];
}

export interface CronjobRecord {
    id: number;
    cronjobID: number;
    taskID: string;
    startTime: string;
    records: string;
    status: string;
    message: string;
    targetPath: string;
    interval: number;
    file: string;
}

export interface RecordSearchParams {
    page: number;
    pageSize: number;
    cronjobID: number;
    status: string;
}

export interface ScriptOption {
    id: number;
    name: string;
}

export interface ScriptInfo {
    id: number;
    name: string;
    groupID: number;
    isInteractive: boolean;
    description: string;
    script: string;
    isSystem?: boolean;
    groupBelong?: string[];
    createdAt: string;
}

export interface ScriptSearchParams {
    page: number;
    pageSize: number;
    info: string;
    groupID: number;
    orderBy: string;
    order: string;
}

export interface ScriptOperate {
    id?: number;
    name: string;
    groupID: number;
    groupList?: number[];
    isInteractive: boolean;
    description: string;
    script: string;
}

export const cronjobApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---------- 计划任务 ----------
        searchCronjobs: build.query<PageResult<CronjobInfo>, CronjobSearchParams>({
            query: (body) => ({ url: '/cronjobs/search', method: 'POST', body }),
            providesTags: ['Cronjob'],
        }),
        loadCronjobInfo: build.query<CronjobOperate, number>({
            query: (id) => ({ url: '/cronjobs/load/info', method: 'POST', body: { id } }),
            providesTags: ['Cronjob'],
        }),
        createCronjob: build.mutation<unknown, CronjobOperate>({
            query: (body) => ({ url: '/cronjobs', method: 'POST', body }),
            invalidatesTags: ['Cronjob'],
        }),
        updateCronjob: build.mutation<unknown, CronjobOperate>({
            query: (body) => ({ url: '/cronjobs/update', method: 'POST', body }),
            invalidatesTags: ['Cronjob'],
        }),
        deleteCronjobs: build.mutation<unknown, { ids: number[]; cleanData: boolean; cleanRemoteData: boolean }>({
            query: (body) => ({ url: '/cronjobs/del', method: 'POST', body }),
            invalidatesTags: ['Cronjob'],
        }),
        updateCronjobStatus: build.mutation<unknown, { id: number; status: string }>({
            query: (body) => ({ url: '/cronjobs/status', method: 'POST', body }),
            invalidatesTags: ['Cronjob'],
        }),
        handleCronjob: build.mutation<unknown, number>({
            query: (id) => ({ url: '/cronjobs/handle', method: 'POST', body: { id } }),
            invalidatesTags: ['Cronjob'],
        }),
        stopCronjob: build.mutation<unknown, number>({
            query: (id) => ({ url: '/cronjobs/stop', method: 'POST', body: { id } }),
            invalidatesTags: ['Cronjob'],
        }),
        loadNextTimes: build.mutation<string[], string>({
            query: (spec) => ({ url: '/cronjobs/next', method: 'POST', body: { spec } }),
        }),

        // ---------- 执行记录 ----------
        searchRecords: build.query<PageResult<CronjobRecord>, RecordSearchParams>({
            query: (body) => ({ url: '/cronjobs/search/records', method: 'POST', body }),
            providesTags: ['Cronjob'],
        }),
        loadRecordLog: build.query<string, number>({
            query: (id) => ({ url: '/cronjobs/records/log', method: 'POST', body: { id } }),
        }),
        cleanRecords: build.mutation<unknown, { cronjobID: number; cleanData: boolean; cleanRemoteData: boolean }>({
            query: (body) => ({ url: '/cronjobs/records/clean', method: 'POST', body }),
            invalidatesTags: ['Cronjob'],
        }),

        // ---------- 通用选项 ----------
        listCronjobGroups: build.query<GroupInfo[], string>({
            query: (type) => ({ url: '/core/groups/search', method: 'POST', body: { type } }),
        }),
        loadScriptOptions: build.query<ScriptOption[], void>({
            query: () => ({ url: '/cronjobs/script/options' }),
        }),

        // ---------- 脚本库 ----------
        searchScripts: build.query<PageResult<ScriptInfo>, ScriptSearchParams>({
            query: (body) => ({ url: '/core/script/search', method: 'POST', body }),
            providesTags: ['Script'],
        }),
        createScript: build.mutation<unknown, ScriptOperate>({
            query: (body) => ({ url: '/core/script', method: 'POST', body }),
            invalidatesTags: ['Script'],
        }),
        updateScript: build.mutation<unknown, ScriptOperate>({
            query: (body) => ({ url: '/core/script/update', method: 'POST', body }),
            invalidatesTags: ['Script'],
        }),
        deleteScripts: build.mutation<unknown, { ids: number[] }>({
            query: (body) => ({ url: '/core/script/del', method: 'POST', body }),
            invalidatesTags: ['Script'],
        }),
    }),
});

export const {
    useSearchCronjobsQuery,
    useLoadCronjobInfoQuery,
    useCreateCronjobMutation,
    useUpdateCronjobMutation,
    useDeleteCronjobsMutation,
    useUpdateCronjobStatusMutation,
    useHandleCronjobMutation,
    useStopCronjobMutation,
    useLoadNextTimesMutation,
    useSearchRecordsQuery,
    useLoadRecordLogQuery,
    useCleanRecordsMutation,
    useListCronjobGroupsQuery,
    useLoadScriptOptionsQuery,
    useSearchScriptsQuery,
    useCreateScriptMutation,
    useUpdateScriptMutation,
    useDeleteScriptsMutation,
} = cronjobApi;
