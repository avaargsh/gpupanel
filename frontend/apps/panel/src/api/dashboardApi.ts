import { baseApi } from '@/api/baseApi';
import { normalizeDashboard, normalizeOsInfo } from '@/utils/dashboard';

export type OsInfo = ReturnType<typeof normalizeOsInfo>;
export type BaseInfo = ReturnType<typeof normalizeDashboard>;

export interface QuickJump {
    id: number;
    name: string;
    title: string;
    icon?: string;
    detail: string;
    link?: string;
}

export const dashboardApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getOsInfo: build.query<OsInfo, void>({
            query: () => ({ url: '/dashboard/base/os', method: 'GET' }),
            transformResponse: normalizeOsInfo,
            providesTags: ['Dashboard'],
        }),
        getBaseInfo: build.query<BaseInfo, { ioOption?: string; netOption?: string } | void>({
            query: (arg) => {
                const io = arg?.ioOption ?? 'all';
                const net = arg?.netOption ?? 'all';
                return { url: `/dashboard/base/${io}/${net}`, method: 'GET' };
            },
            transformResponse: normalizeDashboard,
            providesTags: ['Dashboard'],
        }),
        getQuickOptions: build.query<QuickJump[], void>({
            query: () => ({ url: '/dashboard/quick/option', method: 'GET' }),
            providesTags: ['Dashboard'],
        }),
    }),
});

export const { useGetOsInfoQuery, useGetBaseInfoQuery, useGetQuickOptionsQuery } = dashboardApi;
