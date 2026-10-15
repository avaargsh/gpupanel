<template>
    <section class="gpupanel-first-run" :aria-label="$t('gpupanel.firstRunTitle')">
        <header class="gpupanel-first-run__header">
            <div>
                <h2>{{ $t('gpupanel.firstRunTitle') }}</h2>
                <p>{{ $t('gpupanel.firstRunDescription') }}</p>
            </div>
            <el-button v-if="canOpen('/containers')" link type="primary"
                :loading="dockerState === 'checking'" @click="refreshDocker">
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
                <el-text v-if="step.path === '/containers'" size="small" :type="dockerState === 'ready' ? 'success' : dockerState === 'unavailable' ? 'warning' : 'info'">
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
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { loadContainerStatus } from '@/api/modules/container';
import { useGlobalStore } from '@/composables/useGlobalStore';
import { hasRouteAccess } from '@/utils/rbac';
import i18n from '@/lang';

const router = useRouter();
const { currentNode } = useGlobalStore();
const steps = [
    { order: 1, path: '/hosts/monitor/monitor', title: 'gpupanel.hostStep', description: 'gpupanel.hostStepDesc' },
    { order: 2, path: '/containers', title: 'gpupanel.dockerStep', description: 'gpupanel.dockerStepDesc' },
    { order: 3, path: '/apps/all', title: 'gpupanel.appsStep', description: 'gpupanel.appsStepDesc' },
] as const;

const canOpen = (path: string) => {
    const target = router.resolve(path);
    return target.matched.length > 0 && hasRouteAccess(target);
};
const visibleSteps = computed(() => steps.filter((step) => canOpen(step.path)));
const dockerState = ref<'checking' | 'ready' | 'unavailable'>('checking');
const dockerRunning = ref(0);
const dockerMessage = computed(() => {
    if (dockerState.value === 'checking') return i18n.global.t('gpupanel.dockerChecking');
    if (dockerState.value === 'unavailable') return i18n.global.t('gpupanel.dockerUnavailable');
    return i18n.global.t('gpupanel.dockerReady', { count: dockerRunning.value });
});
let requestSerial = 0;
const refreshDocker = async () => {
    const serial = ++requestSerial;
    if (!canOpen('/containers')) {
        dockerState.value = 'unavailable';
        return;
    }
    dockerState.value = 'checking';
    try {
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
onMounted(() => { void refreshDocker(); });
watch(currentNode, () => { void refreshDocker(); });
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
    &__steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    &__step { min-width: 0; }
    &__step-title { display: flex; align-items: center; gap: 8px; }
    &__step-title strong { font-size: 14px; }
    &__number { width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
    &__step p { color: var(--el-text-color-secondary); font-size: 12px; min-height: 18px; }
    &__action { padding-top: 10px; }
    &__notice { color: var(--el-text-color-secondary); font-size: 12px; margin: 12px 0 0; }
    @media (max-width: 950px) { &__steps { grid-template-columns: 1fr; } }
}
</style>
