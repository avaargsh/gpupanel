import { baseApi } from '@/api/baseApi';

export interface OsInfo {
    os: string;
    arch: string;
    kernelVersion: string;
    hostname: string;
    kernel?: string;
    platform?: string;
}

export interface BaseInfo {
    cpuUsedPercent: number;
    memoryUsedPercent: number;
    diskUsedPercent: number;
    load1: number;
    load5: number;
    load15: number;
    timeSinceUptime: string;
    cpuTotal: number;
    memoryTotal: number;
    diskTotal: number;
    [key: string]: unknown;
}

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
            providesTags: ['Dashboard'],
        }),
        getBaseInfo: build.query<BaseInfo, { ioOption?: string; netOption?: string } | void>({
            query: (arg) => {
                const io = arg?.ioOption ?? 'all';
                const net = arg?.netOption ?? 'all';
                return { url: `/dashboard/base/${io}/${net}`, method: 'GET' };
            },
            providesTags: ['Dashboard'],
        }),
        getQuickOptions: build.query<QuickJump[], void>({
            query: () => ({ url: '/dashboard/quick/option', method: 'GET' }),
            providesTags: ['Dashboard'],
        }),
    }),
});

export const { useGetOsInfoQuery, useGetBaseInfoQuery, useGetQuickOptionsQuery } = dashboardApi;
