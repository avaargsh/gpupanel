<template>
    <section class="gpupanel-quickstart" :aria-label="$t('gpupanel.quickStart')">
        <div class="gpupanel-quickstart__heading">
            <div>
                <h2>{{ $t('gpupanel.quickStart') }}</h2>
                <p>{{ $t('gpupanel.quickStartDescription') }}</p>
            </div>
        </div>
        <div class="gpupanel-quickstart__grid">
            <el-card v-for="entry in visibleEntries" :key="entry.path" shadow="never" class="gpupanel-quickstart__card">
                <div class="gpupanel-quickstart__item">
                    <svg-icon :iconName="entry.icon" class="gpupanel-quickstart__icon" />
                    <span>{{ $t(entry.title) }}</span>
                    <el-button link type="primary" :aria-label="$t('gpupanel.openModule') + ' ' + $t(entry.title)"
                        @click="open(entry.path)">
                        {{ $t('gpupanel.openModule') }}
                    </el-button>
                </div>
            </el-card>
        </div>
    </section>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { hasRouteAccess } from '@/utils/rbac';

const router = useRouter();
const entries = [
    // Personal GPU workstation: start with useful existing Host and local AI pages.
    // No new installers or runtime behavior are introduced by these links.
    { path: '/ai/gpu/current', title: 'aiTools.gpu.gpu', icon: 'p-gpu-menu' },
    { path: '/hosts/monitor/monitor', title: 'menu.monitor', icon: 'p-system-monitor-menu' },
    { path: '/containers', title: 'menu.container', icon: 'p-docker1' },
    { path: '/hosts/files', title: 'menu.files', icon: 'p-file-menu' },
    { path: '/terminal', title: 'menu.terminal', icon: 'p-terminal2' },
    { path: '/ai/model/account', title: 'aiTools.model.model', icon: 'p-moxing-menu' },
    { path: '/apps/all', title: 'gpupanel.catalogNav', icon: 'p-appstore' },
    { path: '/hosts/disk', title: 'menu.disk', icon: 'p-disk-menu' },
] as const;

const canOpen = (path: string) => {
    const target = router.resolve(path);
    return target.matched.length > 0 && hasRouteAccess(target);
};
const visibleEntries = computed(() => entries.filter((entry) => canOpen(entry.path)));

const open = async (path: string) => {
    // Re-check at the click boundary; the router's own guard remains authoritative.
    if (canOpen(path)) {
        await router.push(path);
    }
};
</script>

<style scoped lang="scss">
.gpupanel-quickstart {
    border: 1px solid var(--el-border-color-light);
    border-radius: 10px;
    padding: 18px 20px;
    background: var(--el-bg-color);
    &__heading h2 { margin: 0; font-size: 17px; font-weight: 600; }
    &__heading p { margin: 7px 0 14px; font-size: 13px; color: var(--el-text-color-secondary); }
    &__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    &__card { min-width: 0; }
    &__item { display: flex; align-items: center; gap: 10px; min-width: 0; }
    &__item > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &__icon { font-size: 20px; }
    @media (max-width: 1024px) { &__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 620px) { &__grid { grid-template-columns: 1fr; } }
}
</style>
