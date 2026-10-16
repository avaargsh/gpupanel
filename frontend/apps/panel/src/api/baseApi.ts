import {
    createApi,
    fetchBaseQuery,
    type BaseQueryFn,
    type FetchArgs,
    type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { RootState } from '@/store';
import { clearCredentials } from '@/features/auth/authSlice';
import { getCookie } from '@/utils/cookie';

/** 后端统一响应信封：{ code, message, data } */
export interface ResultEnvelope<T = unknown> {
    code: number;
    message: string;
    errorCode?: string;
    data: T;
}

/** 后端成功码（对应旧前端 ResultEnum.SUCCESS） */
export const SUCCESS_CODE = 200;

const rawBaseQuery = fetchBaseQuery({
    baseUrl: import.meta.env.VITE_API_URL || '/api/v1',
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
        const state = getState() as RootState;
        if (!headers.has('Accept-Language')) {
            headers.set('Accept-Language', state.ui.language || 'zh');
        }
        const node = state.ui.currentNode;
        if (node && !headers.has('CurrentNode')) {
            headers.set('CurrentNode', encodeURIComponent(node));
        }
        const csrf = getCookie('pcsrftoken');
        if (csrf) {
            headers.set('X-CSRF-Token', csrf);
        }
        return headers;
    },
});

/**
 * 在 fetchBaseQuery 之上解包 { code, message, data }：
 * - code === 200 → 返回 data
 * - 其它 → 作为错误抛出（便于页面统一提示）
 * - HTTP 401 → 清理登录态
 */
export const baseQueryWithEnvelope: BaseQueryFn<
    string | FetchArgs,
    unknown,
    FetchBaseQueryError
> = async (args, api, extraOptions) => {
    const result = await rawBaseQuery(args, api, extraOptions);

    if (result.error) {
        if (result.error.status === 401) {
            api.dispatch(clearCredentials());
        }
        return result;
    }

    const envelope = result.data as ResultEnvelope | undefined;
    if (envelope && typeof envelope === 'object' && 'code' in envelope) {
        if (envelope.code !== SUCCESS_CODE) {
            return {
                error: {
                    status: envelope.code,
                    data: envelope,
                } as FetchBaseQueryError,
            };
        }
        return { data: envelope.data };
    }

    return result;
};

export const baseApi = createApi({
    reducerPath: 'api',
    baseQuery: baseQueryWithEnvelope,
    tagTypes: ['Auth', 'Dashboard', 'Host', 'Container', 'ContainerImage', 'GPU', 'Database', 'Website', 'App', 'AI', 'Cronjob', 'Script', 'Toolbox', 'Log', 'Setting', 'Project'],
    refetchOnReconnect: true,
    endpoints: () => ({}),
});
