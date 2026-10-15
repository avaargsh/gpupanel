import { baseApi } from './baseApi';
import { encodeBase64 } from '@/utils/base64';

/**
 * 工具箱接口（对齐旧版 `frontend/src/api/modules/toolbox.ts` 与
 * 后端 `agent/router/ro_toolbox.go` / `agent/app/dto/{device,ftp,clam,fail2ban}.go`）。
 *
 * 本轮为「核心首过」，覆盖五个子模块：
 * - 系统设备：基础信息 / DNS、Hosts、主机名、密码、NTP、时区、Swap 修改 / 时间同步
 * - 系统清理：扫描 / 清理
 * - 入侵防御：服务启停 / 配置项修改 / IP 白黑名单
 * - FTP：服务启停 / 账户增删改 / 同步 / 日志
 * - 病毒扫描：服务启停 / 扫描规则增删改 / 手动执行 / 扫描记录
 *
 * 暂缓：原始配置文件（resolv.conf / hosts / fail2ban / clamd）在线编辑与文件选择器、
 * ClamAV 病毒库刷新配置页、Swap 任务日志弹窗、企业版告警（xpack）等（见 README）。
 *
 * 「加载类」POST 统一用 build.query(method: POST) 声明，便于挂载即取数。
 */

export interface PageResult<T> {
    items: T[];
    total: number;
}

// ---------------- 系统设备 ----------------

export interface HostHelper {
    ip: string;
    host: string;
}

export interface SwapHelper {
    path: string;
    size: number;
    used: string | number;
    isNew?: boolean;
    taskID?: string;
}

export interface DeviceBaseInfo {
    dns: string[];
    hosts: HostHelper[];
    hostname: string;
    timeZone: string;
    localTime: string;
    ntp: string;
    user: string;

    swapMemoryTotal: number;
    swapMemoryAvailable: number;
    swapMemoryUsed: number;
    maxSize: number;

    swapDetails: SwapHelper[];
}

// ---------------- 系统清理 ----------------

export interface CleanTree {
    id: string;
    label: string;
    children?: CleanTree[];
    type: string;
    name: string;
    size: number;
    isCheck: boolean;
    isRecommend: boolean;
    canDelete: boolean;
}

export interface CleanData {
    systemClean: CleanTree[];
    backupClean: CleanTree[];
    uploadClean: CleanTree[];
    downloadClean: CleanTree[];
    systemLogClean: CleanTree[];
    containerClean: CleanTree[];
}

export interface CleanItem {
    treeType: string;
    name: string;
    size: number;
}

// ---------------- 入侵防御 ----------------

export interface Fail2banBaseInfo {
    isEnable: boolean;
    isActive: boolean;
    isExist: boolean;
    version: string;

    port: number;
    maxRetry: number;
    banTime: string;
    findTime: string;
    banAction: string;
    logPath: string;
}

export interface Fail2banUpdate {
    key: 'port' | 'bantime' | 'findtime' | 'maxretry' | 'banaction' | 'logpath';
    value: string;
}

// ---------------- FTP ----------------

export interface FtpBaseInfo {
    isActive: boolean;
    isExist: boolean;
}

export interface FtpInfo {
    id: number;
    createdAt: string;
    user: string;
    password: string;
    path: string;
    status: string;
    description: string;
}

export interface FtpLog {
    ip: string;
    status: string;
    operation: string;
    size: number;
    time: string;
}

export interface FtpCreate {
    user: string;
    password: string;
    path: string;
    description: string;
}

export interface FtpUpdate {
    id: number;
    password: string;
    path: string;
    status?: string;
    description: string;
}

// ---------------- 病毒扫描 ----------------

export interface ClamBaseInfo {
    version: string;
    isActive: boolean;
    isExist: boolean;

    freshVersion: string;
    freshIsActive: boolean;
    freshIsExist: boolean;
}

export interface ClamInfo {
    id: number;
    createdAt: string;
    name: string;
    status: string;
    path: string;
    infectedStrategy: string;
    infectedDir: string;
    lastRecordStatus: string;
    lastRecordTime: string;
    spec: string;
    timeout: number;
    description: string;
    alertCount: number;
    alertMethod: string;
}

export interface ClamRecord {
    id: number;
    taskID: string;
    scanDate?: string;
    startTime: string;
    scanTime: string;
    infectedFiles: string;
    totalError: string;
    status: string;
    message: string;
}

export interface ClamCreate {
    name: string;
    status?: string;
    path: string;
    infectedStrategy: string;
    infectedDir: string;
    spec: string;
    timeout: number;
    description: string;
    alertCount?: number;
}

export interface ClamUpdate extends ClamCreate {
    id: number;
}

// ---------------- 通用设置 ----------------

export interface ToolboxSetting {
    lastCleanTime?: string;
    lastCleanSize?: string;
    lastCleanData?: string;
}

export const toolboxApi = baseApi.injectEndpoints({
    endpoints: (builder) => ({
        // -------- 系统设备 --------
        getDeviceBase: builder.query<DeviceBaseInfo, void>({
            query: () => ({ url: '/toolbox/device/base', method: 'POST', body: {} }),
            providesTags: ['Toolbox'],
        }),
        loadTimeZoneOptions: builder.query<string[], void>({
            query: () => ({ url: '/toolbox/device/zone/options' }),
        }),
        loadUsers: builder.query<string[], void>({
            query: () => ({ url: '/toolbox/device/users' }),
        }),
        updateDevice: builder.mutation<unknown, { key: string; value: string }>({
            query: (body) => ({ url: '/toolbox/device/update/conf', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        updateDeviceHost: builder.mutation<unknown, HostHelper[]>({
            query: (body) => ({ url: '/toolbox/device/update/host', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        updateDevicePasswd: builder.mutation<unknown, { user: string; passwd: string }>({
            query: (body) => ({
                url: '/toolbox/device/update/passwd',
                method: 'POST',
                body: { user: body.user, passwd: encodeBase64(body.passwd) },
            }),
            invalidatesTags: ['Toolbox'],
        }),
        updateDeviceSwap: builder.mutation<unknown, SwapHelper>({
            query: (body) => ({ url: '/toolbox/device/update/swap', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        checkDNS: builder.mutation<unknown, { key: string; value: string }>({
            query: (body) => ({ url: '/toolbox/device/check/dns', method: 'POST', body }),
        }),
        loadDeviceConf: builder.query<string, { name: 'DNS' | 'Hosts' }>({
            query: (body) => ({ url: '/toolbox/device/conf', method: 'POST', body }),
        }),
        updateDeviceConfByFile: builder.mutation<unknown, { name: 'DNS' | 'Hosts'; file: string }>({
            query: (body) => ({ url: '/toolbox/device/update/byconf', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),

        // -------- 系统清理 --------
        scanSystem: builder.mutation<CleanData, void>({
            query: () => ({ url: '/toolbox/scan', method: 'POST', body: {} }),
        }),
        cleanSystem: builder.mutation<unknown, CleanItem[]>({
            query: (body) => ({ url: '/toolbox/clean', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        getToolboxSetting: builder.query<ToolboxSetting, void>({
            query: () => ({ url: '/settings/search', method: 'POST', body: {} }),
            providesTags: ['Toolbox'],
        }),

        // -------- 入侵防御 --------
        getFail2banBase: builder.query<Fail2banBaseInfo, void>({
            query: () => ({ url: '/toolbox/fail2ban/base' }),
            providesTags: ['Toolbox'],
        }),
        searchFail2ban: builder.query<string[], { status: string }>({
            query: (body) => ({ url: '/toolbox/fail2ban/search', method: 'POST', body }),
        }),
        updateFail2ban: builder.mutation<unknown, Fail2banUpdate>({
            query: (body) => ({ url: '/toolbox/fail2ban/update', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        operateFail2ban: builder.mutation<unknown, { operation: string }>({
            query: (body) => ({ url: '/toolbox/fail2ban/operate', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        operateFail2banSSHD: builder.mutation<unknown, { ips: string[]; operate: string }>({
            query: (body) => ({ url: '/toolbox/fail2ban/operate/sshd', method: 'POST', body }),
        }),
        loadFail2banConf: builder.query<string, void>({
            query: () => ({ url: '/toolbox/fail2ban/load/conf' }),
        }),
        updateFail2banConfByFile: builder.mutation<unknown, { file: string }>({
            query: (body) => ({ url: '/toolbox/fail2ban/update/byconf', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),

        // -------- FTP --------
        getFtpBase: builder.query<FtpBaseInfo, void>({
            query: () => ({ url: '/toolbox/ftp/base' }),
            providesTags: ['Toolbox'],
        }),
        searchFtp: builder.query<PageResult<FtpInfo>, { page: number; pageSize: number; info: string }>({
            query: (body) => ({ url: '/toolbox/ftp/search', method: 'POST', body }),
            providesTags: ['Toolbox'],
        }),
        searchFtpLog: builder.query<PageResult<FtpLog>, { user: string; operation: string; page: number; pageSize: number }>({
            query: (body) => ({ url: '/toolbox/ftp/log/search', method: 'POST', body }),
        }),
        operateFtp: builder.mutation<unknown, { operation: string }>({
            query: (body) => ({ url: '/toolbox/ftp/operate', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        syncFtp: builder.mutation<unknown, void>({
            query: () => ({ url: '/toolbox/ftp/sync', method: 'POST' }),
            invalidatesTags: ['Toolbox'],
        }),
        createFtp: builder.mutation<unknown, FtpCreate>({
            query: (body) => ({
                url: '/toolbox/ftp',
                method: 'POST',
                body: { ...body, password: encodeBase64(body.password) },
            }),
            invalidatesTags: ['Toolbox'],
        }),
        updateFtp: builder.mutation<unknown, FtpUpdate>({
            query: (body) => ({
                url: '/toolbox/ftp/update',
                method: 'POST',
                body: { ...body, password: encodeBase64(body.password) },
            }),
            invalidatesTags: ['Toolbox'],
        }),
        deleteFtp: builder.mutation<unknown, { ids: number[] }>({
            query: (body) => ({ url: '/toolbox/ftp/del', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),

        // -------- 病毒扫描 --------
        getClamBase: builder.query<ClamBaseInfo, void>({
            query: () => ({ url: '/toolbox/clam/base', method: 'POST', body: {} }),
            providesTags: ['Toolbox'],
        }),
        searchClam: builder.query<PageResult<ClamInfo>, { page: number; pageSize: number; info: string }>({
            query: (body) => ({
                url: '/toolbox/clam/search',
                method: 'POST',
                body: { ...body, orderBy: 'createdAt', order: 'descending' },
            }),
            providesTags: ['Toolbox'],
        }),
        updateClamBaseInfo: builder.mutation<unknown, { operation: string }>({
            query: (body) => ({ url: '/toolbox/clam/operate', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        createClam: builder.mutation<unknown, ClamCreate>({
            query: (body) => ({ url: '/toolbox/clam', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        updateClam: builder.mutation<unknown, ClamUpdate>({
            query: (body) => ({ url: '/toolbox/clam/update', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        updateClamStatus: builder.mutation<unknown, { id: number; status: string }>({
            query: (body) => ({ url: '/toolbox/clam/status/update', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        deleteClam: builder.mutation<unknown, { ids: number[]; removeInfected: boolean }>({
            query: (body) => ({ url: '/toolbox/clam/del', method: 'POST', body }),
            invalidatesTags: ['Toolbox'],
        }),
        handleClamScan: builder.mutation<unknown, number>({
            query: (id) => ({ url: '/toolbox/clam/handle', method: 'POST', body: { id } }),
            invalidatesTags: ['Toolbox'],
        }),
        searchClamRecord: builder.query<PageResult<ClamRecord>, { page: number; pageSize: number; clamID: number; status: string }>({
            query: (body) => ({ url: '/toolbox/clam/record/search', method: 'POST', body }),
        }),
        cleanClamRecord: builder.mutation<unknown, number>({
            query: (id) => ({ url: '/toolbox/clam/record/clean', method: 'POST', body: { id } }),
        }),
        searchClamFile: builder.query<string, { name: string; tail: string }>({
            query: (body) => ({ url: '/toolbox/clam/file/search', method: 'POST', body }),
        }),
        updateClamFile: builder.mutation<unknown, { name: string; file: string }>({
            query: (body) => ({ url: '/toolbox/clam/file/update', method: 'POST', body }),
        }),
    }),
});

export const {
    useGetDeviceBaseQuery,
    useLoadTimeZoneOptionsQuery,
    useLoadUsersQuery,
    useUpdateDeviceMutation,
    useUpdateDeviceHostMutation,
    useUpdateDevicePasswdMutation,
    useUpdateDeviceSwapMutation,
    useCheckDNSMutation,
    useLoadDeviceConfQuery,
    useLazyLoadDeviceConfQuery,
    useUpdateDeviceConfByFileMutation,
    useScanSystemMutation,
    useCleanSystemMutation,
    useGetToolboxSettingQuery,
    useGetFail2banBaseQuery,
    useSearchFail2banQuery,
    useUpdateFail2banMutation,
    useOperateFail2banMutation,
    useOperateFail2banSSHDMutation,
    useLoadFail2banConfQuery,
    useLazyLoadFail2banConfQuery,
    useUpdateFail2banConfByFileMutation,
    useGetFtpBaseQuery,
    useSearchFtpLogQuery,
    useSearchFtpQuery,
    useOperateFtpMutation,
    useSyncFtpMutation,
    useCreateFtpMutation,
    useUpdateFtpMutation,
    useDeleteFtpMutation,
    useGetClamBaseQuery,
    useSearchClamQuery,
    useSearchClamRecordQuery,
    useCleanClamRecordMutation,
    useSearchClamFileQuery,
    useLazySearchClamFileQuery,
    useUpdateClamFileMutation,
    useUpdateClamBaseInfoMutation,
    useUpdateClamStatusMutation,
    useDeleteClamMutation,
    useHandleClamScanMutation,
    useCreateClamMutation,
    useUpdateClamMutation,
} = toolboxApi;
