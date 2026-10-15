<template>
    <section class="gpupanel-first-run" :aria-label="$t('gpupanel.firstRunTitle')">
        <header class="gpupanel-first-run__header">
            <div>
                <h2>{{ $t('gpupanel.firstRunTitle') }}</h2>
                <p>{{ $t('gpupanel.firstRunDescription') }}</p>
            </div>
            <el-button v-if="canOpen('/containers') || canOpen('/ai/gpu/current')" link type="primary"
                :loading="dockerState === 'checking' || gpuState === 'checking'" @click="refreshEnvironment">
                {{ $t('gpupanel.checkAgain') }}
            </el-button>
        </header>
        <div class="gpupanel-first-run__steps">
            <el-card v-for="step in visibleSteps" :key="step.path" shadow="never"
                class="gpupanel-first-run__step">
                <div class="gpupanel-first-run__step-title">
                    <span class="gpupanel-first-run__number">{{ step.order }}</span>
                    <strong>{{ $t(step.title) }}</strong>
                </div>
                <p>{{ $t(step.description) }}</p>
                <el-text v-if="step.path === '/ai/gpu/current'" size="small"
                    :type="gpuState === 'ready' ? 'success' : gpuState === 'checking' ? 'info' : 'warning'">
                    {{ gpuMessage }}
                </el-text>
                <p v-if="step.path === '/ai/gpu/current' && gpuVersionHint" class="gpupanel-first-run__gpu-hint">
                    {{ gpuVersionHint }}
                </p>
                <el-text v-if="step.path === '/containers'" size="small" :type="dockerState === 'ready' ? 'success' : dockerState === 'checking' ? 'info' : 'warning'">
                    {{ dockerMessage }}
                </el-text>
                <div class="gpupanel-first-run__action">
                    <el-button link type="primary" :aria-label="$t('gpupanel.openModule') + ' ' + $t(step.title)"
                        @click="open(step.path)">{{ $t('gpupanel.openModule') }}</el-button>
                </div>
            </el-card>
        </div>
        <p v-if="!canOpen('/containers')" class="gpupanel-first-run__notice">
            {{ $t('gpupanel.dockerRestricted') }}
        </p>
        <p class="gpupanel-first-run__notice">{{ $t('gpupanel.firstRunNotice') }}</p>
    </section>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { loadContainerStatus, loadDockerStatus } from '@/api/modules/container';
import { loadGPUInfo } from '@/api/modules/ai';
import { summarizeGPUReadiness } from '@/utils/gpu-first-run';
import { useGlobalStore } from '@/composables/useGlobalStore';
import { hasRouteAccess } from '@/utils/rbac';
import i18n from '@/lang';

const router = useRouter();
const { currentNode } = useGlobalStore();
const steps = [
    { order: 1, path: '/hosts/monitor/monitor', title: 'gpupanel.hostStep', description: 'gpupanel.hostStepDesc' },
    { order: 2, path: '/ai/gpu/current', title: 'gpupanel.gpuStep', description: 'gpupanel.gpuStepDesc' },
    { order: 3, path: '/containers', title: 'gpupanel.dockerStep', description: 'gpupanel.dockerStepDesc' },
    { order: 4, path: '/apps/all', title: 'gpupanel.appsStep', description: 'gpupanel.appsStepDesc' },
] as const;

const canOpen = (path: string) => {
    const target = router.resolve(path);
    return target.matched.length > 0 && hasRouteAccess(target);
};
const visibleSteps = computed(() => steps.filter((step) => canOpen(step.path)));
const dockerState = ref<'checking' | 'ready' | 'unavailable' | 'missing' | 'stopped'>('checking');
const dockerRunning = ref(0);
const dockerMessage = computed(() => {
    if (dockerState.value === 'checking') return i18n.global.t('gpupanel.dockerChecking');
    if (dockerState.value === 'missing') return i18n.global.t('gpupanel.dockerNotInstalled');
    if (dockerState.value === 'stopped') return i18n.global.t('gpupanel.dockerNotRunning');
    if (dockerState.value === 'unavailable') return i18n.global.t('gpupanel.dockerUnavailable');
    return i18n.global.t('gpupanel.dockerReady', { count: dockerRunning.value });
});
// Reuse the existing authenticated accelerator collector. This is an observation
// of devices, NOT proof of CUDA toolkit, PyTorch or inference runtime readiness.
type GPUObservationState = 'checking' | 'ready' | 'partial' | 'none' | 'unavailable' | 'restricted';
const gpuState = ref<GPUObservationState>('checking');
const gpuDeviceCount = ref(0);
const gpuDriver = ref('');
const gpuCudaCapability = ref('');
let gpuRequestSerial = 0;
const gpuMessage = computed(() => {
    if (gpuState.value === 'checking') return i18n.global.t('gpupanel.gpuChecking');
    if (gpuState.value === 'restricted') return i18n.global.t('gpupanel.gpuRestricted');
    if (gpuState.value === 'none') return i18n.global.t('gpupanel.gpuNone');
    if (gpuState.value === 'unavailable') return i18n.global.t('gpupanel.gpuUnavailable');
    return i18n.global.t(gpuState.value === 'partial' ? 'gpupanel.gpuPartial' : 'gpupanel.gpuDetected', {
        count: gpuDeviceCount.value,
    });
});
const gpuVersionHint = computed(() => {
    if (gpuState.value !== 'ready' && gpuState.value !== 'partial') return '';
    if (!gpuDriver.value && !gpuCudaCapability.value) return '';
    return i18n.global.t('gpupanel.gpuDriverHint', {
        driver: gpuDriver.value || '-',
        cuda: gpuCudaCapability.value || '-',
    });
});
const refreshGPU = async () => {
    const serial = ++gpuRequestSerial;
    gpuDeviceCount.value = 0;
    gpuDriver.value = '';
    gpuCudaCapability.value = '';
    if (!canOpen('/ai/gpu/current')) {
        gpuState.value = 'restricted';
        return;
    }
    gpuState.value = 'checking';
    try {
        const res = await loadGPUInfo();
        if (serial !== gpuRequestSerial) return;
        const summary = summarizeGPUReadiness(res?.data);
        gpuDeviceCount.value = summary.devices;
        gpuDriver.value = summary.driver;
        gpuCudaCapability.value = summary.cudaCompatibility;
        gpuState.value = summary.state;
    } catch {
        if (serial === gpuRequestSerial) gpuState.value = 'unavailable';
    }
};

let requestSerial = 0;
const refreshDocker = async () => {
    const serial = ++requestSerial;
    if (!canOpen('/containers')) {
        dockerState.value = 'unavailable';
        return;
    }
    dockerState.value = 'checking';
    try {
        // The upstream container-count endpoint swallows some Docker list errors.
        // A successful list response alone must not be treated as daemon health.
        const daemon = await loadDockerStatus(currentNode.value || undefined);
        if (serial !== requestSerial) return;
        if (!daemon.data?.isExist) {
            dockerState.value = 'missing';
            return;
        }
        if (!daemon.data.isActive) {
            dockerState.value = 'stopped';
            return;
        }
        const response = await loadContainerStatus(currentNode.value || undefined);
        if (serial !== requestSerial) return;
        if (!Number.isFinite(response.data?.running) || response.data.running < 0) {
            dockerState.value = 'unavailable';
            return;
        }
        dockerRunning.value = response.data.running;
        dockerState.value = 'ready';
    } catch {
        if (serial === requestSerial) dockerState.value = 'unavailable';
    }
};
const open = async (path: string) => {
    // Frontend visibility is advisory. Backend permissions remain authoritative.
    if (canOpen(path)) await router.push(path);
};
const refreshEnvironment = () => {
    void refreshGPU();
    void refreshDocker();
};
onMounted(refreshEnvironment);
watch(currentNode, refreshEnvironment);
onBeforeUnmount(() => {
    ++gpuRequestSerial;
    ++requestSerial;
});
</script>

<style scoped lang="scss">
.gpupanel-first-run {
    padding: 18px 20px;
    border: 1px solid var(--el-border-color-light);
    border-radius: 10px;
    background: var(--el-bg-color);
    &__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    &__header h2 { font-size: 17px; font-weight: 600; margin: 0; }
    &__header p { color: var(--el-text-color-secondary); font-size: 13px; margin: 6px 0 14px; }
    &__steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    &__step { min-width: 0; }
    &__step-title { display: flex; align-items: center; gap: 8px; }
    &__step-title strong { font-size: 14px; }
    &__number { width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
    &__step p { color: var(--el-text-color-secondary); font-size: 12px; min-height: 18px; }
    &__action { padding-top: 10px; }
    &__notice { color: var(--el-text-color-secondary); font-size: 12px; margin: 12px 0 0; }
    &__gpu-hint { color: var(--el-text-color-secondary); font-size: 11px; margin: 5px 0 0; overflow-wrap: anywhere; }
    @media (max-width: 1200px) { &__steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 650px) { &__steps { grid-template-columns: 1fr; } }
}
</style>
