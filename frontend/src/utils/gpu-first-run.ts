/**
 * Pure, provider-neutral summary of an existing authenticated GPU snapshot.
 * It never probes drivers or claims that the CUDA toolkit / torch works.
 */
export type GPUReadinessState = 'ready' | 'partial' | 'none' | 'unavailable';
export interface GPUReadinessSnapshot {
    gpu?: Array<{ type?: string }> | null;
    npu?: unknown[] | null;
    xpu?: unknown[] | null;
    warnings?: unknown;
    driverVersion?: unknown;
    cudaVersion?: unknown;
}
export interface GPUReadinessSummary {
    state: GPUReadinessState;
    devices: number;
    driver: string;
    cudaCompatibility: string;
}

const empty = (state: GPUReadinessState): GPUReadinessSummary => ({
    state,
    devices: 0,
    driver: '',
    cudaCompatibility: '',
});

function safeVersion(value: unknown): string {
    if (typeof value !== 'string') return '';
    const version = value.trim();
    return /^[0-9A-Za-z.+ -]{1,48}$/.test(version) ? version : '';
}

export function summarizeGPUReadiness(data?: GPUReadinessSnapshot | null): GPUReadinessSummary {
    if (!data || ![data.gpu, data.npu, data.xpu].some(Array.isArray)) return empty('unavailable');
    if ([data.gpu, data.npu, data.xpu].some((item) => item != null && !Array.isArray(item))) {
        return empty('unavailable');
    }
    const gpu = data.gpu || [];
    const npu = data.npu || [];
    const xpu = data.xpu || [];
    const nvidia = gpu.filter((item) => item?.type === 'nvidia').length;
    const conventionalGpu = gpu.filter((item) => item?.type === 'nvidia' || item?.type === 'amd').length;
    const legacyNpu = gpu.filter((item) => item?.type === 'ascend').length;
    const unexpected = gpu.some((item) => !['nvidia', 'amd', 'ascend'].includes(item?.type || ''));
    const malformedWarnings = data.warnings != null && !Array.isArray(data.warnings);
    const warnings = malformedWarnings || (Array.isArray(data.warnings) && data.warnings.length > 0);
    const devices = conventionalGpu + (npu.length || legacyNpu) + xpu.length;
    if (devices === 0) return empty(warnings || unexpected ? 'unavailable' : 'none');
    return {
        state: warnings || unexpected ? 'partial' : 'ready',
        devices,
        driver: nvidia > 0 ? safeVersion(data.driverVersion) : '',
        cudaCompatibility: nvidia > 0 ? safeVersion(data.cudaVersion) : '',
    };
}
