import { baseApi } from '@/api/baseApi';
import { encodeBase64 } from '@/utils/base64';

/** 分页响应（后端通用封套内的 data） */
export interface PageResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}

/** SSH 主机（用于列表展示） */
export interface Host {
    id: number;
    name: string;
    groupID: number;
    groupBelong: string;
    addr: string;
    port: number;
    user: string;
    authMode: string;
    password: string;
    privateKey: string;
    passPhrase: string;
    rememberPassword: boolean;
    description: string;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: unknown;
}

/** 新建/编辑主机表单载荷 */
export interface HostOperate {
    isLocal: boolean;
    id: number;
    name: string;
    groupID: number;
    addr: string;
    port: number;
    user: string;
    authMode: 'password' | 'key';
    password: string;
    privateKey: string;
    passPhrase: string;
    rememberPassword: boolean;
    description: string;
}

/** 主机连接测试载荷 */
export type HostConnTest = Partial<HostOperate> & { isLocal: boolean };

export interface HostSearchParams {
    page?: number;
    pageSize?: number;
    info?: string;
    groupID?: number;
}

/** 监控时序数据（/hosts/monitor/search 返回的数组元素） */
export interface MonitorSeries {
    param: string;
    date: string[];
    value: Array<Record<string, any>>;
}

export interface MonitorSearchParams {
    param: string;
    io?: string;
    network?: string;
    startTime: string;
    endTime: string;
}

/** 终端会话（持久会话列表） */
export interface TerminalSession {
    id: string;
    kind: 'local' | 'ssh' | 'container';
    title: string;
    hostId: number;
    persistent: boolean;
    attached: boolean;
    createdAt: string;
    detachedAt: string;
    [key: string]: unknown;
}

/** 身份字段与旧前端一致：写操作前做一次 UTF-8 Base64 编码 */
function encodeHostSecrets<T extends { password?: string; privateKey?: string; passPhrase?: string }>(body: T): T {
    return {
        ...body,
        password: body.password ? encodeBase64(body.password) : '',
        privateKey: body.privateKey ? encodeBase64(body.privateKey) : '',
        passPhrase: body.passPhrase ? encodeBase64(body.passPhrase) : '',
    };
}

export const hostApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        // ---------- 主机列表 / CRUD ----------
        searchHosts: build.query<PageResult<Host>, HostSearchParams | void>({
            query: (params) => ({
                url: '/hosts/search',
                method: 'POST',
                body: {
                    groupID: params?.groupID ?? 0,
                    page: params?.page ?? 1,
                    pageSize: params?.pageSize ?? 20,
                    info: params?.info ?? '',
                },
            }),
            providesTags: ['Host'],
        }),
        getHostByID: build.query<Host, number>({
            query: (id) => ({ url: '/hosts/info', method: 'POST', body: { id } }),
            providesTags: ['Host'],
        }),
        createHost: build.mutation<Host, HostOperate>({
            query: (body) => ({ url: '/hosts', method: 'POST', body: encodeHostSecrets(body) }),
            invalidatesTags: ['Host'],
        }),
        updateHost: build.mutation<Host, HostOperate>({
            query: (body) => ({ url: '/hosts/update', method: 'POST', body: encodeHostSecrets(body) }),
            invalidatesTags: ['Host'],
        }),
        deleteHost: build.mutation<void, number[]>({
            query: (ids) => ({ url: '/hosts/del', method: 'POST', body: { ids } }),
            invalidatesTags: ['Host'],
        }),
        testHostByID: build.mutation<boolean, number>({
            query: (id) => ({ url: '/hosts/test/byid', method: 'POST', body: { id } }),
        }),
        testHostByInfo: build.mutation<boolean, HostConnTest>({
            query: (body) => ({ url: '/hosts/test/byinfo', method: 'POST', body: encodeHostSecrets(body) }),
        }),

        // ---------- 监控 ----------
        monitorSearch: build.query<MonitorSeries[], MonitorSearchParams>({
            query: (body) => ({ url: '/hosts/monitor/search', method: 'POST', body }),
        }),
        getNetworkOptions: build.query<string[], void>({
            query: () => ({ url: '/hosts/monitor/netoptions', method: 'GET' }),
        }),
        getIOOptions: build.query<string[], void>({
            query: () => ({ url: '/hosts/monitor/iooptions', method: 'GET' }),
        }),

        // ---------- 终端会话 ----------
        searchTerminalSessions: build.query<TerminalSession[], void>({
            query: () => ({ url: '/hosts/terminal/sessions/search', method: 'POST', body: {} }),
            providesTags: ['Host'],
        }),
        closeTerminalSession: build.mutation<void, { id: string }>({
            query: ({ id }) => ({ url: '/hosts/terminal/sessions/close', method: 'POST', body: { id } }),
        }),
        closeAllTerminalSessions: build.mutation<void, void>({
            query: () => ({ url: '/hosts/terminal/sessions/closeAll', method: 'POST', body: {} }),
        }),
    }),
});

export const {
    useSearchHostsQuery,
    useGetHostByIDQuery,
    useCreateHostMutation,
    useUpdateHostMutation,
    useDeleteHostMutation,
    useTestHostByIDMutation,
    useTestHostByInfoMutation,
    useMonitorSearchQuery,
    useGetNetworkOptionsQuery,
    useGetIOOptionsQuery,
    useSearchTerminalSessionsQuery,
    useCloseTerminalSessionMutation,
    useCloseAllTerminalSessionsMutation,
} = hostApi;