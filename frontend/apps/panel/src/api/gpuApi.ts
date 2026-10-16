import { normalizeXpu } from '@/utils/accelerators';
import { baseApi } from '@/api/baseApi';

/**
 * GPU / 加速器信息 API —— 对齐 Agent 的 /api/v1/ai/gpu/load。
 *
 * 注意：Agent 目前提供的是**主机级**加速器快照（GPU / NPU / XPU 设备与进程），
 * 并不存在“单容器 GPU 绑定”接口。容器与 GPU 的分配关系属于后续
 * Workload / Scheduler / ComputePool 阶段的能力，这里先如实呈现主机级数据。
 */

export interface GpuProcess {
    pid: string;
    type: string;
    processName: string;
    usedMemory: string;
}

export interface GpuDevice {
    type: string;
    index: number;
    productName: string;
    uuid: string;
    busID: string;
    architecture: string;

    memoryFree: string;
    memoryReserved: string;
    memUsed: string;
    memTotal: string;

    gpuUtil: string;
    computeMode: string;
    migMode: string;
    performanceState: string;
    persistenceMode: string;

    temperature: string;
    memoryTemperature: string;
    hotspotTemperature: string;
    fanSpeed: string;
    fanRPM: string;

    powerDraw: string;
    powerLimit: string;
    maxPowerLimit: string;

    driverVersion: string;
    processes: GpuProcess[];
    [key: string]: unknown;
}

export interface GpuInfo {
    collectedAt: string;
    warnings: string[] | null;
    type: string;
    cudaVersion: string;
    driverVersion: string;
    xpuDriverVersion: string;
    gpu: GpuDevice[] | null;
    npu: GpuDevice[] | null;
    xpu: GpuDevice[] | null;
}

export const gpuApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        getGpuInfo: build.query<GpuInfo, void>({
            query: () => ({ url: '/ai/gpu/load', method: 'GET' }),
            transformResponse: (info: Omit<GpuInfo, 'xpu'> & { xpu: Parameters<typeof normalizeXpu>[0][] | null }): GpuInfo => ({
                ...info, xpu: (info.xpu ?? []).map(normalizeXpu),
            }),
            providesTags: ['GPU'],
        }),
    }),
});

export const { useGetGpuInfoQuery } = gpuApi;

/** 汇总各厂商加速器设备 */
export function allAccelerators(info: GpuInfo | undefined): GpuDevice[] {
    if (!info) return [];
    return [...(info.gpu ?? []), ...(info.npu ?? []), ...(info.xpu ?? [])];
}
