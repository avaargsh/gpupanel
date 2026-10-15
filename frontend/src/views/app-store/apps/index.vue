<template>
    <LayoutContent :title="$t('gpupanel.catalogNav')" class="gpupanel-catalog">
        <template #search>
            <el-tag type="info" effect="plain">{{ $t('gpupanel.catalogPreview') }}</el-tag>
        </template>
        <template #rightToolBar>
            <el-input v-model="keyword" clearable :placeholder="$t('gpupanel.catalogSearchPlaceholder')"
                :aria-label="$t('gpupanel.catalogSearchPlaceholder')" style="max-width: 280px" />
        </template>
        <template #main>
            <el-alert v-if="legacyInstallRequested" type="warning" :closable="false"
                :title="$t('gpupanel.catalogLegacyInstallLink')" show-icon class="gpupanel-catalog__notice" />
            <el-alert type="info" :closable="false" :title="$t('gpupanel.catalogNotice')"
                show-icon class="gpupanel-catalog__notice" />
            <div class="gpupanel-catalog__actions">
                <el-button type="primary" plain :disabled="!canOpen('/apps/installed')"
                    @click="navigate('/apps/installed')">{{ $t('gpupanel.catalogInstalled') }}</el-button>
                <el-button plain :disabled="!canOpen('/containers/compose')"
                    @click="navigate('/containers/compose')">{{ $t('gpupanel.catalogCompose') }}</el-button>
            </div>
            <div v-if="visibleDefinitions.length" class="gpupanel-catalog__grid">
                <el-card v-for="item in visibleDefinitions" :key="item.id" shadow="never">
                    <div class="gpupanel-catalog__header">
                        <strong>{{ item.name }}</strong>
                        <el-tag :type="item.status === 'experimental' ? 'warning' : 'info'" size="small">
                            {{ item.status === 'experimental' ? $t('gpupanel.catalogExperimental') : $t('gpupanel.catalogPlanned') }}
                        </el-tag>
                    </div>
                    <p>{{ item.description }}</p>
                    <div class="gpupanel-catalog__metadata">
                        <span>{{ item.kind }}</span>
                        <el-tag v-for="target in item.targets" :key="target" size="small" effect="plain">
                            {{ target }}
                        </el-tag>
                    </div>
                    <el-button disabled class="gpupanel-catalog__install">
                        {{ $t('gpupanel.catalogUnavailable') }}
                    </el-button>
                </el-card>
            </div>
            <el-empty v-else :description="$t('gpupanel.catalogNoMatch')" />
        </template>
    </LayoutContent>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { hasRouteAccess } from '@/utils/rbac';
// The repository-root index is the single source of truth; no copied/mutable
// frontend list that can drift from validated catalog/index.json.
import catalogIndex from '../../../../../catalog/index.json';

const router = useRouter();
const route = useRoute();
const keyword = ref('');
const legacyInstallRequested = computed(() => typeof route.query.install === 'string');
const visibleDefinitions = computed(() => {
    const needle = keyword.value.trim().toLocaleLowerCase();
    return catalogIndex.definitions.filter((item) =>
        !needle || [item.name, item.description, item.kind, item.id, ...item.targets]
            .some((field) => field.toLocaleLowerCase().includes(needle)),
    );
});
const canOpen = (path: string) => {
    const target = router.resolve(path);
    return target.matched.length > 0 && hasRouteAccess(target);
};
const navigate = async (path: string) => {
    if (canOpen(path)) await router.push(path);
};
</script>

<style lang="scss" scoped>
.gpupanel-catalog {
    &__notice { margin: 0 0 14px; }
    &__actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; }
    &__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    &__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    &__header strong { font-size: 15px; }
    &__grid p { font-size: 13px; color: var(--el-text-color-secondary); min-height: 48px; }
    &__metadata { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); }
    &__install { margin-top: 16px; width: 100%; }
    @media (max-width: 1024px) { &__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 680px) { &__grid { grid-template-columns: 1fr; } }
}
</style>
